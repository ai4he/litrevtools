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
  private isPaused: boolean = false;
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

    // Track failed batches for retry
    interface FailedBatch {
      year: number;
      offset: number;
      limit: number;
      attempts: number;
      lastError: string;
    }
    const failedBatches: FailedBatch[] = [];
    const maxBatchRetries = 5; // Maximum retries per batch after initial failure

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
        let consecutiveEmptyResults = 0; // Track empty results to detect stuck loops
        const maxConsecutiveEmpty = 3; // Stop after 3 consecutive empty results

        // Paginate if needed
        // If maxResultsPerYear is undefined, fetch all available papers
        while (true) {
          // Wait while paused
          while (this.isPaused) {
            console.log(`[ScholarExtractor] Search paused at year ${year}, offset ${offset}`);
            this.updateProgress({
              currentTask: `⏸️  Search paused at year ${year}`,
              nextTask: `Waiting to resume`,
              progress: 20 + (60 * (i + fetchedForYear / Math.max(1, maxResultsPerYear || 1000)) / years.length),
              currentYear: year
            });
            await this.delay(1000); // Check every second
          }

          // Check if stopped
          if (!this.isRunning) {
            console.log('[ScholarExtractor] Search stopped during year iteration');
            return;
          }

          const limit = maxResultsPerYear
            ? Math.min(maxPerRequest, maxResultsPerYear - fetchedForYear)
            : maxPerRequest;

          // Update status before each API call
          this.updateProgress({
            currentTask: `Year ${year}: Fetching papers (offset ${offset}, got ${fetchedForYear} so far)`,
            nextTask: `Processing batch of ${limit} papers`,
            progress: 20 + (60 * (i + fetchedForYear / Math.max(1, maxResultsPerYear || 1000)) / years.length),
            currentYear: year
          });

          try {
            const result = await semanticScholar.search(
              {
                query: parameters.inclusionKeywords.join(' '),
                year,
                limit,
                offset
              },
              0, // retryCount
              3, // maxRetries
              (waitTimeMs: number, reason: string) => {
                // onWaitStart callback - update progress to inform user of waiting
                this.updateProgress({
                  currentTask: `⏸️  ${reason}`,
                  nextTask: `Will resume after waiting`,
                  progress: 20 + (60 * (i + fetchedForYear / Math.max(1, maxResultsPerYear || 1000)) / years.length),
                  currentYear: year,
                  totalPapers: totalFetched
                });
              },
              () => {
                // onWaitEnd callback - update progress to resume fetching
                this.updateProgress({
                  currentTask: `Year ${year}: Fetching papers (offset ${offset}, got ${fetchedForYear} so far)`,
                  nextTask: `Processing batch of ${limit} papers`,
                  progress: 20 + (60 * (i + fetchedForYear / Math.max(1, maxResultsPerYear || 1000)) / years.length),
                  currentYear: year,
                  totalPapers: totalFetched
                });
              }
            );

            // Detect stuck loops - if we get empty results repeatedly, stop
            if (result.papers.length === 0) {
              consecutiveEmptyResults++;
              console.log(`Year ${year}: Received 0 papers (attempt ${consecutiveEmptyResults}/${maxConsecutiveEmpty})`);
              if (consecutiveEmptyResults >= maxConsecutiveEmpty) {
                console.log(`Year ${year}: Stopping after ${maxConsecutiveEmpty} consecutive empty results`);
                break;
              }
            } else {
              consecutiveEmptyResults = 0; // Reset counter on successful fetch
            }

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

            console.log(`Year ${year}: Found ${fetchedForYear}/${result.total} papers (total across all years: ${totalFetched})`);

            // Update status after fetching batch
            this.updateProgress({
              currentTask: `Year ${year}: Retrieved ${fetchedForYear}/${result.total} papers`,
              nextTask: result.hasMore ? `Fetching next batch` : `Moving to next year`,
              progress: 20 + (60 * (i + fetchedForYear / Math.max(1, result.total)) / years.length),
              currentYear: year,
              totalPapers: totalFetched
            });

            // Stop if no more results available
            if (!result.hasMore || result.papers.length === 0) {
              break;
            }

            // Stop if we've reached the target for this year (when limit is specified)
            if (maxResultsPerYear && fetchedForYear >= maxResultsPerYear) {
              break;
            }
          } catch (batchError: any) {
            // Check if this is a retryable error
            if (batchError.retryable) {
              console.error(`Failed batch for year ${year}, offset ${offset}: ${batchError.message}`);
              failedBatches.push({
                year,
                offset,
                limit,
                attempts: 1,
                lastError: batchError.message
              });
              // Move to next offset to continue with other batches
              offset += limit;
              // If we can't determine if there are more results, assume there might be
              // (up to API limit of 1000 per year)
              if (offset >= 1000) {
                break;
              }
            } else {
              // Non-retryable error - throw it
              throw batchError;
            }
          }
        }
      }

      // Retry failed batches with longer waits
      if (failedBatches.length > 0) {
        console.log(`\n=== Retrying ${failedBatches.length} failed batches ===`);
        this.updateProgress({
          currentTask: `Retrying ${failedBatches.length} failed batches`,
          nextTask: 'Recovering missed papers',
          progress: 75,
          totalPapers: totalFetched
        });

        for (const batch of failedBatches) {
          while (batch.attempts < maxBatchRetries) {
            // Check if stopped
            if (!this.isRunning) {
              console.log('[ScholarExtractor] Search stopped during retry');
              break;
            }

            // Wait while paused
            while (this.isPaused) {
              await this.delay(1000);
            }

            batch.attempts++;
            // Exponential backoff with longer waits: 30s, 60s, 120s, 240s, 480s
            const waitTime = 30000 * Math.pow(2, batch.attempts - 1);
            console.log(`Retrying batch (year ${batch.year}, offset ${batch.offset}) - attempt ${batch.attempts}/${maxBatchRetries} after ${waitTime / 1000}s wait`);

            this.updateProgress({
              currentTask: `⏸️  Waiting ${waitTime / 1000}s before retry (year ${batch.year}, offset ${batch.offset})`,
              nextTask: `Attempt ${batch.attempts}/${maxBatchRetries}`,
              progress: 75,
              currentYear: batch.year,
              totalPapers: totalFetched
            });

            await this.delay(waitTime);

            this.updateProgress({
              currentTask: `Retrying batch (year ${batch.year}, offset ${batch.offset})`,
              nextTask: `Attempt ${batch.attempts}/${maxBatchRetries}`,
              progress: 75,
              currentYear: batch.year,
              totalPapers: totalFetched
            });

            try {
              const result = await semanticScholar.search(
                {
                  query: parameters.inclusionKeywords.join(' '),
                  year: batch.year,
                  limit: batch.limit,
                  offset: batch.offset
                },
                0,
                3, // Still do internal retries
                (waitTimeMs: number, reason: string) => {
                  this.updateProgress({
                    currentTask: `⏸️  ${reason}`,
                    nextTask: `Retrying batch for year ${batch.year}`,
                    progress: 75,
                    currentYear: batch.year,
                    totalPapers: totalFetched
                  });
                },
                () => {
                  this.updateProgress({
                    currentTask: `Retrying batch (year ${batch.year}, offset ${batch.offset})`,
                    nextTask: `Processing recovered papers`,
                    progress: 75,
                    currentYear: batch.year,
                    totalPapers: totalFetched
                  });
                }
              );

              if (result.papers.length > 0) {
                // Filter by date if specified
                let papersToAdd = result.papers;
                if (parameters.startMonth || parameters.endMonth || parameters.startDay || parameters.endDay) {
                  papersToAdd = this.filterPapersByDate(result.papers, parameters.startMonth, parameters.endMonth, parameters.startDay, parameters.endDay, batch.year, years![0], years![years!.length - 1]);
                }

                allPapers.push(...papersToAdd);
                totalFetched += papersToAdd.length;

                for (const paper of papersToAdd) {
                  this.database.addPaper(this.sessionId!, paper);
                  if (this.onPaper) {
                    this.onPaper(paper, this.sessionId!);
                  }
                }

                console.log(`✓ Recovered ${papersToAdd.length} papers from batch (year ${batch.year}, offset ${batch.offset})`);
              }

              // Successfully recovered - break out of retry loop
              break;
            } catch (retryError: any) {
              batch.lastError = retryError.message;
              console.error(`Retry failed for batch (year ${batch.year}, offset ${batch.offset}): ${retryError.message}`);

              if (batch.attempts >= maxBatchRetries) {
                console.error(`✗ Giving up on batch (year ${batch.year}, offset ${batch.offset}) after ${maxBatchRetries} attempts`);
              }
            }
          }
        }

        // Log final status of failed batches
        const stillFailed = failedBatches.filter(b => b.attempts >= maxBatchRetries);
        if (stillFailed.length > 0) {
          console.warn(`\n⚠️  ${stillFailed.length} batches could not be recovered after ${maxBatchRetries} attempts each:`);
          for (const batch of stillFailed) {
            console.warn(`   - Year ${batch.year}, offset ${batch.offset}: ${batch.lastError}`);
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
      let filteredPapers: Paper[];

      // Check if semantic prompts are provided for new separate evaluation
      if (parameters.inclusionCriteriaPrompt || parameters.exclusionCriteriaPrompt) {
        // Create progress callback for real-time updates during Phase 2
        const llmProgressCallback = (llmProgress: any) => {
          const phaseLabel = llmProgress.phase === 'inclusion'
            ? 'Evaluating inclusion criteria'
            : llmProgress.phase === 'exclusion'
            ? 'Evaluating exclusion criteria'
            : 'Finalizing results';

          const progressPercent = 85 + Math.floor((llmProgress.processedPapers / llmProgress.totalPapers) * 10); // 85-95%

          const timeElapsedSec = Math.floor(llmProgress.timeElapsed / 1000);
          const timeRemainingSec = Math.floor(llmProgress.estimatedTimeRemaining / 1000);

          this.updateProgress({
            currentTask: `Phase 2: ${phaseLabel} (Batch ${llmProgress.currentBatch}/${llmProgress.totalBatches})`,
            nextTask: llmProgress.processedPapers < llmProgress.totalPapers
              ? `Processing ${llmProgress.papersInCurrentBatch} papers - ${timeElapsedSec}s elapsed, ${timeRemainingSec}s remaining`
              : 'Finalizing semantic filtering results',
            progress: progressPercent,
            processedPapers: llmProgress.processedPapers,
            totalPapers: llmProgress.totalPapers
          });
        };

        // Use new separate evaluation method with progress tracking
        filteredPapers = await this.llmService.semanticFilterSeparate(
          papers,
          parameters.inclusionCriteriaPrompt,
          parameters.exclusionCriteriaPrompt,
          llmProgressCallback
        );
      } else {
        // Fall back to legacy method using keywords
        filteredPapers = await this.llmService.semanticFilter(
          papers,
          parameters.inclusionKeywords,
          parameters.exclusionKeywords
        );
      }

      // Save updated papers to database
      for (const paper of filteredPapers) {
        this.database.addPaper(this.sessionId, paper);
      }

      // Update PRISMA data with detailed metrics
      const totalPapers = papers.length;
      const keywordExcludedCount = papers.filter(p => p.excluded_by_keyword).length;
      const excludedPapers = filteredPapers.filter(p => !p.included);
      const excludedCount = excludedPapers.length;
      const includedCount = totalPapers - excludedCount;

      // Collect exclusion reasons
      const exclusionReasons: Record<string, number> = {};
      for (const paper of excludedPapers) {
        const reason = paper.exclusionReason || 'LLM semantic exclusion';
        exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
      }

      // Collect eligibility exclusion reasons from semantic filtering
      const eligibilityReasons: Record<string, number> = {};
      if (parameters.inclusionCriteriaPrompt || parameters.exclusionCriteriaPrompt) {
        for (const paper of excludedPapers) {
          if (paper.systematic_filtering_exclusion) {
            const reason = paper.systematic_filtering_exclusion_reasoning || 'Meets exclusion criteria';
            eligibilityReasons[reason] = (eligibilityReasons[reason] || 0) + 1;
          } else if (!paper.systematic_filtering_inclusion) {
            const reason = paper.systematic_filtering_inclusion_reasoning || 'Does not meet inclusion criteria';
            eligibilityReasons[reason] = (eligibilityReasons[reason] || 0) + 1;
          }
        }
      }

      this.database.updatePRISMAData(this.sessionId, {
        identification: {
          recordsIdentifiedPerSource: { 'Semantic Scholar': totalPapers },
          totalRecordsIdentified: totalPapers,
          duplicatesRemoved: 0, // TODO: Track actual duplicates
          recordsMarkedIneligibleByAutomation: keywordExcludedCount,
          recordsRemovedForOtherReasons: 0,
          totalRecordsRemoved: keywordExcludedCount
        },
        screening: {
          recordsScreened: totalPapers - keywordExcludedCount,
          recordsExcluded: excludedCount - keywordExcludedCount,
          reasonsForExclusion: exclusionReasons
        },
        eligibility: {
          reportsAssessed: totalPapers - keywordExcludedCount,
          reportsExcluded: excludedCount - keywordExcludedCount,
          reasonsForExclusion: eligibilityReasons
        },
        included: {
          studiesIncluded: includedCount,
          reportsOfIncludedStudies: includedCount // Assuming 1 report per study
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
    let keywordExcludedCount = 0;

    for (const paper of papers) {
      const excluded = this.shouldExcludeByRules(paper, exclusionKeywords);

      if (excluded) {
        const reason = excluded;
        exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
        keywordExcludedCount++;

        // Update paper as excluded by keyword
        const updatedPaper: Paper = {
          ...paper,
          included: false,
          exclusionReason: reason,
          excluded_by_keyword: true, // Mark as excluded by keyword
          // Set systematic filtering fields with fallback values (LLM not available)
          systematic_filtering_inclusion: false,
          systematic_filtering_inclusion_reasoning: 'LLM filtering not available - excluded by rule-based keyword matching',
          systematic_filtering_exclusion: true,
          systematic_filtering_exclusion_reasoning: `Rule-based exclusion: ${reason}`
        };

        this.database.addPaper(this.sessionId, updatedPaper);
      } else {
        // Update paper as included
        const updatedPaper: Paper = {
          ...paper,
          included: true,
          exclusionReason: undefined,
          excluded_by_keyword: false,
          // Set systematic filtering fields with fallback values (LLM not available)
          systematic_filtering_inclusion: true,
          systematic_filtering_inclusion_reasoning: 'LLM filtering not available - included by rule-based filtering (no keyword matches)',
          systematic_filtering_exclusion: false,
          systematic_filtering_exclusion_reasoning: 'LLM filtering not available - not excluded by rule-based keyword matching'
        };

        this.database.addPaper(this.sessionId, updatedPaper);
      }
    }

    // Update PRISMA data with detailed metrics
    const totalPapers = papers.length;
    const excludedCount = Object.values(exclusionReasons).reduce((a, b) => a + b, 0);
    const includedCount = totalPapers - excludedCount;

    this.database.updatePRISMAData(this.sessionId, {
      identification: {
        recordsIdentifiedPerSource: { 'Semantic Scholar': totalPapers },
        totalRecordsIdentified: totalPapers,
        duplicatesRemoved: 0, // TODO: Track actual duplicates
        recordsMarkedIneligibleByAutomation: keywordExcludedCount,
        recordsRemovedForOtherReasons: 0,
        totalRecordsRemoved: keywordExcludedCount
      },
      screening: {
        recordsScreened: totalPapers - keywordExcludedCount,
        recordsExcluded: 0, // No screening exclusions in rule-based mode
        reasonsForExclusion: {}
      },
      eligibility: {
        reportsAssessed: totalPapers - keywordExcludedCount,
        reportsExcluded: 0,
        reasonsForExclusion: {}
      },
      included: {
        studiesIncluded: includedCount,
        reportsOfIncludedStudies: includedCount
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
    let consecutiveEmptyResults = 0; // Track empty results to detect stuck loops
    const maxConsecutiveEmpty = 3; // Stop after 3 consecutive empty results

    // Track failed batches for retry
    interface FailedBatch {
      offset: number;
      limit: number;
      attempts: number;
      lastError: string;
    }
    const failedBatches: FailedBatch[] = [];
    const maxBatchRetries = 5; // Maximum retries per batch after initial failure

    // Paginate through all results
    while (true) {
      // Wait while paused
      while (this.isPaused) {
        console.log(`[ScholarExtractor] Search paused at offset ${offset}`);
        this.updateProgress({
          currentTask: `⏸️  Search paused`,
          nextTask: `Waiting to resume`,
          progress: 20 + Math.min(60, (totalFetched / Math.max(1, maxResults || 1000)) * 60),
          totalPapers: totalFetched
        });
        await this.delay(1000); // Check every second
      }

      // Check if stopped
      if (!this.isRunning) {
        console.log('[ScholarExtractor] Search stopped during pagination');
        return;
      }

      const limit = maxResults
        ? Math.min(maxPerRequest, maxResults - totalFetched)
        : maxPerRequest;

      // Update status before each API call
      this.updateProgress({
        currentTask: `Fetching papers (offset ${offset}, got ${totalFetched} so far)`,
        nextTask: `Processing batch of ${limit} papers`,
        progress: 20 + Math.min(60, (totalFetched / Math.max(1, maxResults || 1000)) * 60),
        totalPapers: totalFetched
      });

      try {
        const result = await semanticScholar.search(
          {
            query: parameters.inclusionKeywords.join(' '),
            // No year filter - search all years
            limit,
            offset
          },
          0, // retryCount
          3, // maxRetries
          (waitTimeMs: number, reason: string) => {
            // onWaitStart callback - update progress to inform user of waiting
            this.updateProgress({
              currentTask: `⏸️  ${reason}`,
              nextTask: `Will resume after waiting`,
              progress: 20 + Math.min(60, (totalFetched / Math.max(1, maxResults || 1000)) * 60),
              totalPapers: totalFetched
            });
          },
          () => {
            // onWaitEnd callback - update progress to resume fetching
            this.updateProgress({
              currentTask: `Fetching papers (offset ${offset}, got ${totalFetched} so far)`,
              nextTask: `Processing batch of ${limit} papers`,
              progress: 20 + Math.min(60, (totalFetched / Math.max(1, maxResults || 1000)) * 60),
              totalPapers: totalFetched
            });
          }
        );

        // Detect stuck loops - if we get empty results repeatedly, stop
        if (result.papers.length === 0) {
          consecutiveEmptyResults++;
          console.log(`Received 0 papers (attempt ${consecutiveEmptyResults}/${maxConsecutiveEmpty})`);
          if (consecutiveEmptyResults >= maxConsecutiveEmpty) {
            console.log(`Stopping after ${maxConsecutiveEmpty} consecutive empty results`);
            break;
          }
        } else {
          consecutiveEmptyResults = 0; // Reset counter on successful fetch
        }

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

        // Update status after fetching batch
        this.updateProgress({
          currentTask: `Retrieved ${totalFetched}/${result.total} papers`,
          nextTask: result.hasMore ? `Fetching next batch from offset ${offset}` : 'Finalizing search',
          progress: 20 + Math.min(60, (totalFetched / Math.max(1, result.total)) * 60),
          totalPapers: totalFetched
        });

        // Stop if no more results available
        if (!result.hasMore || result.papers.length === 0) {
          break;
        }

        // Stop if we've reached the max results (when limit is specified)
        if (maxResults && totalFetched >= maxResults) {
          break;
        }
      } catch (batchError: any) {
        // Check if this is a retryable error
        if (batchError.retryable) {
          console.error(`Failed batch at offset ${offset}: ${batchError.message}`);
          failedBatches.push({
            offset,
            limit,
            attempts: 1,
            lastError: batchError.message
          });
          // Move to next offset to continue with other batches
          offset += limit;
          // If we can't determine if there are more results, assume there might be
          // (up to API limit of 1000)
          if (offset >= 1000) {
            break;
          }
        } else {
          // Non-retryable error - throw it
          throw batchError;
        }
      }
    }

    // Retry failed batches with longer waits
    if (failedBatches.length > 0) {
      console.log(`\n=== Retrying ${failedBatches.length} failed batches ===`);
      this.updateProgress({
        currentTask: `Retrying ${failedBatches.length} failed batches`,
        nextTask: 'Recovering missed papers',
        progress: 75,
        totalPapers: totalFetched
      });

      for (const batch of failedBatches) {
        while (batch.attempts < maxBatchRetries) {
          // Check if stopped
          if (!this.isRunning) {
            console.log('[ScholarExtractor] Search stopped during retry');
            break;
          }

          // Wait while paused
          while (this.isPaused) {
            await this.delay(1000);
          }

          batch.attempts++;
          // Exponential backoff with longer waits: 30s, 60s, 120s, 240s, 480s
          const waitTime = 30000 * Math.pow(2, batch.attempts - 1);
          console.log(`Retrying batch (offset ${batch.offset}) - attempt ${batch.attempts}/${maxBatchRetries} after ${waitTime / 1000}s wait`);

          this.updateProgress({
            currentTask: `⏸️  Waiting ${waitTime / 1000}s before retry (offset ${batch.offset})`,
            nextTask: `Attempt ${batch.attempts}/${maxBatchRetries}`,
            progress: 75,
            totalPapers: totalFetched
          });

          await this.delay(waitTime);

          this.updateProgress({
            currentTask: `Retrying batch (offset ${batch.offset})`,
            nextTask: `Attempt ${batch.attempts}/${maxBatchRetries}`,
            progress: 75,
            totalPapers: totalFetched
          });

          try {
            const result = await semanticScholar.search(
              {
                query: parameters.inclusionKeywords.join(' '),
                limit: batch.limit,
                offset: batch.offset
              },
              0,
              3, // Still do internal retries
              (waitTimeMs: number, reason: string) => {
                this.updateProgress({
                  currentTask: `⏸️  ${reason}`,
                  nextTask: `Retrying batch at offset ${batch.offset}`,
                  progress: 75,
                  totalPapers: totalFetched
                });
              },
              () => {
                this.updateProgress({
                  currentTask: `Retrying batch (offset ${batch.offset})`,
                  nextTask: `Processing recovered papers`,
                  progress: 75,
                  totalPapers: totalFetched
                });
              }
            );

            if (result.papers.length > 0) {
              totalFetched += result.papers.length;

              for (const paper of result.papers) {
                this.database.addPaper(this.sessionId!, paper);
                if (this.onPaper) {
                  this.onPaper(paper, this.sessionId!);
                }
              }

              console.log(`✓ Recovered ${result.papers.length} papers from batch (offset ${batch.offset})`);
            }

            // Successfully recovered - break out of retry loop
            break;
          } catch (retryError: any) {
            batch.lastError = retryError.message;
            console.error(`Retry failed for batch (offset ${batch.offset}): ${retryError.message}`);

            if (batch.attempts >= maxBatchRetries) {
              console.error(`✗ Giving up on batch (offset ${batch.offset}) after ${maxBatchRetries} attempts`);
            }
          }
        }
      }

      // Log final status of failed batches
      const stillFailed = failedBatches.filter(b => b.attempts >= maxBatchRetries);
      if (stillFailed.length > 0) {
        console.warn(`\n⚠️  ${stillFailed.length} batches could not be recovered after ${maxBatchRetries} attempts each:`);
        for (const batch of stillFailed) {
          console.warn(`   - Offset ${batch.offset}: ${batch.lastError}`);
        }
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
    this.isPaused = true;
    console.log('[ScholarExtractor] Search paused');
  }

  /**
   * Resume a paused search
   */
  resume(): void {
    this.isPaused = false;
    console.log('[ScholarExtractor] Search resumed');
  }

  /**
   * Stop the current search
   */
  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    console.log('[ScholarExtractor] Search stopped');
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
