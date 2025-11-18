/**
 * Google Gemini LLM Provider
 * Uses the Google Generative AI SDK for Gemini API
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { BaseLLMProvider } from './base-provider';
import { LLMRequest, LLMResponse } from '../types';
import { APIKeyManager } from './api-key-manager';

export class GeminiProvider extends BaseLLMProvider {
  readonly name = 'gemini';
  private keyManager?: APIKeyManager;
  private defaultModel = 'gemini-2.5-flash'; // Updated to working model (tested 2025-11-18)
  private modelName: string = this.defaultModel;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // Minimum 1 second between requests

  // Fallback models to try when primary model's quota is exhausted
  // Updated 2025-11-18: Only using models verified as working via API tests
  private fallbackModels: string[] = [
    'gemini-2.5-flash',         // Primary: Latest stable model with good rate limits
    'gemini-2.5-flash-lite',    // Fallback 1: Lighter version, faster responses
  ];
  private currentModelIndex: number = 0;
  private hasTriedModelFallback: boolean = false;

  async initialize(apiKey: string, config?: { model?: string; keyManager?: APIKeyManager }): Promise<void> {
    await super.initialize(apiKey, config);

    this.modelName = config?.model || this.defaultModel;

    // Set up fallback models list with the configured model as primary
    if (config?.model && config.model !== this.defaultModel) {
      // If a custom model is specified, make it the primary and add others as fallbacks
      this.fallbackModels = [
        config.model,
        ...this.fallbackModels.filter(m => m !== config.model)
      ];
    }
    // Set current model to the first in the fallback list
    this.modelName = this.fallbackModels[this.currentModelIndex];

    // Use provided key manager or API key
    if (config?.keyManager) {
      this.keyManager = config.keyManager;
    } else if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
  }

  /**
   * Get a model instance with the current API key
   */
  private getModel(): GenerativeModel {
    const apiKey = this.keyManager?.getCurrentKey() || this.apiKey;

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
      console.log('[Model Fallback] Reset all API keys for new model');
    }

    return true;
  }

  async request(prompt: string, temperature: number = 0.3): Promise<string> {
    let lastError: Error | null = null;
    const maxAttempts = 5; // Increased from 3 to 5

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Rate limiting: ensure minimum interval between requests
        await this.respectRateLimit();

        const model = this.getModel();

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: 2048,
          },
        });

        const response = result.response;
        const text = response.text();

        // Estimate tokens and cost (Gemini 1.5 Flash pricing)
        const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);
        const cost = this.estimateCost(estimatedTokens);
        this.updateStats(estimatedTokens, cost);

        // Mark key as successful
        if (this.keyManager) {
          this.keyManager.markSuccess();
        }

        // Log successful model usage (only when using fallback)
        if (this.hasTriedModelFallback) {
          console.log(`[Model Fallback] Successfully using fallback model: ${this.modelName}`);
        }

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const errorMessage = lastError.message.toLowerCase();

        // Determine if this is a rate limit error
        const isRateLimitError = errorMessage.includes('rate limit') ||
                                  errorMessage.includes('429') ||
                                  errorMessage.includes('quota') ||
                                  errorMessage.includes('resource has been exhausted');

        // Handle error and rotate key if available
        if (this.keyManager) {
          await this.keyManager.handleError(error);

          // Check if we have more keys to try
          if (!this.keyManager.hasAvailableKeys()) {
            // No more keys available for current model
            if (isRateLimitError) {
              // Try switching to a fallback model
              if (this.tryNextModel()) {
                console.log(`[Model Fallback] All keys exhausted for current model. Retrying with ${this.modelName}`);
                // Reset attempt counter for new model
                attempt = -1; // Will be incremented to 0 in next iteration
                continue;
              } else if (attempt < maxAttempts - 1) {
                // All models exhausted, try waiting before final retry
                const backoffDelay = Math.min(120000, Math.pow(2, attempt) * 5000); // Max 2 minutes
                console.log(`All models and keys exhausted. Waiting ${backoffDelay / 1000}s before final retry ${attempt + 1}/${maxAttempts}`);
                await this.delay(backoffDelay);
                // Reset all keys across all models for final attempt
                this.keyManager.resetRateLimitedKeys();
                continue;
              }
            }
            throw new Error(`Gemini API request failed - all keys and models exhausted: ${this.sanitizeError(lastError.message)}`);
          }

          // Exponential backoff with jitter for retries
          const baseDelay = isRateLimitError ? 5000 : 2000; // Longer delay for rate limits
          const exponentialDelay = Math.pow(2, attempt) * baseDelay;
          const jitter = Math.random() * 1000; // Random jitter up to 1 second
          const totalDelay = Math.min(30000, exponentialDelay + jitter); // Max 30 seconds

          console.log(`Retry attempt ${attempt + 1}/${maxAttempts} after ${Math.round(totalDelay / 1000)}s`);
          await this.delay(totalDelay);
        } else {
          // No key manager, use exponential backoff and retry
          if (isRateLimitError && attempt < maxAttempts - 1) {
            const backoffDelay = Math.min(60000, Math.pow(2, attempt) * 5000);
            console.log(`Rate limited. Waiting ${backoffDelay / 1000}s before retry ${attempt + 1}/${maxAttempts}`);
            await this.delay(backoffDelay);
            continue;
          }
          throw new Error(`Gemini API request failed: ${this.sanitizeError(lastError.message)}`);
        }
      }
    }

    throw new Error(`Gemini API request failed after ${maxAttempts} attempts: ${this.sanitizeError(lastError?.message || 'Unknown error')}`);
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

  async batchRequest(
    requests: LLMRequest[],
    temperature: number = 0.3
  ): Promise<LLMResponse[]> {
    const responses: LLMResponse[] = [];

    // Reduced batch size to avoid overwhelming the API
    // Process sequentially to better handle rate limits
    const batchSize = 3; // Reduced from 10 to 3 for better rate limit handling

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      const batchPromises = batch.map(async (req) => {
        try {
          const text = await this.request(req.prompt, temperature);

          // Parse the response based on task type
          const result = this.parseResponse(text, req.taskType);

          return {
            id: req.id,
            taskType: req.taskType,
            result,
            confidence: this.extractConfidence(text),
            tokensUsed: Math.ceil((req.prompt.length + text.length) / 4)
          } as LLMResponse;
        } catch (error) {
          // Return graceful error response
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error processing request ${req.id}:`, errorMessage);

          return {
            id: req.id,
            taskType: req.taskType,
            result: null,
            error: this.sanitizeError(errorMessage)
          } as LLMResponse;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      responses.push(...batchResults);

      // Longer delay between batches to avoid rate limits
      // Gemini free tier: 15 RPM (requests per minute) = 1 request per 4 seconds
      // With multiple keys, we can process faster
      if (i + batchSize < requests.length) {
        const keyCount = this.keyManager?.getActiveKeyCount() || 1;
        // Base delay: 4 seconds per request, scaled by number of active keys
        // With 1 key: ~4s, with 3 keys: ~1.5s, with 5 keys: ~1s
        const baseDelayPerRequest = 4000;
        const delayMs = Math.max(2000, baseDelayPerRequest / Math.max(1, keyCount));

        const modelInfo = this.hasTriedModelFallback ? ` [Using: ${this.modelName}]` : '';
        console.log(`Batch ${Math.floor(i / batchSize) + 1} complete${modelInfo}. Waiting ${Math.round(delayMs / 1000)}s before next batch (${keyCount} active keys)`);
        await this.delay(delayMs);
      }
    }

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
