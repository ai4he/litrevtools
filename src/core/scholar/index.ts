/**
 * Main Scholar extraction orchestrator
 * Uses Semantic Scholar API for paper search
 */

import { SearchParameters, Paper, SearchProgress, ProgressCallback, PaperCallback } from '../types';
import { LitRevDatabase } from '../database';
import { SemanticScholarService } from './semantic-scholar';
import { LLMService } from '../llm';

export class ScholarExtractor {
  private database: LitRevDatabase;
  private sessionId?: string;
  private isRunning: boolean = false;
  private startTime?: number;
  private onProgress?: ProgressCallback;
  private onPaper?: PaperCallback;
  private llmService?: LLMService;

  constructor(database: LitRevDatabase) {
    this.database = database;
  }

  /**
   * Start a new search session
   */
  async startSearch(
    parameters: SearchParameters,
    onProgress?: ProgressCallback,
    onPaper?: PaperCallback
  ): Promise<string> {
    if (this.isRunning) {
      throw new Error('A search is already running');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.onProgress = onProgress;
    this.onPaper = onPaper;

    // Create session
    this.sessionId = this.database.createSession(parameters);

    // Update progress
    this.updateProgress({
      status: 'running',
      currentTask: 'Initializing search',
      nextTask: 'Preparing Semantic Scholar search',
      progress: 5
    });

    try {
      // Determine year range
      const currentYear = new Date().getFullYear();
      const startYear = parameters.startYear || 2000;
      const endYear = parameters.endYear || currentYear;
      const years = this.generateYearRange(startYear, endYear);

      this.updateProgress({
        currentTask: 'Preparing search',
        nextTask: `Searching ${years.length} years`,
        progress: 15
      });

      // Execute parallel search
      await this.executeParallelSearch(parameters, years);

      // Initialize LLM service if enabled
      if (parameters.llmConfig?.enabled) {
        this.updateProgress({
          currentTask: 'Initializing LLM service',
          nextTask: 'Applying intelligent filters',
          progress: 82
        });

        this.llmService = new LLMService(parameters.llmConfig);
        await this.llmService.initialize();
      }

      // Apply exclusion filters (LLM-based or rule-based)
      await this.applyFilters(parameters);

      // Mark as completed
      this.updateProgress({
        status: 'completed',
        currentTask: 'Search completed',
        nextTask: 'Ready for PRISMA analysis',
        progress: 100
      });

      return this.sessionId;
    } catch (error) {
      this.updateProgress({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute parallel search across years
   */
  private async executeParallelSearch(
    parameters: SearchParameters,
    years: number[]
  ): Promise<void> {
    if (!this.sessionId) throw new Error('No active session');

    const maxResultsPerYear = parameters.maxResults
      ? Math.ceil(parameters.maxResults / years.length)
      : undefined;

    // Use Semantic Scholar API (preferred method)
    this.updateProgress({
      currentTask: 'Starting Semantic Scholar API search',
      nextTask: 'Fetching papers from Semantic Scholar',
      progress: 20
    });

    const semanticScholar = new SemanticScholarService();
    let allPapers: Paper[] = [];
    let totalFetched = 0; // Track total papers fetched across all years

    try {
      for (let i = 0; i < years.length; i++) {
        const year = years[i];

        this.updateProgress({
          currentTask: `Searching Semantic Scholar for year ${year}`,
          nextTask: i < years.length - 1 ? `Next: year ${years[i + 1]}` : 'Finalizing search',
          progress: 20 + (60 * (i + 1) / years.length),
          currentYear: year
        });

        const targetResults = maxResultsPerYear || 100;
        const maxPerRequest = 100; // Semantic Scholar API limit
        let offset = 0;
        let fetchedForYear = 0;

        // Paginate if needed
        while (fetchedForYear < targetResults) {
          const limit = Math.min(maxPerRequest, targetResults - fetchedForYear);

          const result = await semanticScholar.search({
            query: parameters.inclusionKeywords.join(' '),
            year,
            limit,
            offset
          });

          allPapers.push(...result.papers);
          totalFetched += result.papers.length;

          // Save papers incrementally
          for (const paper of result.papers) {
            this.database.addPaper(this.sessionId!, paper);
            if (this.onPaper) {
              this.onPaper(paper, this.sessionId!);
            }
          }

          fetchedForYear += result.papers.length;
          offset += result.papers.length;

          console.log(`Year ${year}: Found ${fetchedForYear}/${result.total} papers`);

          // Stop if no more results available
          if (!result.hasMore || result.papers.length === 0) {
            break;
          }
        }
      }

      // Calculate duplicates: fetched total vs unique papers in database
      const uniquePapers = this.database.getPapers(this.sessionId!);
      const duplicateCount = totalFetched - uniquePapers.length;

      console.log(`Total fetched: ${totalFetched}, Unique papers: ${uniquePapers.length}, Duplicates: ${duplicateCount}`);

      this.updateProgress({
        currentTask: 'Papers extracted successfully',
        nextTask: 'Applying exclusion filters',
        progress: 80,
        totalPapers: uniquePapers.length,
        duplicateCount
      });
    } catch (error) {
      console.error('Semantic Scholar search failed:', error);
      throw new Error(`Failed to search Semantic Scholar: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply filters to papers (LLM-based or rule-based)
   */
  private async applyFilters(parameters: SearchParameters): Promise<void> {
    if (!this.sessionId) return;

    const papers = this.database.getPapers(this.sessionId);

    // Use LLM-based filtering if enabled and initialized
    if (this.llmService?.isEnabled()) {
      await this.applyLLMFilters(papers, parameters);
    } else {
      // Fall back to rule-based filtering
      await this.applyRuleBasedFilters(papers, parameters.exclusionKeywords);
    }
  }

  /**
   * Apply LLM-based semantic filtering
   */
  private async applyLLMFilters(papers: Paper[], parameters: SearchParameters): Promise<void> {
    if (!this.sessionId || !this.llmService) return;

    this.updateProgress({
      currentTask: 'Applying LLM-based semantic filters',
      nextTask: 'Processing papers with AI',
      progress: 85
    });

    try {
      // Use LLM for semantic filtering
      const filteredPapers = await this.llmService.semanticFilter(
        papers,
        parameters.inclusionKeywords,
        parameters.exclusionKeywords
      );

      // Save updated papers to database
      for (const paper of filteredPapers) {
        this.database.addPaper(this.sessionId, paper);
      }

      // Update PRISMA data
      const exclusionReasons: Record<string, number> = {};
      const excludedPapers = filteredPapers.filter(p => !p.included);

      for (const paper of excludedPapers) {
        const reason = paper.exclusionReason || 'LLM semantic exclusion';
        exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
      }

      const totalPapers = papers.length;
      const excludedCount = excludedPapers.length;
      const includedCount = totalPapers - excludedCount;

      this.database.updatePRISMAData(this.sessionId, {
        identification: {
          recordsIdentified: totalPapers,
          recordsRemoved: 0
        },
        screening: {
          recordsScreened: totalPapers,
          recordsExcluded: excludedCount,
          reasonsForExclusion: exclusionReasons
        },
        included: {
          studiesIncluded: includedCount
        }
      });

      this.updateProgress({
        currentTask: 'LLM filtering completed',
        nextTask: 'Finalizing results',
        progress: 95,
        totalPapers,
        includedPapers: includedCount,
        excludedPapers: excludedCount,
        processedPapers: totalPapers
      });
    } catch (error) {
      console.error('LLM filtering failed, falling back to rule-based filtering:', error);

      // Fall back to rule-based filtering if LLM fails
      await this.applyRuleBasedFilters(papers, parameters.exclusionKeywords);
    }
  }

  /**
   * Apply rule-based exclusion filters
   */
  private async applyRuleBasedFilters(papers: Paper[], exclusionKeywords: string[]): Promise<void> {
    if (!this.sessionId) return;

    this.updateProgress({
      currentTask: 'Applying rule-based exclusion filters',
      nextTask: 'Finalizing results',
      progress: 90
    });

    const exclusionReasons: Record<string, number> = {};

    for (const paper of papers) {
      const excluded = this.shouldExcludeByRules(paper, exclusionKeywords);

      if (excluded) {
        const reason = excluded;
        exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;

        // Update paper as excluded
        const updatedPaper: Paper = {
          ...paper,
          included: false,
          exclusionReason: reason
        };

        this.database.addPaper(this.sessionId, updatedPaper);
      } else {
        // Update paper as included
        const updatedPaper: Paper = {
          ...paper,
          included: true,
          exclusionReason: undefined
        };

        this.database.addPaper(this.sessionId, updatedPaper);
      }
    }

    // Update PRISMA data
    const totalPapers = papers.length;
    const excludedCount = Object.values(exclusionReasons).reduce((a, b) => a + b, 0);
    const includedCount = totalPapers - excludedCount;

    this.database.updatePRISMAData(this.sessionId, {
      identification: {
        recordsIdentified: totalPapers,
        recordsRemoved: 0
      },
      screening: {
        recordsScreened: totalPapers,
        recordsExcluded: excludedCount,
        reasonsForExclusion: exclusionReasons
      },
      included: {
        studiesIncluded: includedCount
      }
    });

    // Update progress with paper counts
    this.updateProgress({
      totalPapers,
      includedPapers: includedCount,
      excludedPapers: excludedCount,
      processedPapers: totalPapers
    });
  }

  /**
   * Check if a paper should be excluded using rule-based approach
   */
  private shouldExcludeByRules(paper: Paper, exclusionKeywords: string[]): string | null {
    const searchText = `${paper.title} ${paper.abstract || ''}`.toLowerCase();

    for (const keyword of exclusionKeywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        return `Contains excluded keyword: ${keyword}`;
      }
    }

    return null;
  }

  /**
   * Update search progress
   */
  private updateProgress(progress: Partial<SearchProgress>): void {
    if (!this.sessionId) return;

    const timeElapsed = this.startTime ? Date.now() - this.startTime : 0;

    const fullProgress: Partial<SearchProgress> = {
      ...progress,
      timeElapsed
    };

    // Calculate estimated time remaining
    if (progress.progress && progress.progress > 0 && progress.progress < 100) {
      const estimatedTotal = (timeElapsed / progress.progress) * 100;
      fullProgress.estimatedTimeRemaining = estimatedTotal - timeElapsed;
    }

    this.database.updateProgress(this.sessionId, fullProgress);

    if (this.onProgress) {
      const session = this.database.getSession(this.sessionId);
      if (session) {
        this.onProgress(session.progress, this.sessionId);
      }
    }
  }

  /**
   * Generate year range
   */
  private generateYearRange(startYear: number, endYear: number): number[] {
    const years: number[] = [];
    for (let year = endYear; year >= startYear; year--) {
      years.push(year);
    }
    return years;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Pause the current search
   */
  pause(): void {
    // TODO: Implement pause functionality
  }

  /**
   * Resume a paused search
   */
  resume(): void {
    // TODO: Implement resume functionality
  }

  /**
   * Stop the current search
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Identify categories for papers in a session using LLM
   */
  async identifyCategories(sessionId: string, llmConfig?: any): Promise<void> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Initialize LLM service if not already initialized
    if (!this.llmService) {
      this.llmService = new LLMService(llmConfig);
      await this.llmService.initialize();
    }

    if (!this.llmService.isEnabled()) {
      throw new Error('LLM service is not enabled. Category identification requires LLM.');
    }

    // Get papers that are included
    const includedPapers = session.papers.filter(p => p.included);

    if (includedPapers.length === 0) {
      throw new Error('No included papers to categorize');
    }

    // Use LLM to identify categories
    const categorizedPapers = await this.llmService.identifyCategories(includedPapers);

    // Update papers in database
    for (const paper of categorizedPapers) {
      this.database.addPaper(sessionId, paper);
    }
  }

  /**
   * Generate a draft literature review paper using LLM
   */
  async generateDraftPaper(sessionId: string, llmConfig?: any): Promise<string> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Initialize LLM service if not already initialized
    if (!this.llmService) {
      this.llmService = new LLMService(llmConfig);
      await this.llmService.initialize();
    }

    if (!this.llmService.isEnabled()) {
      throw new Error('LLM service is not enabled. Draft generation requires LLM.');
    }

    // Get included papers
    const includedPapers = session.papers.filter(p => p.included);

    if (includedPapers.length === 0) {
      throw new Error('No included papers to generate draft from');
    }

    // Generate topic from search parameters
    const topic = session.parameters.name || session.parameters.inclusionKeywords.join(', ');

    // Generate draft using LLM
    const draft = await this.llmService.generateDraftPaper(
      includedPapers,
      topic,
      session.parameters.inclusionKeywords
    );

    return draft;
  }

  /**
   * Get LLM usage statistics
   */
  getLLMUsageStats() {
    return this.llmService?.getUsageStats() || null;
  }
}
