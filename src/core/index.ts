/**
 * Core module - Isomorphic business logic
 * This module can be used across CLI, Web, Desktop, and Mobile platforms
 */

import { LitRevDatabase } from './database';
import { ScholarExtractor } from './scholar';
import { GeminiService } from './gemini';
import { OutputManager } from './outputs';
import { LLMService, LLMFilteringProgress } from './llm/llm-service';
import { ResumeManager } from './resume-manager';
import {
  AppConfig,
  SearchParameters,
  SearchSession,
  SearchProgress,
  OutputProgress,
  Paper,
  ProgressCallback,
  PaperCallback,
  ErrorCallback,
  ResumeMetadata,
  Step1ResumeMetadata,
  Step2ResumeMetadata,
  Step3ResumeMetadata
} from './types';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

export class LitRevTools {
  private config: AppConfig;
  private database: LitRevDatabase;
  private gemini: GeminiService;
  private outputManager: OutputManager;
  private scholarExtractor?: ScholarExtractor;
  private llmService?: LLMService;
  private resumeManager: ResumeManager;

  constructor(config?: Partial<AppConfig>) {
    // Build configuration
    this.config = this.buildConfig(config);

    // Initialize core services
    this.database = new LitRevDatabase(this.config.database.path);
    this.gemini = new GeminiService(this.config.gemini);
    this.outputManager = new OutputManager(
      this.database,
      this.gemini,
      this.config.outputDir,
      this.config.gemini.paperBatchSize
    );
    this.resumeManager = new ResumeManager(this.config.outputDir);
  }

  /**
   * Start a new literature review search
   * Returns the sessionId immediately and runs the search in the background
   */
  async startSearch(
    parameters: SearchParameters,
    callbacks?: {
      onProgress?: ProgressCallback;
      onPaper?: PaperCallback;
      onError?: ErrorCallback;
    }
  ): Promise<string> {
    // Initialize scholar extractor
    this.scholarExtractor = new ScholarExtractor(this.database);

    // Start the search and get sessionId immediately (before the search completes)
    const sessionId = await this.scholarExtractor.startSearchNonBlocking(
      parameters,
      callbacks?.onProgress,
      callbacks?.onPaper
    );

    console.log(`[LitRevTools] Search initialized with sessionId: ${sessionId}, starting background execution...`);

    // Add a small delay to ensure the client has time to subscribe to WebSocket
    // before the background task starts sending events
    const extractor = this.scholarExtractor;
    setTimeout(() => {
      console.log(`[LitRevTools] Starting background search for session: ${sessionId}`);

      // Run the search in the background without awaiting
      extractor.executeSearchInBackground().then(async () => {
        console.log(`[LitRevTools] Background search completed for session: ${sessionId}, generating outputs...`);
        // Generate outputs after search completes
        try {
          await this.outputManager.generateIncremental(sessionId);
          console.log(`[LitRevTools] Outputs generated successfully for session: ${sessionId}`);
        } catch (error) {
          console.error(`[LitRevTools] Error generating outputs for session ${sessionId}:`, error);
          if (callbacks?.onError) {
            callbacks.onError(error as Error, sessionId);
          }
        }
      }).catch((error) => {
        console.error(`[LitRevTools] Search error for session ${sessionId}:`, error);
        if (callbacks?.onError) {
          callbacks.onError(error as Error, sessionId);
        }
      });
    }, 100); // 100ms delay to allow client to subscribe

    return sessionId;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): SearchSession | null {
    return this.database.getSession(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SearchSession[] {
    return this.database.getAllSessions();
  }

  /**
   * Generate all outputs for a session
   */
  async generateOutputs(sessionId: string, onProgress?: (progress: OutputProgress) => void): Promise<void> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Only generate if search is completed
    if (session.progress.status === 'completed') {
      await this.outputManager.generateAll(sessionId, onProgress);
    } else {
      // Generate incremental outputs
      await this.outputManager.generateIncremental(sessionId);
    }
  }

  /**
   * Generate all outputs for a session with a specific data source
   * @param sessionId - The session ID
   * @param dataSource - Which papers to use: 'step1' (original), 'step2' (filtered), or 'current' (default)
   * @param onProgress - Progress callback
   */
  async generateOutputsWithDataSource(
    sessionId: string,
    dataSource: 'step1' | 'step2' | 'current',
    onProgress?: (progress: OutputProgress) => void
  ): Promise<void> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Select the appropriate papers based on data source
    let papers: Paper[];
    if (dataSource === 'step1' && session.originalPapers && session.originalPapers.length > 0) {
      papers = session.originalPapers;
    } else if (dataSource === 'step2' || dataSource === 'current') {
      papers = session.papers;
    } else {
      // Fallback to current papers if original papers not available
      papers = session.papers;
    }

    // Temporarily update the session papers to generate outputs with the selected data source
    const originalPapers = [...session.papers];
    try {
      // Clear current papers and add selected papers
      for (const paper of papers) {
        this.database.addPaper(sessionId, paper);
      }

      // Generate outputs
      await this.outputManager.generateAll(sessionId, onProgress);
    } finally {
      // Restore original papers
      for (const paper of originalPapers) {
        this.database.addPaper(sessionId, paper);
      }
    }
  }

  /**
   * Generate PRISMA paper content using Gemini
   */
  async generatePRISMAPaper(sessionId: string): Promise<{
    abstract: string;
    introduction: string;
    methodology: string;
    results: string;
    discussion: string;
    conclusion: string;
  }> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const papers = session.papers.filter(p => p.included);

    const [abstract, introduction, methodology, results, discussion, conclusion] =
      await Promise.all([
        this.gemini.generateAbstract(
          papers,
          session.parameters.inclusionKeywords,
          session.prismaData
        ),
        this.gemini.generateIntroduction(papers, session.parameters.inclusionKeywords),
        this.gemini.generateMethodology(
          session.parameters.inclusionKeywords,
          session.parameters.inclusionKeywords,
          session.parameters.exclusionKeywords,
          session.prismaData
        ),
        this.gemini.generateResults(papers),
        this.gemini.generateDiscussion(papers, session.parameters.inclusionKeywords),
        this.gemini.generateConclusion(papers, session.parameters.inclusionKeywords)
      ]);

    return {
      abstract,
      introduction,
      methodology,
      results,
      discussion,
      conclusion
    };
  }

  /**
   * Apply semantic filtering to a session's papers
   * Creates a new LLM service instance with the provided API key
   */
  async applySemanticFiltering(
    sessionId: string,
    inclusionPrompt?: string,
    exclusionPrompt?: string,
    onProgress?: (progress: LLMFilteringProgress) => void,
    batchSize?: number,
    model?: string
  ): Promise<void> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Store original papers if not already stored (for Step 3 data source selection)
    if (!session.originalPapers || session.originalPapers.length === 0) {
      this.database.setOriginalPapers(sessionId, [...session.papers]);
    }

    // Create LLM service - will use .env API keys with rotation
    this.llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: model || 'gemini-2.0-flash-exp', // Use specified model or default
      batchSize: batchSize || 20, // Use configurable batch size, default to 20
      maxConcurrentBatches: 5,
      timeout: 30000,
      retryAttempts: 3,
      temperature: 0.3,
      fallbackStrategy: 'rule_based',
      enableKeyRotation: true
    });

    // Initialize the LLM service
    await this.llmService.initialize();

    // Reset control flags for new filtering session
    this.llmService.resetControlFlags();

    // Apply semantic filtering with progress tracking
    const filteredPapers = await this.llmService.semanticFilterSeparate(
      session.papers,
      inclusionPrompt,
      exclusionPrompt,
      onProgress
    );

    // Update the session's papers in the database
    for (const paper of filteredPapers) {
      this.database.addPaper(sessionId, paper);
    }

    // Update session to mark semantic filtering as complete
    // This could be stored in session metadata if needed
  }

  /**
   * Pause an ongoing search (Step 1)
   */
  pauseSearch(): void {
    if (this.scholarExtractor) {
      this.scholarExtractor.pause();
    }
  }

  /**
   * Resume a paused search (Step 1)
   */
  resumeSearch(): void {
    if (this.scholarExtractor) {
      this.scholarExtractor.resume();
    }
  }

  /**
   * Stop an ongoing search (Step 1)
   */
  stopSearch(): void {
    if (this.scholarExtractor) {
      this.scholarExtractor.stop();
    }
  }

  /**
   * Pause semantic filtering (Step 2)
   */
  pauseSemanticFiltering(): void {
    if (this.llmService) {
      this.llmService.pause();
    }
  }

  /**
   * Resume semantic filtering (Step 2)
   */
  resumeSemanticFiltering(): void {
    if (this.llmService) {
      this.llmService.resume();
    }
  }

  /**
   * Stop semantic filtering (Step 2)
   */
  stopSemanticFiltering(): void {
    if (this.llmService) {
      this.llmService.stop();
    }
  }

  /**
   * Pause output generation (Step 3)
   */
  pauseOutputGeneration(): void {
    if (this.outputManager) {
      this.outputManager.pause();
    }
  }

  /**
   * Resume output generation (Step 3)
   */
  resumeOutputGeneration(): void {
    if (this.outputManager) {
      this.outputManager.resume();
    }
  }

  /**
   * Stop output generation (Step 3)
   */
  stopOutputGeneration(): void {
    if (this.outputManager) {
      this.outputManager.stop();
    }
  }

  /**
   * Generate progress ZIP for Step 1 (in-progress search)
   */
  async generateStep1ProgressZip(sessionId: string, lastOffset: number): Promise<string> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionDir = path.join(this.config.outputDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Generate CSV file
    const csvPath = path.join(sessionDir, 'papers-progress.csv');
    const { CSVGenerator } = await import('./outputs/csv-generator');
    const csvGen = new CSVGenerator();
    await csvGen.generateRawExtractions(session.papers, csvPath);

    // Generate metadata
    const metadata = this.resumeManager.generateStep1Metadata(
      session,
      session.progress,
      lastOffset
    );

    // Create ZIP
    const zipPath = path.join(sessionDir, 'step1-progress.zip');
    await this.resumeManager.createProgressZip(sessionId, csvPath, metadata, zipPath);

    return zipPath;
  }

  /**
   * Generate progress ZIP for Step 2 (in-progress filtering)
   */
  async generateStep2ProgressZip(
    sessionId: string,
    parameters: {
      inclusionPrompt?: string;
      exclusionPrompt?: string;
      batchSize: number;
      model: string;
    },
    progress: {
      totalPapers: number;
      processedPapers: number;
      currentBatch: number;
      totalBatches: number;
    }
  ): Promise<string> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionDir = path.join(this.config.outputDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Generate labeled CSV file
    const csvPath = path.join(sessionDir, 'papers-labeled-progress.csv');
    const { CSVGenerator } = await import('./outputs/csv-generator');
    const csvGen = new CSVGenerator();
    await csvGen.generateLabeledExtractions(session.papers, csvPath);

    // Generate metadata
    const metadata = this.resumeManager.generateStep2Metadata(
      sessionId,
      undefined, // sourceStep1SessionId
      parameters,
      progress,
      !!session.originalPapers,
      session.createdAt
    );

    // Create ZIP
    const zipPath = path.join(sessionDir, 'step2-progress.zip');
    await this.resumeManager.createProgressZip(sessionId, csvPath, metadata, zipPath);

    return zipPath;
  }

  /**
   * Generate progress ZIP for Step 3 (in-progress output generation)
   */
  async generateStep3ProgressZip(
    sessionId: string,
    parameters: {
      dataSource: 'step1' | 'step2' | 'upload';
      model: string;
      batchSize: number;
      latexPrompt?: string;
    },
    progress: OutputProgress,
    completedOutputs: {
      csv: boolean;
      bibtex: boolean;
      latex: boolean;
      prismaDiagram: boolean;
      prismaTable: boolean;
      zip: boolean;
    }
  ): Promise<string> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionDir = path.join(this.config.outputDir, sessionId);

    // Use the main CSV file
    const csvPath = path.join(sessionDir, 'papers-labeled.csv');

    // Generate metadata
    const metadata = this.resumeManager.generateStep3Metadata(
      sessionId,
      undefined, // sourceStep2SessionId
      undefined, // sourceStep1SessionId
      parameters,
      progress,
      completedOutputs,
      session.createdAt
    );

    // Create ZIP
    const zipPath = path.join(sessionDir, 'step3-progress.zip');
    await this.resumeManager.createProgressZip(sessionId, csvPath, metadata, zipPath);

    return zipPath;
  }

  /**
   * Extract and validate ZIP contents
   */
  async extractResumeZip(zipPath: string): Promise<{
    metadata: ResumeMetadata;
    papers: Paper[];
    tempDir: string;
  }> {
    const { csvPath, metadata, tempDir } = await this.resumeManager.extractZipContents(zipPath);
    const papers = await this.resumeManager.parseCsvToPapers(csvPath);

    return { metadata, papers, tempDir };
  }

  /**
   * Resume Step 1 from ZIP
   */
  async resumeStep1FromZip(
    zipPath: string,
    callbacks?: {
      onProgress?: ProgressCallback;
      onPaper?: PaperCallback;
      onError?: ErrorCallback;
    }
  ): Promise<string> {
    const { metadata, papers, tempDir } = await this.extractResumeZip(zipPath);

    if (metadata.step !== 1) {
      throw new Error('Invalid ZIP: expected Step 1 metadata');
    }

    const step1Metadata = metadata as Step1ResumeMetadata;

    // Create new session with restored parameters and papers
    const newSessionId = await this.startSearch(step1Metadata.parameters, callbacks);
    const session = this.database.getSession(newSessionId);

    if (session) {
      // Add previously extracted papers
      for (const paper of papers) {
        this.database.addPaper(newSessionId, paper);
      }

      // Update PRISMA data
      this.database.updatePRISMAData(newSessionId, step1Metadata.prismaData);
    }

    // Clean up temp directory
    this.resumeManager.cleanupTempDir(tempDir);

    console.log(`[LitRevTools] Resumed Step 1 from ZIP. New session: ${newSessionId}, Restored ${papers.length} papers`);

    return newSessionId;
  }

  /**
   * Resume Step 2 from ZIP
   */
  async resumeStep2FromZip(
    zipPath: string,
    onProgress?: (progress: LLMFilteringProgress) => void
  ): Promise<string> {
    const { metadata, papers, tempDir } = await this.extractResumeZip(zipPath);

    if (metadata.step !== 2) {
      throw new Error('Invalid ZIP: expected Step 2 metadata');
    }

    const step2Metadata = metadata as Step2ResumeMetadata;

    // Create new session with papers
    const newSessionId = `step2_${Date.now()}`;
    // TODO: Create session and add papers
    // For now, throw error indicating this needs implementation
    throw new Error('Step 2 resume not yet fully implemented');
  }

  /**
   * Resume Step 3 from ZIP
   */
  async resumeStep3FromZip(
    zipPath: string,
    onProgress?: (progress: OutputProgress) => void
  ): Promise<string> {
    const { metadata, papers, tempDir } = await this.extractResumeZip(zipPath);

    if (metadata.step !== 3) {
      throw new Error('Invalid ZIP: expected Step 3 metadata');
    }

    const step3Metadata = metadata as Step3ResumeMetadata;

    // Create new session with papers
    const newSessionId = `step3_${Date.now()}`;
    // TODO: Create session and add papers, then resume generation
    // For now, throw error indicating this needs implementation
    throw new Error('Step 3 resume not yet fully implemented');
  }

  /**
   * Get configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.database.close();
  }

  /**
   * Build configuration from environment and overrides
   */
  private buildConfig(overrides?: Partial<AppConfig>): AppConfig {
    // Get Gemini API keys - only GEMINI_API_KEYS is supported
    let geminiApiKeys: string[] | undefined;

    if (process.env.GEMINI_API_KEYS) {
      // Multiple keys provided - use all of them
      geminiApiKeys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
      console.log(`[Config] Loaded ${geminiApiKeys.length} Gemini API key(s) from GEMINI_API_KEYS`);
    } else {
      console.warn('[Config] No GEMINI_API_KEYS found in environment. LaTeX generation and LLM features will not work.');
      geminiApiKeys = undefined;
    }

    const defaultConfig: AppConfig = {
      database: {
        path: process.env.DATABASE_PATH || './data/litrevtools.db'
      },
      gemini: {
        apiKey: geminiApiKeys?.[0], // First key for backward compatibility
        apiKeys: geminiApiKeys,
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
        paperBatchSize: parseInt(process.env.PAPER_BATCH_SIZE || '15')
      },
      googleAuth: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
      },
      tor: {
        socksPort: parseInt(process.env.TOR_SOCKS_PORT || '9050'),
        controlPort: parseInt(process.env.TOR_CONTROL_PORT || '9051'),
        password: process.env.TOR_PASSWORD
      },
      maxParallelRequests: parseInt(process.env.MAX_PARALLEL_REQUESTS || '3'),
      screenshotEnabled: process.env.SCREENSHOT_ENABLED !== 'false',
      outputDir: process.env.OUTPUT_DIR || './data/outputs'
    };

    return {
      ...defaultConfig,
      ...overrides,
      database: { ...defaultConfig.database, ...overrides?.database },
      gemini: { ...defaultConfig.gemini, ...overrides?.gemini },
      googleAuth: { ...defaultConfig.googleAuth, ...overrides?.googleAuth },
      tor: { ...defaultConfig.tor, ...overrides?.tor }
    };
  }
}

// Export all types and submodules
export * from './types';
export * from './config';
export { LitRevDatabase } from './database';
export { GeminiService } from './gemini';
export { ScholarExtractor } from './scholar';
export { OutputManager, CSVGenerator, BibTeXGenerator, LaTeXGenerator } from './outputs';
export { ResumeManager } from './resume-manager';
