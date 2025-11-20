/**
 * LLM Service - Main service for managing LLM providers and batch processing
 */

import { LLMConfig, LLMRequest, LLMResponse, LLMTaskType, Paper, FallbackStrategy } from '../types';
import { LLMProvider } from './base-provider';
import { GeminiProvider } from './gemini-provider';
import { APIKeyManager } from './api-key-manager';

/**
 * Real-time streaming activity for a single LLM request
 */
export interface ActiveStream {
  requestId: string; // Unique ID for this request
  keyLabel: string; // Which API key is handling this
  paperId?: string; // Associated paper ID (if applicable)
  paperTitle?: string; // Paper title for display
  tokensReceived: number; // How many tokens received so far
  streamSpeed: number; // Tokens per second
  startTime: number; // When this stream started (timestamp)
  status: 'streaming' | 'completing' | 'completed' | 'error';
}

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
  // Detailed status for real-time feedback
  currentAction?: string; // e.g., "Processing batch 3/10", "Retrying with key rotation", "Fallback to gemini-2.5-flash"
  currentModel?: string; // Current model being used
  healthyKeysCount?: number; // Number of healthy keys available
  retryCount?: number; // Number of retries for current request
  keyRotations?: number; // Number of key rotations performed
  modelFallbacks?: number; // Number of model fallbacks performed
  apiKeyQuotas?: Array<{
    label: string;
    status: string;
    quotaRemaining: number;
    quotaDetails: string;
    healthStatus?: string;
  }>;
  // Real-time streaming activity
  activeStreams?: ActiveStream[]; // Currently active streaming requests
}

export type LLMProgressCallback = (progress: LLMFilteringProgress) => void;

export class LLMService {
  private provider?: LLMProvider;
  private config: LLMConfig;
  private keyManager?: APIKeyManager;
  private onKeyExhausted?: () => Promise<string | null>;
  private healthyKeys: string[] = []; // Store verified healthy keys from initialization

  /**
   * Forbidden phrases that indicate templated/generic reasoning
   */
  private readonly FORBIDDEN_PHRASES = [
    'manual review',
    'cannot determine',
    'insufficient information',
    'appears to meet',
    'seems to',
    'might be',
    'based on paper metadata',
    'recommend manual review',
    'appears to',
    'seems like',
    'may be',
    'could be',
    'possibly',
    'perhaps'
  ];

  /**
   * Check if reasoning contains forbidden templated phrases
   */
  private isTemplatedReasoning(reasoning: string): boolean {
    if (!reasoning || reasoning.trim().length < 50) {
      // Too short to be detailed
      return true;
    }

    const lowerReasoning = reasoning.toLowerCase();

    // Check for forbidden phrases
    for (const phrase of this.FORBIDDEN_PHRASES) {
      if (lowerReasoning.includes(phrase.toLowerCase())) {
        return true;
      }
    }

    // Check if reasoning is too generic (doesn't reference paper specifics)
    const hasSpecificContent =
      lowerReasoning.includes('abstract') ||
      lowerReasoning.includes('title') ||
      lowerReasoning.includes('paper') ||
      lowerReasoning.includes('author') ||
      lowerReasoning.includes('method') ||
      lowerReasoning.includes('study') ||
      lowerReasoning.includes('research') ||
      lowerReasoning.includes('approach') ||
      lowerReasoning.includes('focus') ||
      lowerReasoning.includes('present') ||
      lowerReasoning.includes('describe') ||
      lowerReasoning.includes('discuss');

    if (!hasSpecificContent) {
      return true; // Reasoning doesn't reference paper content
    }

    return false;
  }

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
      keyManager: this.keyManager,
      modelSelectionStrategy: this.config.modelSelectionStrategy || 'speed' // Default to speed for filtering
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

    // Display detailed diagnostics before starting batch processing
    console.log('\n' + '='.repeat(80));
    console.log('🔍 PRE-PROCESSING DIAGNOSTICS');
    console.log('='.repeat(80));

    // Show available models
    const geminiProvider = this.provider as any;
    const isAutoMode = geminiProvider?.isAutoModelSelection?.() || false;
    const currentModel = geminiProvider?.getCurrentModel?.() || 'unknown';
    const availableModels = geminiProvider?.fallbackModels || [currentModel];

    console.log('\n📋 MODEL CONFIGURATION:');
    console.log(`   Mode: ${isAutoMode ? '🤖 AUTO (will select based on quota)' : '🔒 MANUAL (fixed model)'}`);
    if (isAutoMode) {
      console.log(`   Available Models (in priority order):`);
      availableModels.forEach((model: string, index: number) => {
        const isCurrent = model === currentModel;
        console.log(`      ${index + 1}. ${model}${isCurrent ? ' ⭐ (starting model)' : ''}`);
      });
    } else {
      console.log(`   Fixed Model: ${currentModel}`);
    }

    // Show API keys with their status
    console.log('\n🔑 API KEYS STATUS:');
    console.log(`   Total Keys: ${this.healthyKeys.length} healthy keys available`);

    if (this.keyManager) {
      const keyStats = this.keyManager.getKeyStatistics();
      const healthyKeyStats = keyStats.filter(k => k.healthCheck?.isHealthy);

      healthyKeyStats.forEach((keyInfo, index) => {
        const quotaStatus = this.keyManager!.getQuotaStatus?.();
        const keyQuota = quotaStatus?.find(q => q.label === keyInfo.label);
        const quotaRemaining = keyQuota?.quotaRemaining || 0;

        console.log(`      ${index + 1}. ${keyInfo.label} (${keyInfo.key})`);
        console.log(`         Status: ✅ Healthy`);
        console.log(`         Quota Remaining: ${quotaRemaining.toFixed(1)}%`);
        console.log(`         Requests Made: ${keyInfo.requestCount || 0}`);
      });
    }

    // Show processing plan
    const totalBatches = Math.ceil(papers.length / this.config.batchSize);
    console.log('\n📊 PROCESSING PLAN:');
    console.log(`   Total Papers: ${papers.length}`);
    console.log(`   Batch Size: ${this.config.batchSize} papers per batch`);
    console.log(`   Total Batches: ${totalBatches}`);
    console.log(`   Parallel Processing: ✅ Enabled (all batches run in parallel)`);
    console.log(`   Key Distribution: Round-robin across ${this.healthyKeys.length} healthy keys`);

    console.log('\n' + '='.repeat(80));
    console.log('🚀 STARTING SEMANTIC FILTERING');
    console.log('='.repeat(80) + '\n');

    // Reset provider statistics for this filtering session
    const geminiProviderForReset = this.provider as any;
    if (geminiProviderForReset?.resetStatistics) {
      geminiProviderForReset.resetStatistics();
    }

    let processedPapers = [...papers];
    const startTime = Date.now();

    // Evaluate inclusion criteria if provided
    if (inclusionCriteriaPrompt && inclusionCriteriaPrompt.trim()) {
      // Group papers into batches for efficient API usage
      const batchSize = this.config.batchSize;
      const paperBatches: Paper[][] = [];

      for (let i = 0; i < papers.length; i += batchSize) {
        paperBatches.push(papers.slice(i, i + batchSize));
      }

      console.log(`\n[Batch Processing] Grouped ${papers.length} papers into ${paperBatches.length} batches of up to ${batchSize} papers each`);
      console.log(`[Batch Processing] This will make ${paperBatches.length} API calls instead of ${papers.length} (${Math.round((1 - paperBatches.length / papers.length) * 100)}% reduction)`);

      // Create ONE request per batch (not per paper!)
      const inclusionRequests: LLMRequest[] = paperBatches.map((batch, batchIndex) => ({
        id: `inclusion_batch_${batchIndex}`,
        taskType: 'semantic_filtering',
        prompt: this.buildBatchInclusionFilteringPrompt(batch, inclusionCriteriaPrompt),
        context: { papers: batch, batchIndex, criteriaType: 'inclusion' }
      }));

      const inclusionResponses = await this.processBatchRequestsWithProgress(
        inclusionRequests,
        'inclusion',
        papers.length,
        startTime,
        progressCallback
      );

      // Parse batch responses and assign to individual papers
      const paperDecisions = new Map<string, { decision: boolean; reasoning: string }>();

      console.log(`[Batch Processing] Parsing ${inclusionResponses.length} batch responses for inclusion criteria...`);

      for (const response of inclusionResponses) {
        if (!response) {
          console.warn(`[LLM Service] Null response in batch responses`);
          continue;
        }

        if (response.error) {
          console.warn(`[LLM Service] Error in batch response ${response.id}:`, response.error);
          continue;
        }

        // Parse batch response - should contain decisions for all papers in the batch
        const batchResults = response.result?.papers || [];
        const batchPapers = response.context?.papers || [];

        if (batchResults.length === 0) {
          console.warn(`[LLM Service] Batch ${response.id} returned no paper results. Raw result:`, JSON.stringify(response.result).substring(0, 200));
        }

        console.log(`[Batch Processing] Batch ${response.id}: Expected ${batchPapers.length} papers, received ${batchResults.length} decisions`);

        for (const paperResult of batchResults) {
          if (!paperResult.id) {
            console.warn(`[LLM Service] Paper result missing ID:`, paperResult);
            continue;
          }

          // First try exact ID match
          let paperId = paperResult.id;

          // If ID match fails and we have an index, try to match by index
          if (!batchPapers.find((p: Paper) => p.id === paperId) && paperResult.index !== undefined) {
            const paperByIndex = batchPapers[paperResult.index - 1];
            if (paperByIndex) {
              console.log(`[Batch Processing] Matched paper by index ${paperResult.index}: ${paperByIndex.id}`);
              paperId = paperByIndex.id;
            }
          }

          paperDecisions.set(paperId, {
            decision: paperResult.decision === 'include' || paperResult.meets_criteria === true,
            reasoning: paperResult.reasoning || 'No reasoning provided'
          });
        }
      }

      console.log(`[Batch Processing] Extracted decisions for ${paperDecisions.size} papers from batch responses`);

      processedPapers = processedPapers.map(paper => {
        const decision = paperDecisions.get(paper.id);

        // Handle missing decision gracefully - provide default values
        if (!decision) {
          console.warn(`[LLM Service] No decision found for paper ${paper.id}. Using default inclusion (true).`);
          return {
            ...paper,
            systematic_filtering_inclusion: true,
            systematic_filtering_inclusion_reasoning: `No LLM decision received for this paper. Defaulting to included for manual review. Title: "${paper.title}"`
          };
        }

        const meetsInclusion = decision.decision;
        const reasoning = decision.reasoning;

        // Validate reasoning quality
        if (!reasoning || reasoning.trim().length === 0) {
          console.warn(`[LLM Service] No reasoning provided for paper ${paper.id}. Using conservative default.`);
          return {
            ...paper,
            systematic_filtering_inclusion: true, // Conservative: include for manual review
            systematic_filtering_inclusion_reasoning: `No LLM reasoning provided. Paper included by default for manual review. Title: "${paper.title}"`
          };
        }

        // Check for templated/generic reasoning
        if (this.isTemplatedReasoning(reasoning)) {
          console.warn(`[LLM Service] Templated reasoning detected for paper ${paper.id}: "${reasoning.substring(0, 100)}...". Using conservative default.`);
          return {
            ...paper,
            systematic_filtering_inclusion: true, // Conservative: include for manual review
            systematic_filtering_inclusion_reasoning: `LLM provided generic reasoning. Paper included by default for manual review. Original LLM response: "${reasoning}"`
          };
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
      // Group papers into batches for efficient API usage
      const batchSize = this.config.batchSize;
      const paperBatches: Paper[][] = [];

      for (let i = 0; i < papers.length; i += batchSize) {
        paperBatches.push(papers.slice(i, i + batchSize));
      }

      console.log(`\n[Batch Processing] Grouped ${papers.length} papers into ${paperBatches.length} batches for exclusion criteria`);

      // Create ONE request per batch (not per paper!)
      const exclusionRequests: LLMRequest[] = paperBatches.map((batch, batchIndex) => ({
        id: `exclusion_batch_${batchIndex}`,
        taskType: 'semantic_filtering',
        prompt: this.buildBatchExclusionFilteringPrompt(batch, exclusionCriteriaPrompt),
        context: { papers: batch, batchIndex, criteriaType: 'exclusion' }
      }));

      const exclusionResponses = await this.processBatchRequestsWithProgress(
        exclusionRequests,
        'exclusion',
        papers.length,
        startTime,
        progressCallback
      );

      // Parse batch responses and assign to individual papers
      const paperDecisions = new Map<string, { decision: boolean; reasoning: string }>();

      console.log(`[Batch Processing] Parsing ${exclusionResponses.length} batch responses for exclusion criteria...`);

      for (const response of exclusionResponses) {
        if (!response) {
          console.warn(`[LLM Service] Null response in exclusion batch responses`);
          continue;
        }

        if (response.error) {
          console.warn(`[LLM Service] Error in exclusion batch response ${response.id}:`, response.error);
          continue;
        }

        // Parse batch response - should contain decisions for all papers in the batch
        const batchResults = response.result?.papers || [];
        const batchPapers = response.context?.papers || [];

        if (batchResults.length === 0) {
          console.warn(`[LLM Service] Exclusion batch ${response.id} returned no paper results. Raw result:`, JSON.stringify(response.result).substring(0, 200));
        }

        console.log(`[Batch Processing] Exclusion batch ${response.id}: Expected ${batchPapers.length} papers, received ${batchResults.length} decisions`);

        for (const paperResult of batchResults) {
          if (!paperResult.id) {
            console.warn(`[LLM Service] Exclusion paper result missing ID:`, paperResult);
            continue;
          }

          // First try exact ID match
          let paperId = paperResult.id;

          // If ID match fails and we have an index, try to match by index
          if (!batchPapers.find((p: Paper) => p.id === paperId) && paperResult.index !== undefined) {
            const paperByIndex = batchPapers[paperResult.index - 1];
            if (paperByIndex) {
              console.log(`[Batch Processing] Matched paper by index ${paperResult.index}: ${paperByIndex.id}`);
              paperId = paperByIndex.id;
            }
          }

          paperDecisions.set(paperId, {
            decision: paperResult.decision === 'exclude' || paperResult.meets_criteria === true,
            reasoning: paperResult.reasoning || 'No reasoning provided'
          });
        }
      }

      console.log(`[Batch Processing] Extracted exclusion decisions for ${paperDecisions.size} papers from batch responses`);

      processedPapers = processedPapers.map(paper => {
        const decision = paperDecisions.get(paper.id);

        // Handle missing decision gracefully - provide default values
        if (!decision) {
          console.warn(`[LLM Service] No exclusion decision found for paper ${paper.id}. Using default exclusion (false).`);
          return {
            ...paper,
            systematic_filtering_exclusion: false,
            systematic_filtering_exclusion_reasoning: `No LLM exclusion decision received for this paper. Defaulting to not excluded for manual review. Title: "${paper.title}"`
          };
        }

        const meetsExclusion = decision.decision;
        const reasoning = decision.reasoning;

        // Validate reasoning quality
        if (!reasoning || reasoning.trim().length === 0) {
          console.warn(`[LLM Service] No reasoning provided for paper ${paper.id}. Using conservative default.`);
          return {
            ...paper,
            systematic_filtering_exclusion: false, // Conservative: don't exclude without good reason
            systematic_filtering_exclusion_reasoning: `No LLM reasoning provided. Paper not excluded by default for manual review. Title: "${paper.title}"`
          };
        }

        // Check for templated/generic reasoning
        if (this.isTemplatedReasoning(reasoning)) {
          console.warn(`[LLM Service] Templated reasoning detected for paper ${paper.id}: "${reasoning.substring(0, 100)}...". Using conservative default.`);
          return {
            ...paper,
            systematic_filtering_exclusion: false, // Conservative: don't exclude without good reason
            systematic_filtering_exclusion_reasoning: `LLM provided generic reasoning. Paper not excluded by default for manual review. Original LLM response: "${reasoning}"`
          };
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

    // Final summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const included = processedPapers.filter(p => p.included).length;
    const excluded = processedPapers.length - included;

    console.log('\n' + '='.repeat(80));
    console.log('✅ SEMANTIC FILTERING COMPLETE');
    console.log('='.repeat(80));
    console.log(`   Total Papers Analyzed: ${processedPapers.length}`);
    console.log(`   Included Papers: ${included} (${((included / processedPapers.length) * 100).toFixed(1)}%)`);
    console.log(`   Excluded Papers: ${excluded} (${((excluded / processedPapers.length) * 100).toFixed(1)}%)`);
    console.log(`   Total Time: ${totalTime}s`);
    console.log(`   Average Time per Paper: ${(parseFloat(totalTime) / processedPapers.length).toFixed(2)}s`);
    console.log('='.repeat(80) + '\n');

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

    // Get provider stats for detailed progress
    const providerForProgress = this.provider as any;
    const currentModel = providerForProgress?.getCurrentModel?.() || 'unknown';

    // Set up streaming progress callback to emit real-time stream updates
    if (progressCallback && providerForProgress?.setStreamingProgressCallback) {
      providerForProgress.setStreamingProgressCallback((streams: any[]) => {
        // Emit progress with current active streams
        const quotaStatus = this.keyManager?.getQuotaStatus?.() || [];
        progressCallback({
          phase,
          totalPapers,
          processedPapers: 0, // Will be updated by batch completion
          currentBatch: 1,
          totalBatches,
          papersInCurrentBatch: requests.length,
          timeElapsed: Date.now() - startTime,
          estimatedTimeRemaining: 0,
          currentAction: `Processing ${streams.length} parallel requests`,
          currentModel,
          healthyKeysCount: this.healthyKeys.length,
          retryCount: providerForProgress?.currentRetryCount || 0,
          keyRotations: providerForProgress?.keyRotationCount || 0,
          modelFallbacks: providerForProgress?.modelFallbackCount || 0,
          apiKeyQuotas: quotaStatus,
          activeStreams: streams // Include real-time streaming activity
        });
      });
    }

    // Report initial progress
    if (progressCallback) {
      // Get quota status for all keys
      const quotaStatus = this.keyManager?.getQuotaStatus?.() || [];
      const activeStreams = providerForProgress?.getActiveStreams?.() || [];

      progressCallback({
        phase,
        totalPapers,
        processedPapers: 0,
        currentBatch: 1,
        totalBatches,
        papersInCurrentBatch: requests.length,
        timeElapsed: Date.now() - startTime,
        estimatedTimeRemaining: 0,
        currentAction: `Starting ${phase} filtering with ${this.healthyKeys.length} healthy keys`,
        currentModel,
        healthyKeysCount: this.healthyKeys.length,
        retryCount: providerForProgress?.currentRetryCount || 0,
        keyRotations: providerForProgress?.keyRotationCount || 0,
        modelFallbacks: providerForProgress?.modelFallbackCount || 0,
        apiKeyQuotas: quotaStatus,
        activeStreams
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

        // Get latest provider stats
        const currentModel = providerForProgress?.getCurrentModel?.() || 'unknown';
        const retryCount = providerForProgress?.currentRetryCount || 0;
        const keyRotations = providerForProgress?.keyRotationCount || 0;
        const modelFallbacks = providerForProgress?.modelFallbackCount || 0;

        // Build detailed action message
        let actionMessage = `Processing batch ${batchIndex + 1}/${totalBatches}`;
        if (keyRotations > 0 || modelFallbacks > 0 || retryCount > 0) {
          const details = [];
          if (keyRotations > 0) details.push(`${keyRotations} key rotations`);
          if (modelFallbacks > 0) details.push(`${modelFallbacks} model fallbacks`);
          if (retryCount > 0) details.push(`${retryCount} retries`);
          actionMessage += ` (${details.join(', ')})`;
        }

        // Report progress for this batch completion
        if (progressCallback) {
          // Get quota status for all keys
          const quotaStatus = this.keyManager?.getQuotaStatus?.() || [];
          const activeStreams = providerForProgress?.getActiveStreams?.() || [];

          progressCallback({
            phase,
            totalPapers,
            processedPapers: Math.min(completedCount, totalPapers),
            currentBatch: batchIndex + 1,
            totalBatches,
            papersInCurrentBatch: 0, // Batch completed
            timeElapsed,
            estimatedTimeRemaining,
            currentAction: actionMessage,
            currentModel,
            healthyKeysCount: this.healthyKeys.length,
            retryCount,
            keyRotations,
            modelFallbacks,
            apiKeyQuotas: quotaStatus,
            activeStreams
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
      const quotaStatus = this.keyManager?.getQuotaStatus?.() || [];
      const activeStreams = providerForProgress?.getActiveStreams?.() || [];

      progressCallback({
        phase,
        totalPapers,
        processedPapers: totalPapers,
        currentBatch: totalBatches,
        totalBatches,
        papersInCurrentBatch: 0,
        timeElapsed: Date.now() - startTime,
        estimatedTimeRemaining: 0,
        apiKeyQuotas: quotaStatus,
        activeStreams
      });
    }

    // Post-processing diagnostics
    const providerForStats = this.provider as any;
    const finalModel = providerForStats?.getCurrentModel?.() || 'unknown';
    const keyRotations = providerForStats?.keyRotationCount || 0;
    const modelFallbacks = providerForStats?.modelFallbackCount || 0;
    const successfulCalls = providerForStats?.successfulRequestCount || 0;
    const retries = providerForStats?.currentRetryCount || 0;

    console.log('\n' + '='.repeat(80));
    console.log(`📈 BATCH PROCESSING COMPLETE - ${phase.toUpperCase()} PHASE`);
    console.log('='.repeat(80));
    console.log(`   Total Papers Processed: ${allResponses.length}`);
    console.log(`   Total Batches: ${totalBatches}`);
    console.log(`   Time Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`   Final Model Used: ${finalModel}`);
    console.log(`\n   📊 API Call Statistics:`);
    console.log(`      ✅ Successful API Calls: ${successfulCalls}`);
    console.log(`      🔄 Key Rotations: ${keyRotations} (switched between keys due to rate limits)`);
    console.log(`      🔁 Retries: ${retries} (internal retry attempts)`);
    console.log(`      📉 Model Fallbacks: ${modelFallbacks} (switched models)`);
    console.log(`      💡 Efficiency: ${successfulCalls} successful calls for ${allResponses.length} papers`);
    console.log(`         (${(successfulCalls / allResponses.length).toFixed(2)} calls per paper average)`);

    // Show final key status
    if (this.keyManager) {
      const quotaStatus = this.keyManager.getQuotaStatus?.();
      if (quotaStatus) {
        console.log('\n🔑 FINAL API KEY STATUS:');
        quotaStatus.forEach((keyStatus: any) => {
          console.log(`   ${keyStatus.label}: ${keyStatus.quotaRemaining.toFixed(1)}% quota remaining`);
        });
      }
    }
    console.log('='.repeat(80) + '\n');

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
   * Build batch inclusion filtering prompt for multiple papers
   */
  private buildBatchInclusionFilteringPrompt(
    papers: Paper[],
    inclusionCriteriaPrompt: string
  ): string {
    const papersJson = papers.map((paper, index) => ({
      id: paper.id,
      index: index + 1,
      title: paper.title,
      authors: paper.authors.join(', '),
      year: paper.year,
      abstract: paper.abstract || 'No abstract available',
      venue: paper.venue || 'Unknown venue'
    }));

    return `You are a research assistant helping with a systematic literature review. Your task is to evaluate whether MULTIPLE papers meet specific inclusion criteria.

**Inclusion Criteria:**
${inclusionCriteriaPrompt}

**Papers to Review (${papers.length} papers):**
${JSON.stringify(papersJson, null, 2)}

**Task:**
For EACH paper in the list above, determine if it MEETS the inclusion criteria.

**CRITICAL REQUIREMENTS:**

1. **JSON ARRAY FORMAT**: Respond with ONLY a valid JSON array containing one object per paper
2. **MUST PROCESS ALL PAPERS**: Your response must include a decision for ALL ${papers.length} papers
3. **DETAILED REASONING**: For each paper, provide 2-3 sentences explaining your decision
4. **NO FORBIDDEN PHRASES**: Never use: "manual review", "cannot determine", "insufficient information", "appears to", "seems to", "might be"
5. **BE SPECIFIC**: Reference concrete elements from each paper's title, abstract, venue

**Response Format (MUST be valid JSON array):**
{
  "papers": [
    {
      "id": "paper_id_1",
      "meets_criteria": true or false,
      "reasoning": "Detailed, specific analysis referencing the paper's content and how it relates to criteria. Must be 2-3 complete sentences.",
      "confidence": 0.0 to 1.0
    },
    {
      "id": "paper_id_2",
      "meets_criteria": true or false,
      "reasoning": "Another detailed analysis...",
      "confidence": 0.0 to 1.0
    }
    // ... one object for each paper
  ]
}

**IMPORTANT**: The response MUST contain exactly ${papers.length} paper objects, one for each paper in the input list. Match each paper by its "id" field.

Respond with ONLY the JSON object above, nothing else.`;
  }

  /**
   * Build inclusion filtering prompt for a single paper (fallback)
   */
  private buildInclusionFilteringPrompt(
    paper: Paper,
    inclusionCriteriaPrompt: string
  ): string {
    return `You are a research assistant helping with a systematic literature review. Your task is to evaluate whether a paper meets specific inclusion criteria.

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
Carefully analyze the paper's title, abstract, and metadata to determine if it MEETS the inclusion criteria above.

**CRITICAL REQUIREMENTS - READ CAREFULLY:**

1. **JSON FORMAT ONLY**: Respond with ONLY valid JSON - no markdown, no code blocks, no additional text before or after

2. **DETAILED REASONING REQUIRED**: You MUST provide a detailed, specific reasoning that:
   - Is at least 2-3 complete sentences
   - Explicitly references specific aspects of the paper (title, abstract content, methodology, etc.)
   - Explicitly connects those aspects to the inclusion criteria
   - Explains your logical reasoning process

3. **FORBIDDEN PHRASES**: NEVER use these phrases or similar generic statements:
   ❌ "manual review"
   ❌ "cannot determine"
   ❌ "insufficient information"
   ❌ "appears to meet"
   ❌ "seems to"
   ❌ "might be"
   ❌ "based on paper metadata"
   ❌ "recommend manual review"

4. **BE SPECIFIC**: Instead of generic statements, provide concrete analysis:
   ✅ "The abstract describes a novel machine learning architecture that..."
   ✅ "The paper focuses on healthcare applications, as evidenced by..."
   ✅ "The methodology section indicates an experimental approach where..."

5. **MAKE A DEFINITIVE JUDGMENT**: Based on the available information, make your best judgment. If the abstract is missing, analyze the title, venue, and year to make an informed decision.

**Response Format (MUST be valid JSON):**
{
  "meets_criteria": true or false,
  "reasoning": "Write your detailed, specific analysis here. Reference concrete elements from the paper and explain how they relate to the inclusion criteria. Be definitive and specific.",
  "confidence": 0.0 to 1.0
}

**Example of GOOD reasoning:**
"The paper presents a novel deep learning approach for medical image segmentation, which directly aligns with the inclusion criteria requiring AI methods in healthcare. The abstract specifically mentions the development of a new CNN architecture tested on clinical datasets, demonstrating both methodological innovation and practical healthcare application."

**Example of BAD reasoning (DO NOT USE):**
"Based on paper metadata, appears to meet inclusion criteria. Recommend manual review."

Respond with ONLY the JSON object, nothing else.`;
  }

  /**
   * Build batch exclusion filtering prompt for multiple papers
   */
  private buildBatchExclusionFilteringPrompt(
    papers: Paper[],
    exclusionCriteriaPrompt: string
  ): string {
    const papersJson = papers.map((paper, index) => ({
      id: paper.id,
      index: index + 1,
      title: paper.title,
      authors: paper.authors.join(', '),
      year: paper.year,
      abstract: paper.abstract || 'No abstract available',
      venue: paper.venue || 'Unknown venue'
    }));

    return `You are a research assistant helping with a systematic literature review. Your task is to evaluate whether MULTIPLE papers meet specific exclusion criteria.

**Exclusion Criteria:**
${exclusionCriteriaPrompt}

**Papers to Review (${papers.length} papers):**
${JSON.stringify(papersJson, null, 2)}

**Task:**
For EACH paper in the list above, determine if it MEETS the exclusion criteria (i.e., should be excluded).

**CRITICAL REQUIREMENTS:**

1. **JSON ARRAY FORMAT**: Respond with ONLY a valid JSON array containing one object per paper
2. **MUST PROCESS ALL PAPERS**: Your response must include a decision for ALL ${papers.length} papers
3. **DETAILED REASONING**: For each paper, provide 2-3 sentences explaining your decision
4. **NO FORBIDDEN PHRASES**: Never use: "manual review", "cannot determine", "insufficient information", "appears to", "seems to", "might be"
5. **BE SPECIFIC**: Reference concrete elements from each paper's title, abstract, venue

**Response Format (MUST be valid JSON array):**
{
  "papers": [
    {
      "id": "paper_id_1",
      "meets_criteria": true or false,
      "reasoning": "Detailed, specific analysis referencing the paper's content and how it relates to exclusion criteria. Must be 2-3 complete sentences.",
      "confidence": 0.0 to 1.0
    },
    {
      "id": "paper_id_2",
      "meets_criteria": true or false,
      "reasoning": "Another detailed analysis...",
      "confidence": 0.0 to 1.0
    }
    // ... one object for each paper
  ]
}

**IMPORTANT**: The response MUST contain exactly ${papers.length} paper objects, one for each paper in the input list. Match each paper by its "id" field.

Respond with ONLY the JSON object above, nothing else.`;
  }

  /**
   * Build exclusion filtering prompt for a single paper (fallback)
   */
  private buildExclusionFilteringPrompt(
    paper: Paper,
    exclusionCriteriaPrompt: string
  ): string {
    return `You are a research assistant helping with a systematic literature review. Your task is to evaluate whether a paper meets specific exclusion criteria.

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
Carefully analyze the paper's title, abstract, and metadata to determine if it MEETS the exclusion criteria above (i.e., should be excluded).

**CRITICAL REQUIREMENTS - READ CAREFULLY:**

1. **JSON FORMAT ONLY**: Respond with ONLY valid JSON - no markdown, no code blocks, no additional text before or after

2. **DETAILED REASONING REQUIRED**: You MUST provide a detailed, specific reasoning that:
   - Is at least 2-3 complete sentences
   - Explicitly references specific aspects of the paper (title, abstract content, methodology, etc.)
   - Explicitly connects those aspects to the exclusion criteria
   - Explains your logical reasoning process

3. **FORBIDDEN PHRASES**: NEVER use these phrases or similar generic statements:
   ❌ "manual review"
   ❌ "cannot determine"
   ❌ "insufficient information"
   ❌ "appears to meet"
   ❌ "seems to"
   ❌ "might be"
   ❌ "based on paper metadata"
   ❌ "recommend manual review"

4. **BE SPECIFIC**: Instead of generic statements, provide concrete analysis:
   ✅ "The title explicitly contains 'systematic review', indicating this is a literature review rather than primary research..."
   ✅ "The abstract describes a survey of existing methods without proposing novel contributions..."
   ✅ "The paper focuses on theoretical proofs without empirical validation, which matches the exclusion criteria for..."

5. **MAKE A DEFINITIVE JUDGMENT**: Based on the available information, make your best judgment. If the abstract is missing, analyze the title, venue, and year to make an informed decision.

**Response Format (MUST be valid JSON):**
{
  "meets_criteria": true or false,
  "reasoning": "Write your detailed, specific analysis here. Reference concrete elements from the paper and explain how they relate to the exclusion criteria. Be definitive and specific.",
  "confidence": 0.0 to 1.0
}

**Example of GOOD reasoning:**
"The paper's title includes 'A Survey of' and the abstract describes a comprehensive review of existing techniques without proposing new methods. This clearly matches the exclusion criteria which excludes review papers and surveys, as it does not present original research contributions."

**Example of BAD reasoning (DO NOT USE):**
"Based on paper metadata, does not appear to meet exclusion criteria. Recommend manual review."

Respond with ONLY the JSON object, nothing else.`;
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
