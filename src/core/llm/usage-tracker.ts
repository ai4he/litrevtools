/**
 * Usage Tracker - Global tracking of LLM usage per API key and model
 * Tracks requests, tokens, and quota consumption with daily reset
 */

import { APIKeyInfo } from '../types';

export interface UsageStats {
  keyLabel: string;
  apiKeyMasked: string;
  model: string;
  requestCount: number;
  tokenCount: number;
  lastUsed: Date;
  dayStarted: Date;
}

export interface DailyUsageSummary {
  date: string;
  totalRequests: number;
  totalTokens: number;
  byModel: Record<string, {
    requests: number;
    tokens: number;
  }>;
  byKey: Record<string, {
    requests: number;
    tokens: number;
    models: Record<string, {
      requests: number;
      tokens: number;
    }>;
  }>;
}

/**
 * Global usage tracking singleton
 */
class UsageTrackerSingleton {
  // Map structure: key => model => usage data
  private usage: Map<string, Map<string, {
    requestCount: number;
    tokenCount: number;
    lastUsed: Date;
    dayStarted: Date;
    keyLabel: string;
  }>> = new Map();

  // Historical daily summaries (kept for the last 7 days)
  private historicalData: DailyUsageSummary[] = [];
  private readonly MAX_HISTORY_DAYS = 7;

  private currentDay: string;

  constructor() {
    this.currentDay = this.getTodayString();
    console.log('[Usage Tracker] Initialized for date:', this.currentDay);
  }

  /**
   * Get today's date as a string (YYYY-MM-DD)
   */
  private getTodayString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Check if we need to reset to a new day
   */
  private checkDayReset(): void {
    const today = this.getTodayString();

    if (today !== this.currentDay) {
      console.log(`[Usage Tracker] Day changed from ${this.currentDay} to ${today}. Archiving old data and resetting...`);

      // Archive yesterday's data
      this.archiveCurrentDay();

      // Reset all usage data
      this.usage.clear();
      this.currentDay = today;

      console.log('[Usage Tracker] Reset complete for new day');
    }
  }

  /**
   * Archive current day's usage to historical data
   */
  private archiveCurrentDay(): void {
    const summary = this.getDailySummary();

    // Add to historical data
    this.historicalData.push(summary);

    // Keep only last MAX_HISTORY_DAYS days
    if (this.historicalData.length > this.MAX_HISTORY_DAYS) {
      this.historicalData.shift();
    }

    console.log(`[Usage Tracker] Archived data for ${summary.date}:`, {
      totalRequests: summary.totalRequests,
      totalTokens: summary.totalTokens,
      models: Object.keys(summary.byModel).length,
      keys: Object.keys(summary.byKey).length
    });
  }

  /**
   * Mask an API key for display
   */
  private maskKey(key: string): string {
    if (key.length <= 12) {
      return '*'.repeat(key.length);
    }
    return `${key.substring(0, 8)}${'*'.repeat(key.length - 12)}${key.substring(key.length - 4)}`;
  }

  /**
   * Record usage for a specific API key and model
   */
  recordUsage(apiKey: string, model: string, tokensUsed: number, keyLabel?: string): void {
    this.checkDayReset();

    // Get or create key entry
    if (!this.usage.has(apiKey)) {
      this.usage.set(apiKey, new Map());
    }

    const keyUsage = this.usage.get(apiKey)!;

    // Get or create model entry
    if (!keyUsage.has(model)) {
      keyUsage.set(model, {
        requestCount: 0,
        tokenCount: 0,
        lastUsed: new Date(),
        dayStarted: new Date(),
        keyLabel: keyLabel || 'Unknown'
      });
    }

    const modelUsage = keyUsage.get(model)!;

    // Update usage
    modelUsage.requestCount++;
    modelUsage.tokenCount += tokensUsed;
    modelUsage.lastUsed = new Date();

    // Update key label if provided
    if (keyLabel) {
      modelUsage.keyLabel = keyLabel;
    }
  }

  /**
   * Get usage statistics for all keys and models
   */
  getAllUsageStats(): UsageStats[] {
    this.checkDayReset();

    const stats: UsageStats[] = [];

    for (const [apiKey, modelMap] of this.usage.entries()) {
      for (const [model, usage] of modelMap.entries()) {
        stats.push({
          keyLabel: usage.keyLabel,
          apiKeyMasked: this.maskKey(apiKey),
          model,
          requestCount: usage.requestCount,
          tokenCount: usage.tokenCount,
          lastUsed: usage.lastUsed,
          dayStarted: usage.dayStarted
        });
      }
    }

    return stats;
  }

  /**
   * Get usage statistics for a specific API key
   */
  getKeyUsageStats(apiKey: string): UsageStats[] {
    this.checkDayReset();

    const stats: UsageStats[] = [];
    const keyUsage = this.usage.get(apiKey);

    if (!keyUsage) {
      return stats;
    }

    for (const [model, usage] of keyUsage.entries()) {
      stats.push({
        keyLabel: usage.keyLabel,
        apiKeyMasked: this.maskKey(apiKey),
        model,
        requestCount: usage.requestCount,
        tokenCount: usage.tokenCount,
        lastUsed: usage.lastUsed,
        dayStarted: usage.dayStarted
      });
    }

    return stats;
  }

  /**
   * Get usage statistics for a specific model across all keys
   */
  getModelUsageStats(model: string): UsageStats[] {
    this.checkDayReset();

    const stats: UsageStats[] = [];

    for (const [apiKey, modelMap] of this.usage.entries()) {
      const usage = modelMap.get(model);
      if (usage) {
        stats.push({
          keyLabel: usage.keyLabel,
          apiKeyMasked: this.maskKey(apiKey),
          model,
          requestCount: usage.requestCount,
          tokenCount: usage.tokenCount,
          lastUsed: usage.lastUsed,
          dayStarted: usage.dayStarted
        });
      }
    }

    return stats;
  }

  /**
   * Get total usage for a specific key across all models
   */
  getKeyTotalUsage(apiKey: string): { requestCount: number; tokenCount: number } {
    this.checkDayReset();

    const keyUsage = this.usage.get(apiKey);
    if (!keyUsage) {
      return { requestCount: 0, tokenCount: 0 };
    }

    let requestCount = 0;
    let tokenCount = 0;

    for (const usage of keyUsage.values()) {
      requestCount += usage.requestCount;
      tokenCount += usage.tokenCount;
    }

    return { requestCount, tokenCount };
  }

  /**
   * Get total usage for a specific model across all keys
   */
  getModelTotalUsage(model: string): { requestCount: number; tokenCount: number } {
    this.checkDayReset();

    let requestCount = 0;
    let tokenCount = 0;

    for (const modelMap of this.usage.values()) {
      const usage = modelMap.get(model);
      if (usage) {
        requestCount += usage.requestCount;
        tokenCount += usage.tokenCount;
      }
    }

    return { requestCount, tokenCount };
  }

  /**
   * Get daily summary of all usage
   */
  getDailySummary(): DailyUsageSummary {
    this.checkDayReset();

    const summary: DailyUsageSummary = {
      date: this.currentDay,
      totalRequests: 0,
      totalTokens: 0,
      byModel: {},
      byKey: {}
    };

    for (const [apiKey, modelMap] of this.usage.entries()) {
      const keyMasked = this.maskKey(apiKey);

      for (const [model, usage] of modelMap.entries()) {
        // Update totals
        summary.totalRequests += usage.requestCount;
        summary.totalTokens += usage.tokenCount;

        // Update by model
        if (!summary.byModel[model]) {
          summary.byModel[model] = { requests: 0, tokens: 0 };
        }
        summary.byModel[model].requests += usage.requestCount;
        summary.byModel[model].tokens += usage.tokenCount;

        // Update by key
        if (!summary.byKey[keyMasked]) {
          summary.byKey[keyMasked] = {
            requests: 0,
            tokens: 0,
            models: {}
          };
        }
        summary.byKey[keyMasked].requests += usage.requestCount;
        summary.byKey[keyMasked].tokens += usage.tokenCount;

        // Update by key and model
        if (!summary.byKey[keyMasked].models[model]) {
          summary.byKey[keyMasked].models[model] = { requests: 0, tokens: 0 };
        }
        summary.byKey[keyMasked].models[model].requests += usage.requestCount;
        summary.byKey[keyMasked].models[model].tokens += usage.tokenCount;
      }
    }

    return summary;
  }

  /**
   * Get historical usage data
   */
  getHistoricalData(): DailyUsageSummary[] {
    return [...this.historicalData];
  }

  /**
   * Get usage statistics formatted for console logging
   */
  getFormattedSummary(): string {
    const summary = this.getDailySummary();

    let output = `\n=== Usage Summary for ${summary.date} ===\n`;
    output += `Total Requests: ${summary.totalRequests}\n`;
    output += `Total Tokens: ${summary.totalTokens}\n`;

    output += `\nBy Model:\n`;
    for (const [model, stats] of Object.entries(summary.byModel)) {
      output += `  ${model}: ${stats.requests} requests, ${stats.tokens} tokens\n`;
    }

    output += `\nBy API Key:\n`;
    for (const [key, stats] of Object.entries(summary.byKey)) {
      output += `  ${key}: ${stats.requests} requests, ${stats.tokens} tokens\n`;
      for (const [model, modelStats] of Object.entries(stats.models)) {
        output += `    - ${model}: ${modelStats.requests} requests, ${modelStats.tokens} tokens\n`;
      }
    }

    return output;
  }

  /**
   * Reset all usage data (for testing purposes)
   */
  resetAll(): void {
    this.usage.clear();
    this.historicalData = [];
    this.currentDay = this.getTodayString();
    console.log('[Usage Tracker] All data reset');
  }

  /**
   * Force archive current data (for testing day transitions)
   */
  forceArchive(): void {
    this.archiveCurrentDay();
  }
}

// Export singleton instance
export const UsageTracker = new UsageTrackerSingleton();
