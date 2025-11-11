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
  private currentParameters?: SearchParameters;

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
      // If no time range is provided at all, search without year filter (all results)
      let years: number[] | undefined;

      if (parameters.startYear !== undefined || parameters.endYear !== undefined) {
        const currentYear = new Date().getFullYear();
        const startYear = parameters.startYear || 2000;
        const endYear = parameters.endYear || currentYear;
        years = this.generateYearRange(startYear, endYear);

        this.updateProgress({
          currentTask: 'Preparing search',
          nextTask: `Searching ${years.length} years`,
          progress: 15
        });
      } else {
        // No year range specified - search all years
        this.updateProgress({
          currentTask: 'Preparing search',
          nextTask: 'Searching all years',
          progress: 15
        });
      }

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
   * Start a new search session (non-blocking version)
   * Returns sessionId immediately after initialization, before search executes
   */
  async startSearchNonBlocking(
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
    this.currentParameters = parameters;

    // Create session
    this.sessionId = this.database.createSession(parameters);

    // Update progress
    this.updateProgress({
      status: 'running',
      currentTask: 'Initializing search',
      nextTask: 'Preparing Semantic Scholar search',
      progress: 5
    });

    return this.sessionId;
  }

  /**
   * Execute the search in the background (to be called after startSearchNonBlocking)
   */
  async executeSearchInBackground(): Promise<void> {
    if (!this.sessionId || !this.currentParameters) {
      throw new Error('Search not initialized. Call startSearchNonBlocking first.');
    }

    console.log(`[ScholarExtractor] Starting background search for session: ${this.sessionId}`);

    const parameters = this.currentParameters;

    try {
      // Determine year range
      // If no time range is provided at all, search without year filter (all results)
      let years: number[] | undefined;

      if (parameters.startYear !== undefined || parameters.endYear !== undefined) {
        const currentYear = new Date().getFullYear();
        const startYear = parameters.startYear || 2000;
        const endYear = parameters.endYear || currentYear;
        years = this.generateYearRange(startYear, endYear);

        this.updateProgress({
          currentTask: 'Preparing search',
          nextTask: `Searching ${years.length} years`,
          progress: 15
        });
      } else {
        // No year range specified - search all years
        this.updateProgress({
          currentTask: 'Preparing search',
          nextTask: 'Searching all years',
          progress: 15
        });
      }

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
      console.log(`[ScholarExtractor] Background search completed successfully for session: ${this.sessionId}`);
      this.updateProgress({
        status: 'completed',
        currentTask: 'Search completed',
        nextTask: 'Ready for PRISMA analysis',
        progress: 100
      });
    } catch (error) {
      console.error(`[ScholarExtractor] Background search error for session ${this.sessionId}:`, error);
      this.updateProgress({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0
      });
      throw error;
    } finally {
      console.log(`[ScholarExtractor] Cleaning up background search for session: ${this.sessionId}`);
      this.isRunning = false;
      this.currentParameters = undefined;
    }
  }

  /**
   * Execute parallel search across years
   */
  private async executeParallelSearch(
    parameters: SearchParameters,
    years: number[] | undefined
  ): Promise<void> {
    if (!this.sessionId) throw new Error('No active session');

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
      // If no year range is specified, search without year filter
      if (!years) {
        await this.searchWithoutYearFilter(parameters, semanticScholar);
        return;
      }

      const maxResultsPerYear = parameters.maxResults
        ? Math.ceil(parameters.maxResults / years.length)
        : undefined;

      for (let i = 0; i < years.length; i++) {
        const year = years[i];

        this.updateProgress({
          currentTask: `Searching Semantic Scholar for year ${year}`,
          nextTask: i < years.length - 1 ? `Next: year ${years[i + 1]}` : 'Finalizing search',
          progress: 20 + (60 * (i + 1) / years.length),
          currentYear: year
        });

        const maxPerRequest = 100; // Semantic Scholar API limit
        let offset = 0;
        let fetchedForYear = 0;

        // Paginate if needed
        // If maxResultsPerYear is undefined, fetch all available papers
        while (true) {
          const limit = maxResultsPerYear
            ? Math.min(maxPerRequest, maxResultsPerYear - fetchedForYear)
            : maxPerRequest;

          const result = await semanticScholar.search({
            query: parameters.inclusionKeywords.join(' '),
            year,
            limit,
            offset
          });

          // Filter by date (month/day) if specified
          let papersToAdd = result.papers;
          if (parameters.startMonth || parameters.endMonth || parameters.startDay || parameters.endDay) {
            papersToAdd = this.filterPapersByDate(result.papers, parameters.startMonth, parameters.endMonth, parameters.startDay, parameters.endDay, year, years[0], years[years.length - 1]);
          }

          allPapers.push(...papersToAdd);
          totalFetched += papersToAdd.length;

          // Save papers incrementally
          for (const paper of papersToAdd) {
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

          // Stop if we've reached the target for this year (when limit is specified)
          if (maxResultsPerYear && fetchedForYear >= maxResultsPerYear) {
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
   * Search without year filter - fetches all available papers
   */
  private async searchWithoutYearFilter(
    parameters: SearchParameters,
    semanticScholar: SemanticScholarService
  ): Promise<void> {
    if (!this.sessionId) throw new Error('No active session');

    this.updateProgress({
      currentTask: 'Searching Semantic Scholar (all years)',
      nextTask: 'Fetching papers',
      progress: 30
    });

    const maxPerRequest = 100; // Semantic Scholar API limit
    const maxResults = parameters.maxResults; // undefined means fetch all
    let offset = 0;
    let totalFetched = 0;

    // Paginate through all results
    while (true) {
      const limit = maxResults
        ? Math.min(maxPerRequest, maxResults - totalFetched)
        : maxPerRequest;

      const result = await semanticScholar.search({
        query: parameters.inclusionKeywords.join(' '),
        // No year filter - search all years
        limit,
        offset
      });

      // Filter by month if specified (though this is less meaningful without year context)
      let papersToAdd = result.papers;
      if (parameters.startMonth || parameters.endMonth) {
        console.warn('Month filtering without year range may produce unexpected results');
        // When no year range is specified, we can't effectively filter by month
        // So we'll just include all papers
      }

      totalFetched += papersToAdd.length;

      // Save papers incrementally
      for (const paper of papersToAdd) {
        this.database.addPaper(this.sessionId!, paper);
        if (this.onPaper) {
          this.onPaper(paper, this.sessionId!);
        }
      }

      offset += result.papers.length;

      console.log(`Found ${totalFetched}/${result.total} papers (all years)`);

      this.updateProgress({
        currentTask: `Fetching papers (${totalFetched}/${result.total})`,
        nextTask: 'Continuing search',
        progress: 20 + Math.min(60, (totalFetched / result.total) * 60)
      });

      // Stop if no more results available
      if (!result.hasMore || result.papers.length === 0) {
        break;
      }

      // Stop if we've reached the max results (when limit is specified)
      if (maxResults && totalFetched >= maxResults) {
        break;
      }
    }

    // Calculate duplicates
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
  }

  /**
   * Filter papers by date (year, month, and day) based on publication date
   */
  private filterPapersByDate(
    papers: Paper[],
    startMonth: number | undefined,
    endMonth: number | undefined,
    startDay: number | undefined,
    endDay: number | undefined,
    currentYear: number,
    firstYear: number,
    lastYear: number
  ): Paper[] {
    // If no date filtering is specified, return all papers
    if (!startMonth && !endMonth && !startDay && !endDay) {
      return papers;
    }

    return papers.filter(paper => {
      // If paper doesn't have a publication date, include it conservatively
      if (!paper.publicationDate) {
        return true;
      }

      try {
        // Parse the publication date (format: YYYY-MM-DD or YYYY-MM or YYYY)
        const dateParts = paper.publicationDate.split('-');
        const pubYear = parseInt(dateParts[0]);
        const pubMonth = dateParts.length > 1 ? parseInt(dateParts[1]) : undefined;
        const pubDay = dateParts.length > 2 ? parseInt(dateParts[2]) : undefined;

        // If we can't determine the month, include the paper conservatively
        if (!pubMonth) {
          return true;
        }

        // For the first year of the range
        if (currentYear === firstYear && (startMonth || startDay)) {
          if (pubYear === firstYear) {
            // Check month filter
            if (startMonth && pubMonth < startMonth) {
              return false;
            }
            // Check day filter (only if we're in the start month)
            if (startMonth && pubMonth === startMonth && startDay && pubDay) {
              return pubDay >= startDay;
            }
            // If we passed month check but no day filter, or we're past the start month
            return true;
          }
        }

        // For the last year of the range
        if (currentYear === lastYear && (endMonth || endDay)) {
          if (pubYear === lastYear) {
            // Check month filter
            if (endMonth && pubMonth > endMonth) {
              return false;
            }
            // Check day filter (only if we're in the end month)
            if (endMonth && pubMonth === endMonth && endDay && pubDay) {
              return pubDay <= endDay;
            }
            // If we passed month check but no day filter, or we're before the end month
            return true;
          }
        }

        // For years in between, include all papers
        return true;
      } catch (error) {
        // If there's any error parsing the date, include the paper conservatively
        console.warn(`Error parsing publication date for paper: ${paper.title}`, error);
        return true;
      }
    });
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
