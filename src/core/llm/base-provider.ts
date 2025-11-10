/**
 * Base LLM Provider Interface
 * All LLM providers must implement this interface
 */

import { LLMRequest, LLMResponse, LLMTaskType } from '../types';

export interface LLMProvider {
  /**
   * Provider name
   */
  readonly name: string;

  /**
   * Initialize the provider with API key and configuration
   */
  initialize(apiKey: string, config?: any): Promise<void>;

  /**
   * Send a single request to the LLM
   */
  request(prompt: string, temperature?: number): Promise<string>;

  /**
   * Send multiple requests in batch for efficiency
   * Returns responses in the same order as requests
   */
  batchRequest(requests: LLMRequest[], temperature?: number): Promise<LLMResponse[]>;

  /**
   * Check if the provider is available and configured
   */
  isAvailable(): boolean;

  /**
   * Get usage statistics (tokens used, requests made, etc.)
   */
  getUsageStats(): UsageStats;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number; // Estimated cost in USD
  lastRequestTime?: Date;
}

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;
  protected apiKey?: string;
  protected config?: any;
  protected stats: UsageStats = {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0
  };

  async initialize(apiKey: string, config?: any): Promise<void> {
    this.apiKey = apiKey;
    this.config = config;
  }

  abstract request(prompt: string, temperature?: number): Promise<string>;

  abstract batchRequest(requests: LLMRequest[], temperature?: number): Promise<LLMResponse[]>;

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getUsageStats(): UsageStats {
    return { ...this.stats };
  }

  protected updateStats(tokensUsed: number, cost: number): void {
    this.stats.totalRequests++;
    this.stats.totalTokens += tokensUsed;
    this.stats.totalCost += cost;
    this.stats.lastRequestTime = new Date();
  }
}
