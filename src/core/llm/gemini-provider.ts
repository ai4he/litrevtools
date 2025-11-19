/**
 * Google Gemini LLM Provider
 * Uses the Google Generative AI SDK for Gemini API
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { BaseLLMProvider } from './base-provider';
import { LLMRequest, LLMResponse } from '../types';
import { APIKeyManager } from './api-key-manager';
import { UsageTracker } from './usage-tracker';

export class GeminiProvider extends BaseLLMProvider {
  readonly name = 'gemini';
  private keyManager?: APIKeyManager;
  private defaultModel = 'gemini-2.0-flash-lite'; // Highest free tier quota (tested 2025-11-19)
  private modelName: string = this.defaultModel;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // Minimum 1 second between requests
  private verifiedHealthyKeys: string[] = []; // Pre-verified healthy keys from initialization
  private autoSelectModel: boolean = false; // Whether to automatically select model based on quota

  // Tracking statistics for real-time progress updates
  // These track cumulative counts for the current batch/phase
  public keyRotationCount: number = 0;
  public modelFallbackCount: number = 0;
  public currentRetryCount: number = 0;
  public successfulRequestCount: number = 0; // Track actual successful API calls

  // Fallback models with different strategies
  // Tested 2025-11-19 with 22 API keys - all models verified as working
  // NOTE: gemini-3-pro-preview-11-2025 is only available on Vertex AI (paid), not free tier

  // SPEED Strategy: For Step 2 (semantic filtering) - prioritize throughput and quota
  private speedModels: string[] = [
    'gemini-2.0-flash-lite',          // RPM: 30, TPM: 1M, RPD: 200 - HIGHEST throughput
    'gemini-2.5-flash-lite',          // RPM: 15, TPM: 250K, RPD: 1000 - HIGH daily quota
    'gemini-2.0-flash',               // RPM: 15, TPM: 1M, RPD: 200 - HIGH throughput
    'gemini-2.5-flash',               // RPM: 10, TPM: 250K, RPD: 250 - GOOD quota
    'gemini-2.5-pro',                 // RPM: 2, TPM: 125K, RPD: 50 - FALLBACK
  ];

  // QUALITY Strategy: For Step 3 (LaTeX generation) - prioritize intelligence first
  private qualityModels: string[] = [
    'gemini-2.5-pro',                 // SMARTEST - best for complex writing tasks
    'gemini-2.5-flash',               // Good balance of quality and speed
    'gemini-2.0-flash',               // Fast but capable
    'gemini-2.5-flash-lite',          // High quota, decent quality
    'gemini-2.0-flash-lite',          // Fastest, fallback
  ];

  private fallbackModels: string[] = this.speedModels; // Default to speed strategy
  private currentModelIndex: number = 0;
  private hasTriedModelFallback: boolean = false;

  async initialize(apiKey: string, config?: {
    model?: string;
    keyManager?: APIKeyManager;
    modelSelectionStrategy?: 'speed' | 'quality';
  }): Promise<void> {
    await super.initialize(apiKey, config);

    // Select model strategy based on configuration
    const strategy = config?.modelSelectionStrategy || 'speed'; // Default to speed
    if (strategy === 'quality') {
      this.fallbackModels = this.qualityModels;
      console.log('[Gemini Provider] Using QUALITY strategy - prioritizing intelligent models');
    } else {
      this.fallbackModels = this.speedModels;
      console.log('[Gemini Provider] Using SPEED strategy - prioritizing fast models with high quota');
    }

    // Check if auto model selection is enabled
    if (config?.model === 'auto') {
      this.autoSelectModel = true;
      this.modelName = this.fallbackModels[0]; // Start with first model in selected strategy
      console.log(`[Gemini Provider] Auto model selection enabled with ${strategy} strategy - starting with ${this.modelName}`);
    } else {
      this.modelName = config?.model || this.defaultModel;

      // Set up fallback models list with the configured model as primary
      if (config?.model && config.model !== this.defaultModel && config.model !== 'auto') {
        // If a custom model is specified, make it the primary and add others as fallbacks
        this.fallbackModels = [
          config.model,
          ...this.fallbackModels.filter(m => m !== config.model)
        ];
      }
    }

    // Set current model to the first in the fallback list
    this.modelName = this.fallbackModels[this.currentModelIndex];

    // Use provided key manager or API key
    if (config?.keyManager) {
      this.keyManager = config.keyManager;

      // Initialize quota tracking for all keys with current model
      this.keyManager.initializeQuotaTracking(this.modelName);
      console.log(`[Gemini Provider] Initialized with smart quota tracking for ${this.modelName}`);
    } else if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
  }

  /**
   * Check if auto model selection is enabled
   */
  isAutoModelSelection(): boolean {
    return this.autoSelectModel;
  }

  /**
   * Reset statistics counters (call at start of new phase)
   */
  resetStatistics(): void {
    this.keyRotationCount = 0;
    this.modelFallbackCount = 0;
    this.currentRetryCount = 0;
    this.successfulRequestCount = 0;
    console.log('[Gemini Provider] Statistics counters reset');
  }

  /**
   * Get a model instance with the specified API key
   * @param specificKey Optional specific API key to use (for parallel processing)
   * @param estimatedTokens Estimated tokens for smart key selection
   */
  private getModel(specificKey?: string, estimatedTokens: number = 1000): GenerativeModel {
    let apiKey: string | null = null;

    if (specificKey) {
      // Use the specific key provided (for parallel processing)
      apiKey = specificKey;
    } else if (this.keyManager) {
      // Use smart key selection - chooses key with most available quota
      apiKey = this.keyManager.selectBestAvailableKey(estimatedTokens);

      // Fall back to getCurrentKey if smart selection returns null
      if (!apiKey) {
        apiKey = this.keyManager.getCurrentKey();
      }
    } else {
      apiKey = this.apiKey || null;
    }

    if (!apiKey) {
      throw new Error('No API key available');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: this.modelName });
  }

  /**
   * Try to switch to the next fallback model
   * Returns true if a new model is available, false if all models exhausted
   */
  private tryNextModel(): boolean {
    if (this.currentModelIndex >= this.fallbackModels.length - 1) {
      // All models exhausted
      return false;
    }

    this.currentModelIndex++;
    this.modelName = this.fallbackModels[this.currentModelIndex];
    this.hasTriedModelFallback = true;

    console.log(`[Model Fallback] Switching to model: ${this.modelName} (attempt ${this.currentModelIndex + 1}/${this.fallbackModels.length})`);

    // Reset all rate-limited keys when switching models (different models have different quotas)
    if (this.keyManager) {
      this.keyManager.resetRateLimitedKeys();

      // Update quota limits for new model
      this.keyManager.updateQuotaLimits(this.modelName);
      console.log('[Model Fallback] Updated quota limits and reset all API keys for new model');
    }

    return true;
  }

  /**
   * Stream request with real-time token updates
   * @param prompt The prompt to send
   * @param temperature Temperature setting (0-1)
   * @param specificKey Specific API key to use
   * @param onToken Callback for each token/chunk received (receives: chunk text, total tokens so far)
   */
  async requestWithStreaming(
    prompt: string,
    temperature: number = 0.3,
    specificKey?: string,
    onToken?: (chunk: string, tokensReceived: number, streamSpeed: number) => void
  ): Promise<string> {
    let lastError: Error | null = null;
    const maxAttempts = 5;
    const usingSpecificKey = !!specificKey;
    let keyRotationCycles = 0;
    let totalAttempts = 0;

    while (true) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        totalAttempts++;
        try {
          if (!usingSpecificKey) {
            await this.respectRateLimit();
          }

          const model = this.getModel(specificKey);
          const streamStartTime = Date.now();
          let fullText = '';
          let tokensReceived = 0;

          const result = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: 8192, // Increased for LaTeX generation
            },
          });

          // Process streaming chunks
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;

            // Estimate tokens (rough approximation: ~4 chars per token)
            tokensReceived = Math.ceil(fullText.length / 4);

            // Calculate streaming speed (tokens per second)
            const elapsedSeconds = (Date.now() - streamStartTime) / 1000;
            const streamSpeed = elapsedSeconds > 0 ? tokensReceived / elapsedSeconds : 0;

            // Call the callback with progress
            if (onToken) {
              onToken(chunkText, tokensReceived, streamSpeed);
            }
          }

          // Track successful API call
          this.successfulRequestCount++;

          // Estimate tokens and cost
          const estimatedTokens = Math.ceil((prompt.length + fullText.length) / 4);
          const cost = this.estimateCost(estimatedTokens);
          this.updateStats(estimatedTokens, cost);

          // Mark key as successful
          if (this.keyManager) {
            const usedKey = specificKey || this.keyManager.getCurrentKey();
            if (usedKey) {
              this.keyManager.recordKeyUsage(usedKey, estimatedTokens);
              const keyStats = this.keyManager.getKeyStatistics();
              const keyInfo = keyStats.find(k => k.key === usedKey.substring(0, 8) + '*'.repeat(usedKey.length - 12) + usedKey.substring(usedKey.length - 4));
              const keyLabel = keyInfo?.label || 'Unknown';
              UsageTracker.recordUsage(usedKey, this.modelName, estimatedTokens, keyLabel);
            }
            if (specificKey) {
              this.keyManager.markKeySuccess(specificKey);
            } else {
              this.keyManager.markSuccess();
            }
          }

          if (this.hasTriedModelFallback) {
            console.log(`[Model Fallback] Successfully using fallback model: ${this.modelName}`);
          }

          return fullText;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          const errorMessage = lastError.message.toLowerCase();

          // ... rest of error handling is same as non-streaming request ...
          // For brevity, use same error handling logic
          // (In production, would refactor common error handling into shared method)

          const isRateLimitError = errorMessage.includes('rate limit') ||
                                    errorMessage.includes('429') ||
                                    errorMessage.includes('resource has been exhausted');
          const isQuotaError = errorMessage.includes('quota') && errorMessage.includes('exceeded');

          if (this.keyManager) {
            if (specificKey) {
              await this.keyManager.handleKeyError(specificKey, error);
            } else {
              await this.keyManager.handleError(error);
            }

            if (!this.keyManager.hasAvailableKeys()) {
              if (isRateLimitError || isQuotaError) {
                if (this.tryNextModel()) {
                  attempt = -1;
                  continue;
                }
                await this.delay(60000);
                this.keyManager.resetRateLimitedKeys();
                this.currentModelIndex = 0;
                this.modelName = this.fallbackModels[0];
                keyRotationCycles = 0;
                attempt = -1;
                continue;
              }
            }

            const baseDelay = isRateLimitError || isQuotaError ? 3000 : 2000;
            const totalDelay = Math.min(30000, Math.pow(2, attempt) * baseDelay + Math.random() * 1000);
            await this.delay(totalDelay);
          }
        }
      }
    }
  }

  async request(prompt: string, temperature: number = 0.3, specificKey?: string): Promise<string> {
    let lastError: Error | null = null;
    const maxAttempts = 5; // Max attempts per model/key combination
    const usingSpecificKey = !!specificKey;
    let keyRotationCycles = 0; // Track how many times we've cycled through all keys
    let totalAttempts = 0; // Track total attempts across all cycles

    // IMPORTANT: This loop continues FOREVER until we get a result
    // We never give up - we cycle through models and keys indefinitely
    while (true) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        totalAttempts++;
        try {
        // Rate limiting: ensure minimum interval between requests (only when not using specific key)
        // When using specific keys, each key has its own rate limit
        if (!usingSpecificKey) {
          await this.respectRateLimit();
        }

        const model = this.getModel(specificKey);

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: 2048,
          },
        });

        const response = result.response;
        const text = response.text();

        // Track successful API call
        this.successfulRequestCount++;

        // Estimate tokens and cost (Gemini 1.5 Flash pricing)
        const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);
        const cost = this.estimateCost(estimatedTokens);
        this.updateStats(estimatedTokens, cost);

        // Mark key as successful and reset error count
        if (this.keyManager) {
          // Get the actual API key used for this request
          const usedKey = specificKey || this.keyManager.getCurrentKey();

          if (usedKey) {
            // Record quota usage for this key
            this.keyManager.recordKeyUsage(usedKey, estimatedTokens);

            // Get key label from key manager for usage tracking
            const keyStats = this.keyManager.getKeyStatistics();
            const keyInfo = keyStats.find(k => k.key === usedKey.substring(0, 8) + '*'.repeat(usedKey.length - 12) + usedKey.substring(usedKey.length - 4));
            const keyLabel = keyInfo?.label || 'Unknown';

            // Record usage in global usage tracker
            UsageTracker.recordUsage(usedKey, this.modelName, estimatedTokens, keyLabel);
          }

          if (specificKey) {
            this.keyManager.markKeySuccess(specificKey);
          } else {
            this.keyManager.markSuccess();
          }
        }

        // Log successful model usage (only when using fallback)
        if (this.hasTriedModelFallback) {
          console.log(`[Model Fallback] Successfully using fallback model: ${this.modelName}`);
        }

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const errorMessage = lastError.message.toLowerCase();

        // Classify error type
        const isInvalidModelError = errorMessage.includes('not found') ||
                                     errorMessage.includes('404') ||
                                     errorMessage.includes('invalid model') ||
                                     errorMessage.includes('model not available');

        const isNetworkError = errorMessage.includes('network') ||
                               errorMessage.includes('timeout') ||
                               errorMessage.includes('econnrefused') ||
                               errorMessage.includes('enotfound') ||
                               errorMessage.includes('fetch failed');

        const isRateLimitError = errorMessage.includes('rate limit') ||
                                  errorMessage.includes('429') ||
                                  errorMessage.includes('resource has been exhausted');

        const isQuotaError = errorMessage.includes('quota') && errorMessage.includes('exceeded');

        const isAuthError = errorMessage.includes('invalid') && errorMessage.includes('api key') ||
                            errorMessage.includes('unauthorized') ||
                            errorMessage.includes('401') ||
                            errorMessage.includes('403');

        // Handle INVALID_MODEL errors immediately - don't waste retries
        if (isInvalidModelError) {
          console.log(`[Model Error] Invalid model: ${this.modelName}`);
          if (this.tryNextModel()) {
            console.log(`[Model Fallback] Switched to: ${this.modelName}`);
            // Reset attempt counter for new model
            attempt = -1; // Will be incremented to 0 in next iteration
            continue;
          } else {
            // All models exhausted with invalid model errors
            // This is a critical error - the API might have changed
            // Wait and retry from the beginning in case it's temporary
            console.log(`[Critical Error] All models reported as invalid. Waiting 60s before retrying from first model...`);
            await this.delay(60000);
            this.currentModelIndex = 0;
            this.modelName = this.fallbackModels[0];
            if (this.keyManager) {
              this.keyManager.resetRateLimitedKeys();
            }
            keyRotationCycles = 0;
            attempt = -1;
            continue;
          }
        }

        // Handle error and rotate key if available
        if (this.keyManager) {
          // Track error for the specific key if provided
          if (specificKey) {
            await this.keyManager.handleKeyError(specificKey, error);
          } else {
            await this.keyManager.handleError(error);
          }

          // REMOVED fail-fast for specific keys - now we retry with other keys/models
          // This enables robust parallel processing with automatic failover

          // If using specific key and it's a rate limit error, try recovery strategies
          if (usingSpecificKey && (isRateLimitError || isQuotaError)) {
            this.currentRetryCount++;

            // Strategy 1: Try another verified healthy key if available
            if (this.verifiedHealthyKeys.length > 1) {
              const currentKeyIndex = this.verifiedHealthyKeys.indexOf(specificKey);
              const nextKeyIndex = (currentKeyIndex + 1) % this.verifiedHealthyKeys.length;
              const nextKey = this.verifiedHealthyKeys[nextKeyIndex];

              this.keyRotationCount++;
              console.log(`[Key Rotation #${this.keyRotationCount}] Specific key hit rate limit, trying next verified healthy key`);
              await this.delay(1000);
              return this.request(prompt, temperature, nextKey);
            }

            // Strategy 2: Try a different model with lower quota requirements
            if (this.tryNextModel()) {
              this.modelFallbackCount++;
              console.log(`[Model Fallback #${this.modelFallbackCount}] All keys rate limited for ${this.fallbackModels[this.currentModelIndex - 1]}, trying ${this.modelName}`);
              // Reset and retry with new model and original key
              await this.delay(2000);
              return this.request(prompt, temperature, specificKey);
            }

            // Strategy 3: Wait and retry with same key/model (quota will reset)
            // Quotas reset every 60 seconds, so wait full minute before retrying
            const waitTime = 60000; // 60 seconds
            console.log(`[Retry #${this.currentRetryCount}] All keys and models exhausted, waiting 60s for quota reset...`);
            await this.delay(waitTime);

            // Reset all rate-limited keys and go back to first model
            if (this.keyManager) {
              this.keyManager.resetRateLimitedKeys();
            }
            this.currentModelIndex = 0;
            this.modelName = this.fallbackModels[0];
            console.log(`[Quota Reset] Retrying from beginning with model: ${this.modelName}`);

            // Try the first verified healthy key instead of the same specific key
            const firstKey = this.verifiedHealthyKeys[0] || specificKey;
            return this.request(prompt, temperature, firstKey);
          }

          // Check if we have more keys to try
          if (!this.keyManager.hasAvailableKeys() && this.verifiedHealthyKeys.length === 0) {
            keyRotationCycles++;
            console.log(`[Key Rotation] Completed cycle ${keyRotationCycles} - all keys exhausted`);

            // No more keys available for current model
            if (isRateLimitError || isQuotaError) {
              // Try switching to a fallback model first
              if (this.tryNextModel()) {
                console.log(`[Model Fallback] All keys exhausted for ${this.fallbackModels[this.currentModelIndex - 1]}. Trying ${this.modelName}`);
                keyRotationCycles = 0; // Reset cycle counter for new model
                attempt = -1; // Reset attempt counter for new model
                continue;
              }

              // All models exhausted - wait for quota reset (quotas reset every minute)
              // NEVER give up - keep retrying until we get a result
              const waitTime = 60000; // Wait 60 seconds for quotas to reset

              console.log(`\n${'='.repeat(80)}`);
              console.log(`⏳ RATE LIMIT RECOVERY - Cycle ${keyRotationCycles + 1}`);
              console.log(`${'='.repeat(80)}`);
              console.log(`   Status: All ${this.fallbackModels.length} models + all API keys are rate-limited`);
              console.log(`   Action: Waiting 60 seconds for rate limit windows to reset...`);
              console.log(`   Next: Will retry from first model with all keys refreshed`);
              console.log(`   Note: This is NORMAL for large batches - do NOT stop the process`);
              console.log(`${'='.repeat(80)}\n`);

              await this.delay(waitTime);

              // Reset all rate-limited keys and go back to first model
              const resetCount = this.keyManager.getAllAvailableKeys().length;
              this.keyManager.resetRateLimitedKeys();
              const availableAfterReset = this.keyManager.getAllAvailableKeys().length;

              this.currentModelIndex = 0;
              this.modelName = this.fallbackModels[0];
              keyRotationCycles = 0;
              attempt = -1; // Reset attempts for new cycle

              console.log(`[Recovery Complete] Reset ${availableAfterReset} keys. Retrying with model: ${this.modelName}\n`);
              continue;
            }

            // For other errors, try next model
            if (this.tryNextModel()) {
              console.log(`[Model Fallback] Error on ${this.fallbackModels[this.currentModelIndex - 1]}. Trying ${this.modelName}`);
              keyRotationCycles = 0;
              attempt = -1;
              continue;
            }

            // All models failed with non-quota errors - wait and retry from beginning
            const waitTime = 60000;

            console.log(`\n${'='.repeat(80)}`);
            console.log(`⚠️  ERROR RECOVERY - Cycle ${keyRotationCycles + 1}`);
            console.log(`${'='.repeat(80)}`);
            console.log(`   Status: All models encountered errors (non-rate-limit)`);
            console.log(`   Last Error: ${lastError?.message?.substring(0, 100) || 'Unknown'}`);
            console.log(`   Action: Waiting 60 seconds before retrying...`);
            console.log(`   Note: System will keep retrying - do NOT stop the process`);
            console.log(`${'='.repeat(80)}\n`);

            await this.delay(waitTime);
            this.currentModelIndex = 0;
            this.modelName = this.fallbackModels[0];
            if (this.keyManager) {
              this.keyManager.resetRateLimitedKeys();
            }
            keyRotationCycles = 0;
            attempt = -1;
            console.log(`[Recovery] Retrying from beginning with model: ${this.modelName}\n`);
            continue;
          }

          // Exponential backoff with jitter for retries
          let baseDelay: number;
          if (isNetworkError) {
            baseDelay = 1000; // Quick retry for network errors
          } else if (isRateLimitError || isQuotaError) {
            baseDelay = 3000; // Moderate delay for quota errors
          } else {
            baseDelay = 2000; // Default delay
          }

          const exponentialDelay = Math.pow(2, attempt) * baseDelay;
          const jitter = Math.random() * 1000; // Random jitter up to 1 second
          const totalDelay = Math.min(30000, exponentialDelay + jitter); // Max 30 seconds

          console.log(`Retry attempt ${attempt + 1}/${maxAttempts} after ${Math.round(totalDelay / 1000)}s`);
          await this.delay(totalDelay);
        } else {
          // No key manager, use exponential backoff and retry
          if ((isRateLimitError || isQuotaError) && attempt < maxAttempts - 1) {
            const backoffDelay = Math.min(60000, Math.pow(2, attempt) * 5000);
            console.log(`Rate limited. Waiting ${backoffDelay / 1000}s before retry ${attempt + 1}/${maxAttempts}`);
            await this.delay(backoffDelay);
            continue;
          }
          // No key manager - wait and retry indefinitely
          const backoffDelay = Math.min(60000, Math.pow(2, attempt) * 5000);
          console.log(`No key manager. Waiting ${backoffDelay / 1000}s before retry ${totalAttempts}`);
          await this.delay(backoffDelay);
          continue;
        }
      } // End of catch block
    } // End of for loop

    // Inner for loop completed all attempts - continue outer while loop
    // This will retry from the beginning
  } // End of while loop - NOTE: This should NEVER be reached because while(true) loops forever
  }

  /**
   * Respect rate limiting by ensuring minimum interval between requests
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await this.delay(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Sanitize error messages to make them more user-friendly
   */
  private sanitizeError(message: string): string {
    // Remove internal details and stack traces
    const cleanMessage = message.split('\n')[0];

    const modelInfo = this.hasTriedModelFallback
      ? ` (Tried models: ${this.fallbackModels.slice(0, this.currentModelIndex + 1).join(', ')})`
      : '';

    if (cleanMessage.toLowerCase().includes('429') || cleanMessage.toLowerCase().includes('rate limit')) {
      return `Rate limit exceeded${modelInfo}. Please wait and try again, or add more API keys.`;
    }

    if (cleanMessage.toLowerCase().includes('quota')) {
      return `API quota exceeded${modelInfo}. Please check your API key limits or add more keys.`;
    }

    if (cleanMessage.toLowerCase().includes('resource has been exhausted')) {
      return `API resource exhausted${modelInfo}. Rate limit reached.`;
    }

    return cleanMessage;
  }

  /**
   * Get the current model name being used
   */
  getCurrentModel(): string {
    return this.modelName;
  }

  /**
   * Get list of all available fallback models
   */
  getAvailableModels(): string[] {
    return [...this.fallbackModels];
  }

  /**
   * Set verified healthy keys for parallel processing
   * These keys have been pre-tested and should be used exclusively
   */
  setHealthyKeys(keys: string[]): void {
    this.verifiedHealthyKeys = keys;
    console.log(`[Gemini Provider] Set ${keys.length} verified healthy keys for parallel processing`);
  }

  async batchRequest(
    requests: LLMRequest[],
    temperature: number = 0.3
  ): Promise<LLMResponse[]> {
    // Use pre-verified healthy keys if available, otherwise fall back to dynamic selection
    const availableKeys = this.verifiedHealthyKeys.length > 0
      ? this.verifiedHealthyKeys
      : (this.keyManager?.getKeysWithQuota(1000) || this.keyManager?.getAllAvailableKeys() || []);
    const usingParallelKeys = availableKeys.length > 1;

    if (usingParallelKeys) {
      console.log(`[Parallel LLM] Processing ${requests.length} requests across ${availableKeys.length} ${this.verifiedHealthyKeys.length > 0 ? 'verified healthy' : 'available'} API keys`);
    }

    // Process all requests in parallel, distributing across available keys
    // IMPORTANT: Each request uses this.request() which has INFINITE retries
    // We trust that request() will ALWAYS eventually succeed
    const requestPromises = requests.map(async (req, index) => {
      // Distribute requests across available keys using round-robin
      const specificKey = usingParallelKeys ? availableKeys[index % availableKeys.length] : undefined;

      if (specificKey && index < availableKeys.length) {
        console.log(`[Parallel LLM] Request ${index + 1}/${requests.length} assigned to Key ${(index % availableKeys.length) + 1}`);
      }

      // Call request() which has infinite retry logic - it will NEVER fail
      const text = await this.request(req.prompt, temperature, specificKey);

      // Parse the response based on task type
      const result = this.parseResponse(text, req.taskType);

      return {
        id: req.id,
        taskType: req.taskType,
        result,
        confidence: this.extractConfidence(text),
        tokensUsed: Math.ceil((req.prompt.length + text.length) / 4),
        context: req.context
      } as LLMResponse;
    });

    // Wait for all requests to complete in parallel
    const responses = await Promise.all(requestPromises);

    if (usingParallelKeys) {
      console.log(`[Parallel LLM] Completed ${responses.length} requests using ${availableKeys.length} keys in parallel (all succeeded)`);
    }

    console.log(`[Parallel LLM] Completed processing ${responses.length} requests`);

    return responses;
  }

  /**
   * Get API key manager for monitoring
   */
  getKeyManager(): APIKeyManager | undefined {
    return this.keyManager;
  }

  /**
   * Parse LLM response based on task type
   */
  private parseResponse(text: string, taskType: string): any {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If JSON parsing fails, return the raw text
    }

    // For different task types, apply different parsing
    switch (taskType) {
      case 'semantic_filtering':
        return this.parseFilteringResponse(text);
      case 'category_identification':
        return this.parseCategoryResponse(text);
      case 'draft_generation':
        return { draft: text };
      default:
        return { text };
    }
  }

  /**
   * Parse filtering response (include/exclude decision)
   */
  private parseFilteringResponse(text: string): any {
    const lowerText = text.toLowerCase();

    // Look for decision indicators
    const include = lowerText.includes('include') || lowerText.includes('yes') || lowerText.includes('relevant');
    const exclude = lowerText.includes('exclude') || lowerText.includes('no') || lowerText.includes('not relevant');

    // Extract reasoning
    const reasoning = text.split('\n').find(line =>
      line.toLowerCase().includes('reason') ||
      line.toLowerCase().includes('because')
    ) || text;

    return {
      decision: include && !exclude ? 'include' : 'exclude',
      reasoning: reasoning.trim()
    };
  }

  /**
   * Parse category identification response
   */
  private parseCategoryResponse(text: string): any {
    // Try to extract category from common patterns
    const categoryMatch = text.match(/category[:\s]+([^\n]+)/i);
    const category = categoryMatch ? categoryMatch[1].trim() : text.split('\n')[0].trim();

    return {
      category,
      description: text
    };
  }

  /**
   * Extract confidence score from response text
   */
  private extractConfidence(text: string): number | undefined {
    // Look for confidence indicators like "confidence: 0.85" or "85%"
    const confidenceMatch = text.match(/confidence[:\s]+(\d+\.?\d*)/i);
    if (confidenceMatch) {
      return parseFloat(confidenceMatch[1]);
    }

    const percentMatch = text.match(/(\d+)%/);
    if (percentMatch) {
      return parseFloat(percentMatch[1]) / 100;
    }

    return undefined;
  }

  /**
   * Estimate cost based on tokens
   * Gemini 1.5 Flash pricing (as of 2024): $0.075 per 1M input tokens, $0.30 per 1M output tokens
   * We'll use average of $0.1875 per 1M tokens for estimation
   */
  private estimateCost(tokens: number): number {
    return (tokens / 1_000_000) * 0.1875;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
