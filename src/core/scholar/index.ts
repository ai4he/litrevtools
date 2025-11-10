/**
 * Main Google Scholar extraction orchestrator
 */

import { SearchParameters, Paper, SearchProgress, ProgressCallback, PaperCallback } from '../types';
import { LitRevDatabase } from '../database';
import { TorPoolManager } from './tor-manager';
import { ParallelScholarScraper, GoogleScholarScraper } from './scraper';

export class ScholarExtractor {
  private database: LitRevDatabase;
  private torPool?: TorPoolManager;
  private sessionId?: string;
  private isRunning: boolean = false;
  private startTime?: number;
  private onProgress?: ProgressCallback;
  private onPaper?: PaperCallback;

  constructor(
    database: LitRevDatabase,
    useTor: boolean = true,
    parallelCount: number = 3
  ) {
    this.database = database;

    if (useTor) {
      this.torPool = new TorPoolManager(parallelCount);
    }
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
      nextTask: 'Checking Tor availability',
      progress: 5
    });

    try {
      // Check Tor availability if enabled
      if (this.torPool) {
        this.updateProgress({
          currentTask: 'Checking Tor availability',
          nextTask: 'Preparing search queries',
          progress: 10
        });

        const isTorAvailable = await this.torPool.isAnyAvailable();
        if (!isTorAvailable) {
          console.warn('Tor is not available, continuing without Tor');
          this.torPool = undefined;
        }
      }

      // Determine year range
      const currentYear = new Date().getFullYear();
      const startYear = parameters.startYear || 2000;
      const endYear = parameters.endYear || currentYear;
      const years = this.generateYearRange(startYear, endYear);

      this.updateProgress({
        currentTask: 'Preparing parallel search',
        nextTask: `Searching ${years.length} years in parallel`,
        progress: 15
      });

      // Execute parallel search
      await this.executeParallelSearch(parameters, years);

      // Apply exclusion filters
      await this.applyExclusionFilters(parameters.exclusionKeywords);

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

    if (this.torPool) {
      // Use parallel scraper with Tor
      this.updateProgress({
        currentTask: 'Starting parallel search with Tor',
        nextTask: 'Extracting papers from Google Scholar',
        progress: 20
      });

      const parallelScraper = new ParallelScholarScraper(
        3, // parallel count
        this.torPool,
        {
          useTor: true,
          headless: true,
          screenshotEnabled: true
        }
      );

      try {
        const result = await parallelScraper.searchByYears(
          parameters.inclusionKeywords,
          years,
          maxResultsPerYear
        );

        // Process papers
        for (const paper of result.papers) {
          this.database.addPaper(this.sessionId!, paper);
          if (this.onPaper) {
            this.onPaper(paper);
          }
        }

        // Update progress with latest screenshot
        if (result.screenshots.length > 0) {
          this.updateProgress({
            screenshot: result.screenshots[result.screenshots.length - 1]
          });
        }

        this.updateProgress({
          currentTask: 'Papers extracted successfully',
          nextTask: 'Applying exclusion filters',
          progress: 80,
          totalPapers: result.papers.length
        });
      } finally {
        await parallelScraper.closeAll();
      }
    } else {
      // Use single scraper without Tor
      this.updateProgress({
        currentTask: 'Starting search without Tor',
        nextTask: 'Extracting papers from Google Scholar',
        progress: 20
      });

      const scraper = new GoogleScholarScraper({
        useTor: false,
        headless: true,
        screenshotEnabled: true
      });

      try {
        await scraper.initialize();

        let allPapers: Paper[] = [];

        for (let i = 0; i < years.length; i++) {
          const year = years[i];

          this.updateProgress({
            currentTask: `Searching year ${year}`,
            nextTask: i < years.length - 1 ? `Next: year ${years[i + 1]}` : 'Finalizing search',
            progress: 20 + (60 * (i + 1) / years.length),
            currentYear: year
          });

          const result = await scraper.search(
            parameters.inclusionKeywords,
            year,
            maxResultsPerYear
          );

          allPapers.push(...result.papers);

          // Save papers incrementally
          for (const paper of result.papers) {
            this.database.addPaper(this.sessionId!, paper);
            if (this.onPaper) {
              this.onPaper(paper);
            }
          }

          if (result.screenshot) {
            this.updateProgress({ screenshot: result.screenshot });
          }

          // Delay between years
          await this.delay(3000);
        }

        this.updateProgress({
          currentTask: 'Papers extracted successfully',
          nextTask: 'Applying exclusion filters',
          progress: 80,
          totalPapers: allPapers.length
        });
      } finally {
        await scraper.close();
      }
    }
  }

  /**
   * Apply exclusion filters to papers
   */
  private async applyExclusionFilters(exclusionKeywords: string[]): Promise<void> {
    if (!this.sessionId) return;

    this.updateProgress({
      currentTask: 'Applying exclusion filters',
      nextTask: 'Finalizing results',
      progress: 90
    });

    const papers = this.database.getPapers(this.sessionId);
    const exclusionReasons: Record<string, number> = {};

    for (const paper of papers) {
      const excluded = this.shouldExclude(paper, exclusionKeywords);

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
  }

  /**
   * Check if a paper should be excluded
   */
  private shouldExclude(paper: Paper, exclusionKeywords: string[]): string | null {
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
        this.onProgress(session.progress);
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
}
