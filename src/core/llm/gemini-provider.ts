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
  private defaultModel = 'gemini-1.5-flash'; // Fast and cost-effective for batch processing
  private modelName: string = this.defaultModel;

  async initialize(apiKey: string, config?: { model?: string; keyManager?: APIKeyManager }): Promise<void> {
    await super.initialize(apiKey, config);

    this.modelName = config?.model || this.defaultModel;

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

  async request(prompt: string, temperature: number = 0.3): Promise<string> {
    let lastError: Error | null = null;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
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

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Handle error and rotate key if available
        if (this.keyManager) {
          await this.keyManager.handleError(error);

          // Check if we have more keys to try
          if (!this.keyManager.hasAvailableKeys()) {
            throw new Error(`Gemini API request failed - all keys exhausted: ${lastError.message}`);
          }

          // Wait a bit before retry
          await this.delay(1000 * (attempt + 1));
        } else {
          // No key manager, throw immediately
          throw new Error(`Gemini API request failed: ${lastError.message}`);
        }
      }
    }

    throw new Error(`Gemini API request failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  async batchRequest(
    requests: LLMRequest[],
    temperature: number = 0.3
  ): Promise<LLMResponse[]> {
    const responses: LLMResponse[] = [];

    // Process requests in parallel with rate limiting
    const batchSize = 10; // Gemini has generous rate limits
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
          return {
            id: req.id,
            taskType: req.taskType,
            result: null,
            error: error instanceof Error ? error.message : 'Unknown error'
          } as LLMResponse;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      responses.push(...batchResults);

      // Delay between batches to respect rate limits (15 RPM free tier)
      // With batch size 10, we need ~5 second delay to stay under 15 RPM
      if (i + batchSize < requests.length) {
        await this.delay(5000);
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
