/**
 * LLM Service - Main service for managing LLM providers and batch processing
 */

import { LLMConfig, LLMRequest, LLMResponse, LLMTaskType, Paper, FallbackStrategy } from '../types';
import { LLMProvider } from './base-provider';
import { GeminiProvider } from './gemini-provider';
import { APIKeyManager } from './api-key-manager';

/**
 * Progress callback for LLM filtering operations
 */
export interface LLMFilteringProgress {
  phase: 'inclusion' | 'exclusion' | 'finalizing';
  totalPapers: number;
  processedPapers: number;
  currentBatch: number;
  totalBatches: number;
  papersInCurrentBatch: number;
  timeElapsed: number;
  estimatedTimeRemaining: number;
}

export type LLMProgressCallback = (progress: LLMFilteringProgress) => void;

export class LLMService {
  private provider?: LLMProvider;
  private config: LLMConfig;
  private keyManager?: APIKeyManager;
  private onKeyExhausted?: () => Promise<string | null>;
  private healthyKeys: string[] = []; // Store verified healthy keys from initialization

  constructor(config?: Partial<LLMConfig>) {
    // Default configuration with Gemini as default provider
    // Optimized batch size for efficiency (larger batches = fewer API calls)
    this.config = {
      enabled: config?.enabled ?? true,
      provider: config?.provider || 'gemini',
      model: config?.model,
      apiKey: config?.apiKey,
      apiKeys: config?.apiKeys,
      batchSize: config?.batchSize || 20, // Increased from 10 to 20 for efficiency
      maxConcurrentBatches: config?.maxConcurrentBatches || 5, // Increased from 3 to 5 for parallel processing
      timeout: config?.timeout || 30000,
      retryAttempts: config?.retryAttempts || 3,
      temperature: config?.temperature || 0.3,
      fallbackStrategy: config?.fallbackStrategy || 'rule_based',
      enableKeyRotation: config?.enableKeyRotation ?? true
    };
  }

  /**
   * Set callback for when all API keys are exhausted
   */
  setOnKeyExhausted(callback: () => Promise<string | null>): void {
    this.onKeyExhausted = callback;
  }

  /**
   * Initialize the LLM service with the configured provider
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Prepare API keys
    const keys: string[] = [];
    if (this.config.apiKeys && this.config.apiKeys.length > 0) {
      keys.push(...this.config.apiKeys);
    } else if (this.config.apiKey) {
      keys.push(this.config.apiKey);
    }

    // Check environment variables as fallback
    if (keys.length === 0 && process.env.GEMINI_API_KEYS) {
      const envKeys = process.env.GEMINI_API_KEYS
        .split(',')
        .map(key => key.trim())
        .filter(key => key.length > 0);
      keys.push(...envKeys);
    }

    if (keys.length === 0) {
      throw new Error('LLM API key is required when LLM is enabled. Provide apiKey, apiKeys, or set GEMINI_API_KEYS environment variable.');
    }

    // Create API key manager if rotation is enabled and we have multiple keys
    if (this.config.enableKeyRotation && keys.length > 0) {
      this.keyManager = new APIKeyManager(
        keys,
        this.config.fallbackStrategy,
        this.config.enableKeyRotation
      );

      // Set callback for exhausted keys
      if (this.onKeyExhausted) {
        this.keyManager.setOnKeyExhausted(this.onKeyExhausted);
      }
    }

    // Create provider based on configuration
    switch (this.config.provider) {
      case 'gemini':
        this.provider = new GeminiProvider();
        break;
      case 'openai':
        throw new Error('OpenAI provider not yet implemented');
      case 'anthropic':
        throw new Error('Anthropic provider not yet implemented');
      default:
        throw new Error(`Unknown LLM provider: ${this.config.provider}`);
    }

    // Initialize provider with key manager or single key
    const initKey = keys[0]; // Provide first key as fallback
    await this.provider.initialize(initKey, {
      model: this.config.model,
      keyManager: this.keyManager
    });

    // Run health check during initialization to identify working keys upfront
    if (this.keyManager) {
      console.log('[LLM Service] Running initial health check to identify working keys...');
      const healthCheckResults = await this.keyManager.runHealthCheck();
      console.log(`[LLM Service] Health check complete: ${healthCheckResults.healthy}/${healthCheckResults.healthy + healthCheckResults.unhealthy} keys healthy`);

      if (healthCheckResults.healthy === 0) {
        throw new Error('No healthy API keys available. Please check your API keys and try again.');
      }

      // Store healthy keys for parallel processing
      this.healthyKeys = this.keyManager.getAllAvailableKeys();
      console.log(`[LLM Service] Identified ${this.healthyKeys.length} healthy keys for parallel processing`);

      // Pass healthy keys to the provider for exclusive use in parallel processing
      if (this.provider && 'setHealthyKeys' in this.provider) {
        (this.provider as any).setHealthyKeys(this.healthyKeys);
      }
    }
  }

  /**
   * Check if LLM is enabled and available
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.provider && this.provider.isAvailable();
  }

  /**
   * Filter papers using semantic understanding (LLM-based)
   * Returns papers with inclusion decisions and reasoning
   * @deprecated Use semanticFilterSeparate for new implementation with separate inclusion/exclusion flags
   */
  async semanticFilter(
    papers: Paper[],
    inclusionCriteria: string[],
    exclusionCriteria: string[]
  ): Promise<Paper[]> {
    if (!this.isEnabled()) {
      throw new Error('LLM service is not enabled or initialized');
    }

    // Create batch requests for filtering
    const requests: LLMRequest[] = papers.map(paper => ({
      id: paper.id,
      taskType: 'semantic_filtering',
      prompt: this.buildFilteringPrompt(paper, inclusionCriteria, exclusionCriteria),
      context: { paper }
    }));

    // Process in batches
    const responses = await this.processBatchRequests(requests);

    // Update papers with LLM decisions
    return papers.map(paper => {
      const response = responses.find(r => r.id === paper.id);

      if (!response || response.error) {
        // If LLM fails, keep the paper but mark it as uncertain
        return {
          ...paper,
          llmConfidence: 0,
          llmReasoning: response?.error || 'LLM processing failed'
        };
      }

      const decision = response.result?.decision === 'include';
      return {
        ...paper,
        included: decision,
        exclusionReason: decision ? undefined : response.result?.reasoning,
        llmConfidence: response.confidence || 0.5,
        llmReasoning: response.result?.reasoning
      };
    });
  }

  /**
   * Filter papers using semantic understanding with separate inclusion and exclusion evaluation
   * Returns papers with separate inclusion and exclusion flags and reasoning
   * @param papers Papers to filter
   * @param inclusionCriteriaPrompt Semantic inclusion criteria
   * @param exclusionCriteriaPrompt Semantic exclusion criteria
   * @param progressCallback Optional callback for progress updates
   */
  async semanticFilterSeparate(
    papers: Paper[],
    inclusionCriteriaPrompt?: string,
    exclusionCriteriaPrompt?: string,
    progressCallback?: LLMProgressCallback
  ): Promise<Paper[]> {
    if (!this.isEnabled()) {
      throw new Error('LLM service is not enabled or initialized');
    }

    // Use pre-verified healthy keys (already identified during initialization)
    if (this.healthyKeys.length === 0) {
      throw new Error('No healthy API keys available. Health check during initialization found no working keys.');
    }

    console.log(`[LLM Service] Starting semantic filtering with ${this.healthyKeys.length} verified healthy keys`);

    let processedPapers = [...papers];
    const startTime = Date.now();

    // Evaluate inclusion criteria if provided
    if (inclusionCriteriaPrompt && inclusionCriteriaPrompt.trim()) {
      const inclusionRequests: LLMRequest[] = papers.map(paper => ({
        id: `${paper.id}_inclusion`,
        taskType: 'semantic_filtering',
        prompt: this.buildInclusionFilteringPrompt(paper, inclusionCriteriaPrompt),
        context: { paper, criteriaType: 'inclusion' }
      }));

      const totalBatches = Math.ceil(inclusionRequests.length / this.config.batchSize);

      const inclusionResponses = await this.processBatchRequestsWithProgress(
        inclusionRequests,
        'inclusion',
        papers.length,
        startTime,
        progressCallback
      );

      processedPapers = processedPapers.map(paper => {
        const response = inclusionResponses.find(r => r.id === `${paper.id}_inclusion`);

        // With the robust Gemini provider, we should ALWAYS get a response
        // The provider will retry indefinitely until it succeeds
        if (!response) {
          throw new Error(`CRITICAL: No response for paper ${paper.id}. This should never happen with robust LLM provider.`);
        }

        // If there's an error marker, the provider failed despite infinite retries (extremely rare)
        if (response.error) {
          throw new Error(`CRITICAL: LLM provider failed after infinite retries for paper ${paper.id}. Check system logs.`);
        }

        const meetsInclusion = response.result?.decision === 'include' || response.result?.meets_criteria === true;
        const reasoning = response.result?.reasoning;

        // The LLM should ALWAYS provide reasoning due to strengthened prompts
        if (!reasoning || reasoning.trim().length === 0) {
          throw new Error(`CRITICAL: LLM did not provide reasoning for paper ${paper.id} despite enforced prompts. Check prompt configuration.`);
        }

        return {
          ...paper,
          systematic_filtering_inclusion: meetsInclusion,
          systematic_filtering_inclusion_reasoning: reasoning
        };
      });
    }

    // Evaluate exclusion criteria if provided
    if (exclusionCriteriaPrompt && exclusionCriteriaPrompt.trim()) {
      const exclusionRequests: LLMRequest[] = papers.map(paper => ({
        id: `${paper.id}_exclusion`,
        taskType: 'semantic_filtering',
        prompt: this.buildExclusionFilteringPrompt(paper, exclusionCriteriaPrompt),
        context: { paper, criteriaType: 'exclusion' }
      }));

      const totalBatches = Math.ceil(exclusionRequests.length / this.config.batchSize);

      const exclusionResponses = await this.processBatchRequestsWithProgress(
        exclusionRequests,
        'exclusion',
        papers.length,
        startTime,
        progressCallback
      );

      processedPapers = processedPapers.map(paper => {
        const response = exclusionResponses.find(r => r.id === `${paper.id}_exclusion`);

        // With the robust Gemini provider, we should ALWAYS get a response
        // The provider will retry indefinitely until it succeeds
        if (!response) {
          throw new Error(`CRITICAL: No response for paper ${paper.id}. This should never happen with robust LLM provider.`);
        }

        // If there's an error marker, the provider failed despite infinite retries (extremely rare)
        if (response.error) {
          throw new Error(`CRITICAL: LLM provider failed after infinite retries for paper ${paper.id}. Check system logs.`);
        }

        const meetsExclusion = response.result?.decision === 'exclude' || response.result?.meets_criteria === true;
        const reasoning = response.result?.reasoning;

        // The LLM should ALWAYS provide reasoning due to strengthened prompts
        if (!reasoning || reasoning.trim().length === 0) {
          throw new Error(`CRITICAL: LLM did not provide reasoning for paper ${paper.id} despite enforced prompts. Check prompt configuration.`);
        }

        return {
          ...paper,
          systematic_filtering_exclusion: meetsExclusion,
          systematic_filtering_exclusion_reasoning: reasoning
        };
      });
    }

    // Update the overall inclusion status based on semantic filtering results
    // A paper is included if it meets inclusion criteria (or no inclusion criteria provided)
    // AND does not meet exclusion criteria (or no exclusion criteria provided)
    // IMPORTANT: Also ensure all systematic filtering fields are set with defaults if not already set
    processedPapers = processedPapers.map(paper => {
      const meetsInclusion = inclusionCriteriaPrompt
        ? (paper.systematic_filtering_inclusion === true)
        : true; // If no inclusion criteria, consider as meeting inclusion

      const meetsExclusion = exclusionCriteriaPrompt
        ? (paper.systematic_filtering_exclusion === true)
        : false; // If no exclusion criteria, consider as not meeting exclusion

      const shouldInclude = meetsInclusion && !meetsExclusion;

      return {
        ...paper,
        included: shouldInclude,
        // Ensure systematic filtering fields are always set (use existing or defaults)
        systematic_filtering_inclusion: paper.systematic_filtering_inclusion !== undefined
          ? paper.systematic_filtering_inclusion
          : (inclusionCriteriaPrompt ? undefined : true), // Default to true if no criteria
        systematic_filtering_inclusion_reasoning: paper.systematic_filtering_inclusion_reasoning
          || (inclusionCriteriaPrompt ? undefined : 'No inclusion criteria specified - automatically included'),
        systematic_filtering_exclusion: paper.systematic_filtering_exclusion !== undefined
          ? paper.systematic_filtering_exclusion
          : (exclusionCriteriaPrompt ? undefined : false), // Default to false if no criteria
        systematic_filtering_exclusion_reasoning: paper.systematic_filtering_exclusion_reasoning
          || (exclusionCriteriaPrompt ? undefined : 'No exclusion criteria specified - not excluded')
      };
    });

    return processedPapers;
  }

  /**
   * Identify categories for papers using LLM
   */
  async identifyCategories(papers: Paper[]): Promise<Paper[]> {
    if (!this.isEnabled()) {
      throw new Error('LLM service is not enabled or initialized');
    }

    const requests: LLMRequest[] = papers.map(paper => ({
      id: paper.id,
      taskType: 'category_identification',
      prompt: this.buildCategoryPrompt(paper),
      context: { paper }
    }));

    const responses = await this.processBatchRequests(requests);

    return papers.map(paper => {
      const response = responses.find(r => r.id === paper.id);

      if (!response || response.error) {
        return paper;
      }

      return {
        ...paper,
        category: response.result?.category,
        llmConfidence: response.confidence
      };
    });
  }

  /**
   * Generate a draft literature review paper using LLM
   */
  async generateDraftPaper(
    papers: Paper[],
    topic: string,
    inclusionCriteria: string[]
  ): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('LLM service is not enabled or initialized');
    }

    const prompt = this.buildDraftPaperPrompt(papers, topic, inclusionCriteria);
    const request: LLMRequest = {
      id: 'draft-paper',
      taskType: 'draft_generation',
      prompt,
      context: { papers, topic }
    };

    const responses = await this.processBatchRequests([request]);
    const response = responses[0];

    if (response.error) {
      throw new Error(`Failed to generate draft paper: ${response.error}`);
    }

    return response.result?.draft || response.result?.text || '';
  }

  /**
   * Process batch requests with concurrent batch handling
   * Now supports true parallel processing across all available API keys
   *
   * NOTE: This parallel processing is used ONLY for Step 2 (Semantic Filtering).
   * Step 3 (Paper Generation) uses sequential processing because each iteration
   * depends on the output of the previous iteration.
   */
  private async processBatchRequests(requests: LLMRequest[]): Promise<LLMResponse[]> {
    if (!this.provider) {
      throw new Error('LLM provider not initialized');
    }

    const batchSize = this.config.batchSize;

    // Split into batches
    const batches: LLMRequest[][] = [];
    for (let i = 0; i < requests.length; i += batchSize) {
      batches.push(requests.slice(i, i + batchSize));
    }

    const availableKeyCount = this.keyManager?.getAllAvailableKeys().length || 1;
    console.log(`[Parallel LLM] Processing ${requests.length} requests in ${batches.length} batches using ${availableKeyCount} API keys in parallel`);

    // Process ALL batches in parallel - the GeminiProvider will distribute requests across keys
    const batchPromises = batches.map(batch =>
      this.provider!.batchRequest(batch, this.config.temperature)
    );

    const batchResults = await Promise.all(batchPromises);
    const allResponses = batchResults.flat();

    console.log(`[Parallel LLM] Completed processing ${allResponses.length} requests`);

    return allResponses;
  }

  /**
   * Process batch requests with progress tracking
   * Now supports true parallel processing across all available API keys
   *
   * NOTE: This parallel processing is used ONLY for Step 2 (Semantic Filtering).
   * Step 3 (Paper Generation) uses sequential processing because each iteration
   * depends on the output of the previous iteration.
   */
  private async processBatchRequestsWithProgress(
    requests: LLMRequest[],
    phase: 'inclusion' | 'exclusion',
    totalPapers: number,
    startTime: number,
    progressCallback?: LLMProgressCallback
  ): Promise<LLMResponse[]> {
    if (!this.provider) {
      throw new Error('LLM provider not initialized');
    }

    const batchSize = this.config.batchSize;

    // Split into batches
    const batches: LLMRequest[][] = [];
    for (let i = 0; i < requests.length; i += batchSize) {
      batches.push(requests.slice(i, i + batchSize));
    }

    const totalBatches = batches.length;
    const availableKeyCount = this.keyManager?.getAllAvailableKeys().length || 1;

    console.log(`[Parallel LLM] Processing ${requests.length} papers in ${totalBatches} batches using ${availableKeyCount} API keys in parallel`);

    // Report initial progress
    if (progressCallback) {
      progressCallback({
        phase,
        totalPapers,
        processedPapers: 0,
        currentBatch: 1,
        totalBatches,
        papersInCurrentBatch: requests.length,
        timeElapsed: Date.now() - startTime,
        estimatedTimeRemaining: 0
      });
    }

    // Process ALL batches in parallel - the GeminiProvider will distribute requests across keys
    const batchPromises = batches.map((batch, batchIndex) =>
      this.provider!.batchRequest(batch, this.config.temperature).then(results => {
        // Log completion of each batch
        const completedCount = (batchIndex + 1) * batchSize;
        const timeElapsed = Date.now() - startTime;
        const papersPerMs = completedCount / timeElapsed;
        const remainingPapers = totalPapers - completedCount;
        const estimatedTimeRemaining = papersPerMs > 0 ? Math.round(remainingPapers / papersPerMs) : 0;

        console.log(`[Parallel LLM] Batch ${batchIndex + 1}/${totalBatches} completed (${results.length} papers)`);

        // Report progress for this batch completion
        if (progressCallback) {
          progressCallback({
            phase,
            totalPapers,
            processedPapers: Math.min(completedCount, totalPapers),
            currentBatch: batchIndex + 1,
            totalBatches,
            papersInCurrentBatch: 0, // Batch completed
            timeElapsed,
            estimatedTimeRemaining
          });
        }

        return results;
      })
    );

    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises);
    const allResponses = batchResults.flat();

    console.log(`[Parallel LLM] All ${totalBatches} batches completed. Processed ${allResponses.length} papers.`);

    // Report final progress
    if (progressCallback) {
      progressCallback({
        phase,
        totalPapers,
        processedPapers: totalPapers,
        currentBatch: totalBatches,
        totalBatches,
        papersInCurrentBatch: 0,
        timeElapsed: Date.now() - startTime,
        estimatedTimeRemaining: 0
      });
    }

    return allResponses;
  }

  /**
   * Build filtering prompt for a paper
   */
  private buildFilteringPrompt(
    paper: Paper,
    inclusionCriteria: string[],
    exclusionCriteria: string[]
  ): string {
    return `You are a research assistant helping with a systematic literature review.

**Inclusion Criteria:**
${inclusionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Exclusion Criteria:**
${exclusionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Paper to Review:**
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Year: ${paper.year}
Abstract: ${paper.abstract || 'No abstract available'}

**Task:**
Determine if this paper should be INCLUDED or EXCLUDED based on the criteria above.

**Response Format:**
Provide your response as JSON:
{
  "decision": "include" or "exclude",
  "reasoning": "Brief explanation of your decision",
  "confidence": 0.0 to 1.0
}`;
  }

  /**
   * Build inclusion filtering prompt for a paper
   */
  private buildInclusionFilteringPrompt(
    paper: Paper,
    inclusionCriteriaPrompt: string
  ): string {
    return `You are a research assistant helping with a systematic literature review.

**Inclusion Criteria:**
${inclusionCriteriaPrompt}

**Paper to Review:**
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Year: ${paper.year}
Abstract: ${paper.abstract || 'No abstract available'}
${paper.venue ? `Venue: ${paper.venue}` : ''}
${paper.url ? `URL: ${paper.url}` : ''}

**Task:**
Determine if this paper MEETS the inclusion criteria described above.

**CRITICAL REQUIREMENTS:**
1. You MUST respond with ONLY valid JSON - no additional text before or after
2. You MUST provide a detailed reasoning (2-3 sentences minimum)
3. The reasoning MUST explain specifically why the paper meets or does not meet the inclusion criteria
4. Never use phrases like "manual review", "cannot determine", or "insufficient information"
5. Make the best judgment based on available information

**Response Format (MUST be valid JSON):**
{
  "meets_criteria": true or false,
  "reasoning": "REQUIRED: Detailed explanation of your decision. Explain specifically why this paper meets or does not meet the inclusion criteria based on the title, abstract, and other metadata provided.",
  "confidence": 0.0 to 1.0
}

Respond with ONLY the JSON object above, nothing else.`;
  }

  /**
   * Build exclusion filtering prompt for a paper
   */
  private buildExclusionFilteringPrompt(
    paper: Paper,
    exclusionCriteriaPrompt: string
  ): string {
    return `You are a research assistant helping with a systematic literature review.

**Exclusion Criteria:**
${exclusionCriteriaPrompt}

**Paper to Review:**
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Year: ${paper.year}
Abstract: ${paper.abstract || 'No abstract available'}
${paper.venue ? `Venue: ${paper.venue}` : ''}
${paper.url ? `URL: ${paper.url}` : ''}

**Task:**
Determine if this paper MEETS the exclusion criteria described above (i.e., should be excluded).

**CRITICAL REQUIREMENTS:**
1. You MUST respond with ONLY valid JSON - no additional text before or after
2. You MUST provide a detailed reasoning (2-3 sentences minimum)
3. The reasoning MUST explain specifically why the paper meets or does not meet the exclusion criteria
4. Never use phrases like "manual review", "cannot determine", or "insufficient information"
5. Make the best judgment based on available information

**Response Format (MUST be valid JSON):**
{
  "meets_criteria": true or false,
  "reasoning": "REQUIRED: Detailed explanation of your decision. Explain specifically why this paper meets or does not meet the exclusion criteria based on the title, abstract, and other metadata provided.",
  "confidence": 0.0 to 1.0
}

Respond with ONLY the JSON object above, nothing else.`;
  }

  /**
   * Build category identification prompt
   */
  private buildCategoryPrompt(paper: Paper): string {
    return `Analyze the following research paper and identify its primary category/research area.

**Paper:**
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Year: ${paper.year}
Abstract: ${paper.abstract || 'No abstract available'}

**Task:**
Identify the primary research category or area this paper belongs to. Be specific but concise.

**Response Format:**
Provide your response as JSON:
{
  "category": "The primary category name",
  "confidence": 0.0 to 1.0
}`;
  }

  /**
   * Build draft paper generation prompt
   */
  private buildDraftPaperPrompt(
    papers: Paper[],
    topic: string,
    inclusionCriteria: string[]
  ): string {
    // Group papers by year
    const papersByYear = papers.reduce((acc, paper) => {
      const year = paper.year;
      if (!acc[year]) acc[year] = [];
      acc[year].push(paper);
      return acc;
    }, {} as Record<number, Paper[]>);

    const paperSummaries = Object.entries(papersByYear)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .map(([year, yearPapers]) => {
        const summaries = yearPapers
          .slice(0, 20) // Limit to avoid token limits
          .map(p => `- ${p.title} (${p.authors[0]} et al., ${p.year})`)
          .join('\n');
        return `**${year}:**\n${summaries}`;
      })
      .join('\n\n');

    return `You are an academic writer creating a systematic literature review.

**Topic:** ${topic}

**Inclusion Criteria:**
${inclusionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Total Papers Reviewed:** ${papers.length}

**Selected Papers by Year:**
${paperSummaries}

**Task:**
Write a comprehensive literature review draft (2-3 pages) that:
1. Introduces the research topic and its importance
2. Synthesizes the key findings from the reviewed papers
3. Identifies trends and patterns in the literature over time
4. Highlights research gaps and future directions
5. Concludes with key takeaways

Use an academic tone with proper citations (Author et al., Year format).`;
  }

  /**
   * Get usage statistics from the provider
   */
  getUsageStats() {
    return this.provider?.getUsageStats() || null;
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Get API key statistics
   */
  getKeyStatistics() {
    return this.keyManager?.getKeyStatistics() || [];
  }

  /**
   * Get count of active API keys
   */
  getActiveKeyCount(): number {
    return this.keyManager?.getActiveKeyCount() || (this.config.apiKey ? 1 : 0);
  }

  /**
   * Add a new API key to the rotation pool
   */
  addApiKey(apiKey: string, label?: string): void {
    if (!this.keyManager) {
      // If no key manager, create one
      this.keyManager = new APIKeyManager(
        [apiKey],
        this.config.fallbackStrategy,
        this.config.enableKeyRotation
      );
    } else {
      this.keyManager.addKey(apiKey, label);
    }
  }

  /**
   * Remove an API key from the rotation pool
   */
  removeApiKey(apiKey: string): void {
    this.keyManager?.removeKey(apiKey);
  }

  /**
   * Get fallback strategy
   */
  getFallbackStrategy(): FallbackStrategy {
    return this.config.fallbackStrategy;
  }

  /**
   * Set fallback strategy
   */
  setFallbackStrategy(strategy: FallbackStrategy): void {
    this.config.fallbackStrategy = strategy;
    this.keyManager?.setFallbackStrategy(strategy);
  }

  /**
   * Reset all rate-limited keys
   */
  resetRateLimitedKeys(): void {
    this.keyManager?.resetRateLimitedKeys();
  }
}
