/**
 * Core module - Isomorphic business logic
 * This module can be used across CLI, Web, Desktop, and Mobile platforms
 */

import { LitRevDatabase } from './database';
import { ScholarExtractor } from './scholar';
import { GeminiService } from './gemini';
import { OutputManager } from './outputs';
import {
  AppConfig,
  SearchParameters,
  SearchSession,
  SearchProgress,
  Paper,
  ProgressCallback,
  PaperCallback,
  ErrorCallback
} from './types';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

export class LitRevTools {
  private config: AppConfig;
  private database: LitRevDatabase;
  private gemini: GeminiService;
  private outputManager: OutputManager;
  private scholarExtractor?: ScholarExtractor;

  constructor(config?: Partial<AppConfig>) {
    // Build configuration
    this.config = this.buildConfig(config);

    // Initialize core services
    this.database = new LitRevDatabase(this.config.database.path);
    this.gemini = new GeminiService(this.config.gemini);
    this.outputManager = new OutputManager(
      this.database,
      this.gemini,
      this.config.outputDir
    );
  }

  /**
   * Start a new literature review search
   */
  async startSearch(
    parameters: SearchParameters,
    callbacks?: {
      onProgress?: ProgressCallback;
      onPaper?: PaperCallback;
      onError?: ErrorCallback;
    }
  ): Promise<string> {
    try {
      // Initialize scholar extractor
      this.scholarExtractor = new ScholarExtractor(
        this.database,
        true, // use Tor
        this.config.maxParallelRequests
      );

      // Start the search
      const sessionId = await this.scholarExtractor.startSearch(
        parameters,
        callbacks?.onProgress,
        callbacks?.onPaper
      );

      // Generate outputs as they become available
      await this.outputManager.generateIncremental(sessionId);

      return sessionId;
    } catch (error) {
      if (callbacks?.onError) {
        callbacks.onError(error as Error);
      }
      throw error;
    }
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
  async generateOutputs(sessionId: string): Promise<void> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Only generate if search is completed
    if (session.progress.status === 'completed') {
      await this.outputManager.generateAll(sessionId);
    } else {
      // Generate incremental outputs
      await this.outputManager.generateIncremental(sessionId);
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
   * Pause an ongoing search
   */
  pauseSearch(): void {
    if (this.scholarExtractor) {
      this.scholarExtractor.pause();
    }
  }

  /**
   * Resume a paused search
   */
  resumeSearch(): void {
    if (this.scholarExtractor) {
      this.scholarExtractor.resume();
    }
  }

  /**
   * Stop an ongoing search
   */
  stopSearch(): void {
    if (this.scholarExtractor) {
      this.scholarExtractor.stop();
    }
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
    const defaultConfig: AppConfig = {
      database: {
        path: process.env.DATABASE_PATH || './data/litrevtools.db'
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
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
