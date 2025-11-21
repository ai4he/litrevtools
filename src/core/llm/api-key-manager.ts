/**
 * API Key Manager - Handles API key rotation and status tracking
 */

import { APIKeyInfo, APIKeyStatus, FallbackStrategy } from '../types';

export class APIKeyManager {
  private keys: APIKeyInfo[] = [];
  private currentKeyIndex: number = 0;
  private fallbackStrategy: FallbackStrategy;
  private enableRotation: boolean;
  private onKeyExhausted?: () => Promise<string | null>;
  private currentModel: string = 'gemini-2.0-flash-lite'; // Track current model for persistent quota

  constructor(
    apiKeys: string | string[],
    fallbackStrategy: FallbackStrategy = 'rule_based',
    enableRotation: boolean = true
  ) {
    this.fallbackStrategy = fallbackStrategy;
    this.enableRotation = enableRotation;

    // Convert single key or array to APIKeyInfo[]
    const keysArray = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
    this.keys = keysArray.filter(key => key && key.trim()).map((key, index) => ({
      key: key.trim(),
      status: 'active' as APIKeyStatus,
      errorCount: 0,
      requestCount: 0,
      label: `Key ${index + 1}`
    }));

    if (this.keys.length === 0) {
      throw new Error('At least one API key must be provided');
    }
  }

  /**
   * Set callback for when all keys are exhausted and need user input
   */
  setOnKeyExhausted(callback: () => Promise<string | null>): void {
    this.onKeyExhausted = callback;
  }

  /**
   * Get the current active API key
   */
  getCurrentKey(): string | null {
    if (!this.enableRotation) {
      // If rotation disabled, always return first key
      return this.keys[0]?.key || null;
    }

    // Try to find an active key
    const activeKey = this.keys.find(k => k.status === 'active');
    if (activeKey) {
      return activeKey.key;
    }

    // Try to find a key that might have recovered from rate limit
    const recoverableKey = this.keys.find(k =>
      k.status === 'rate_limited' &&
      k.rateLimitResetAt &&
      k.rateLimitResetAt <= new Date()
    );

    if (recoverableKey) {
      recoverableKey.status = 'active';
      recoverableKey.errorCount = 0;
      return recoverableKey.key;
    }

    return null;
  }

  /**
   * Get all currently available API keys for parallel processing
   * Returns an array of active keys that can be used simultaneously
   */
  getAllAvailableKeys(): string[] {
    const availableKeys: string[] = [];

    for (const keyInfo of this.keys) {
      // Include active keys
      if (keyInfo.status === 'active') {
        availableKeys.push(keyInfo.key);
        continue;
      }

      // Check if rate-limited keys have recovered
      if (keyInfo.status === 'rate_limited' &&
          keyInfo.rateLimitResetAt &&
          keyInfo.rateLimitResetAt <= new Date()) {
        keyInfo.status = 'active';
        keyInfo.errorCount = 0;
        availableKeys.push(keyInfo.key);
      }
    }

    return availableKeys;
  }

  /**
   * Get a specific API key by round-robin distribution
   * Useful for distributing requests across all available keys
   * @param index The request index (will be mapped to a key using modulo)
   */
  getKeyByIndex(index: number): string | null {
    const availableKeys = this.getAllAvailableKeys();

    if (availableKeys.length === 0) {
      return null;
    }

    // Use modulo to distribute requests evenly across available keys
    const keyIndex = index % availableKeys.length;
    return availableKeys[keyIndex];
  }

  /**
   * Mark a specific API key as successfully used
   * @param apiKey The API key that was used successfully
   */
  markKeySuccess(apiKey: string): void {
    const keyInfo = this.keys.find(k => k.key === apiKey);
    if (!keyInfo) return;

    keyInfo.lastUsed = new Date();
    keyInfo.requestCount++;
    keyInfo.errorCount = 0;

    // If key was in error state, mark as active again
    if (keyInfo.status !== 'quota_exceeded' && keyInfo.status !== 'invalid') {
      keyInfo.status = 'active';
    }
  }

  /**
   * Handle error for a specific API key
   * @param apiKey The API key that encountered an error
   * @param error The error that occurred
   */
  async handleKeyError(apiKey: string, error: any): Promise<void> {
    const keyInfo = this.keys.find(k => k.key === apiKey);
    if (!keyInfo) return;

    keyInfo.lastUsed = new Date();

    // Determine error type from message and status code
    const errorMessage = error?.message?.toLowerCase() || '';
    const isNetworkError = errorMessage.includes('network') ||
                           errorMessage.includes('timeout') ||
                           errorMessage.includes('econnrefused') ||
                           errorMessage.includes('enotfound') ||
                           errorMessage.includes('fetch failed');

    const isRateLimitError = errorMessage.includes('rate limit') ||
                             errorMessage.includes('429') ||
                             errorMessage.includes('resource has been exhausted');

    const isQuotaError = errorMessage.includes('quota') && errorMessage.includes('exceeded');

    const isAuthError = errorMessage.includes('invalid') ||
                        errorMessage.includes('unauthorized') ||
                        errorMessage.includes('401') ||
                        errorMessage.includes('403');

    // Handle different error types appropriately
    if (isAuthError) {
      // Permanent error - mark key as invalid and don't increment error count
      keyInfo.status = 'invalid';
      console.log(`Key ${keyInfo.label} marked as invalid (authentication failed)`);
    } else if (isRateLimitError) {
      keyInfo.status = 'rate_limited';
      keyInfo.errorCount++;
      // Gemini rate limits reset every minute (60 req/min for free tier)
      // Set reset time to 60 seconds
      keyInfo.rateLimitResetAt = new Date(Date.now() + 60000);
      console.log(`Key ${keyInfo.label} rate limited, will reset at ${keyInfo.rateLimitResetAt.toISOString()}`);
    } else if (isQuotaError) {
      keyInfo.status = 'quota_exceeded';
      keyInfo.errorCount++;
      // Daily quota - longer reset time (but still check after 1 hour in case it's per-hour)
      keyInfo.rateLimitResetAt = new Date(Date.now() + 3600000); // 1 hour
      console.log(`Key ${keyInfo.label} quota exceeded, will reset at ${keyInfo.rateLimitResetAt.toISOString()}`);
    } else if (isNetworkError) {
      // Transient network error - don't change status, just increment error count
      keyInfo.errorCount++;
      console.log(`Key ${keyInfo.label} encountered network error (count: ${keyInfo.errorCount})`);
      // Only mark as error if persistent network issues
      if (keyInfo.errorCount >= 5) {
        keyInfo.status = 'error';
        console.log(`Key ${keyInfo.label} disabled due to repeated network errors`);
      }
    } else {
      // Unknown error - treat conservatively
      keyInfo.errorCount++;
      keyInfo.status = 'error';
      console.log(`Key ${keyInfo.label} encountered error: ${errorMessage.substring(0, 100)} (count: ${keyInfo.errorCount})`);

      // Only mark as unusable if error count exceeds threshold
      if (keyInfo.errorCount >= 3) {
        console.log(`Key ${keyInfo.label} disabled due to repeated errors`);
      }
    }
  }

  /**
   * Mark current key as having an error and rotate if needed
   */
  async handleError(error: any): Promise<void> {
    const currentKey = this.keys[this.currentKeyIndex];
    if (!currentKey) return;

    currentKey.lastUsed = new Date();

    // Determine error type from message and status code
    const errorMessage = error?.message?.toLowerCase() || '';
    const isNetworkError = errorMessage.includes('network') ||
                           errorMessage.includes('timeout') ||
                           errorMessage.includes('econnrefused') ||
                           errorMessage.includes('enotfound') ||
                           errorMessage.includes('fetch failed');

    const isRateLimitError = errorMessage.includes('rate limit') ||
                             errorMessage.includes('429') ||
                             errorMessage.includes('resource has been exhausted');

    const isQuotaError = errorMessage.includes('quota') && errorMessage.includes('exceeded');

    const isAuthError = errorMessage.includes('invalid') ||
                        errorMessage.includes('unauthorized') ||
                        errorMessage.includes('401') ||
                        errorMessage.includes('403');

    // Handle different error types appropriately
    if (isAuthError) {
      currentKey.status = 'invalid';
      if (this.enableRotation) {
        await this.rotateToNextKey();
      }
    } else if (isRateLimitError) {
      currentKey.status = 'rate_limited';
      currentKey.errorCount++;
      // Gemini rate limits reset every minute
      currentKey.rateLimitResetAt = new Date(Date.now() + 60000);
      if (this.enableRotation) {
        await this.rotateToNextKey();
      }
    } else if (isQuotaError) {
      currentKey.status = 'quota_exceeded';
      currentKey.errorCount++;
      currentKey.rateLimitResetAt = new Date(Date.now() + 3600000); // 1 hour
      if (this.enableRotation) {
        await this.rotateToNextKey();
      }
    } else if (isNetworkError) {
      // Transient network error - don't rotate immediately
      currentKey.errorCount++;
      // Only rotate if persistent network issues
      if (currentKey.errorCount >= 5 && this.enableRotation) {
        currentKey.status = 'error';
        await this.rotateToNextKey();
      }
    } else {
      currentKey.status = 'error';
      currentKey.errorCount++;
      // Only rotate if error count exceeds threshold
      if (currentKey.errorCount >= 3 && this.enableRotation) {
        await this.rotateToNextKey();
      }
    }
  }

  /**
   * Mark current key as successfully used
   */
  markSuccess(): void {
    const currentKey = this.keys[this.currentKeyIndex];
    if (!currentKey) return;

    currentKey.lastUsed = new Date();
    currentKey.requestCount++;
    currentKey.errorCount = 0;

    // If key was in error state, mark as active again
    if (currentKey.status !== 'quota_exceeded' && currentKey.status !== 'invalid') {
      currentKey.status = 'active';
    }
  }

  /**
   * Rotate to the next available API key
   */
  private async rotateToNextKey(): Promise<void> {
    const startIndex = this.currentKeyIndex;
    let attempts = 0;

    while (attempts < this.keys.length) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      attempts++;

      const key = this.keys[this.currentKeyIndex];

      // Skip if we're back at the start
      if (this.currentKeyIndex === startIndex && attempts > 1) {
        break;
      }

      // Check if this key is usable
      if (key.status === 'active') {
        console.log(`Rotated to ${key.label}`);
        return;
      }

      // Check if rate-limited key has recovered
      if (key.status === 'rate_limited' && key.rateLimitResetAt && key.rateLimitResetAt <= new Date()) {
        key.status = 'active';
        key.errorCount = 0;
        console.log(`Recovered and rotated to ${key.label}`);
        return;
      }
    }

    // All keys exhausted - handle based on fallback strategy
    await this.handleAllKeysExhausted();
  }

  /**
   * Handle situation when all API keys are exhausted
   */
  private async handleAllKeysExhausted(): Promise<void> {
    console.warn('All API keys exhausted');

    if (this.fallbackStrategy === 'prompt_user' && this.onKeyExhausted) {
      const newKey = await this.onKeyExhausted();
      if (newKey && newKey.trim()) {
        this.addKey(newKey.trim());
        console.log('New API key added by user');
      }
    }
    // For 'rule_based' and 'fail', the calling code will handle it
  }

  /**
   * Add a new API key to the pool
   */
  addKey(apiKey: string, label?: string): void {
    const newKey: APIKeyInfo = {
      key: apiKey.trim(),
      status: 'active',
      errorCount: 0,
      requestCount: 0,
      label: label || `Key ${this.keys.length + 1}`
    };

    this.keys.push(newKey);
    console.log(`Added new API key: ${newKey.label}`);
  }

  /**
   * Remove an API key from the pool
   */
  removeKey(apiKey: string): void {
    const index = this.keys.findIndex(k => k.key === apiKey);
    if (index !== -1) {
      this.keys.splice(index, 1);
      console.log(`Removed API key`);

      // Adjust current index if needed
      if (this.currentKeyIndex >= this.keys.length) {
        this.currentKeyIndex = Math.max(0, this.keys.length - 1);
      }
    }
  }

  /**
   * Get statistics for all API keys
   */
  getKeyStatistics(): APIKeyInfo[] {
    return this.keys.map(key => ({
      ...key,
      key: this.maskKey(key.key) // Mask the actual key for security
    }));
  }

  /**
   * Get count of active keys
   */
  getActiveKeyCount(): number {
    return this.keys.filter(k => k.status === 'active').length;
  }

  /**
   * Check if there are any available keys
   */
  hasAvailableKeys(): boolean {
    return this.getCurrentKey() !== null;
  }

  /**
   * Get fallback strategy
   */
  getFallbackStrategy(): FallbackStrategy {
    return this.fallbackStrategy;
  }

  /**
   * Set fallback strategy
   */
  setFallbackStrategy(strategy: FallbackStrategy): void {
    this.fallbackStrategy = strategy;
  }

  /**
   * Reset rate-limited keys whose quotas have actually reset
   * ONLY resets keys where the reset time has passed
   * This prevents infinite loops when daily quotas are exhausted
   */
  resetRateLimitedKeys(): void {
    const now = new Date();
    let resetCount = 0;

    for (const key of this.keys) {
      if (key.status === 'rate_limited') {
        // Check if quota reset time has actually passed
        let canReset = false;

        if (key.quotaTracking) {
          // Check RPM quota (resets every 60 seconds)
          const rpmResetPassed = now >= key.quotaTracking.rpm.resetAt;
          // Check RPD quota (resets at midnight PT)
          const rpdResetPassed = now >= key.quotaTracking.rpd.resetAt;

          // Only reset if AT LEAST ONE quota window has passed
          // Prefer waiting for all quotas, but RPM is minimum requirement
          if (rpmResetPassed) {
            canReset = true;

            // If RPD quota is also exhausted and hasn't reset, keep status as rate_limited
            if (key.quotaTracking.rpd.used >= key.quotaTracking.rpd.limit && !rpdResetPassed) {
              canReset = false;
              console.log(`[API Key Manager] Key ${key.label || 'Unknown'} RPM reset but RPD quota still exhausted (resets at ${key.quotaTracking.rpd.resetAt.toLocaleString()})`);
            }
          }
        } else if (key.rateLimitResetAt && now >= key.rateLimitResetAt) {
          // Legacy: Use rateLimitResetAt if quotaTracking not available
          canReset = true;
        }

        if (canReset) {
          key.status = 'active';
          key.errorCount = 0;
          key.rateLimitResetAt = undefined;
          resetCount++;
          console.log(`[API Key Manager] Reset key ${key.label || 'Unknown'} - quota window passed`);
        }
      }
    }

    if (resetCount > 0) {
      console.log(`[API Key Manager] Reset ${resetCount}/${this.keys.length} rate-limited keys`);
    } else {
      console.log(`[API Key Manager] No keys ready to reset - all still within rate limit windows`);
    }
  }

  /**
   * Mask API key for display (show first 8 and last 4 chars)
   */
  private maskKey(key: string): string {
    if (key.length <= 12) {
      return '*'.repeat(key.length);
    }
    return `${key.substring(0, 8)}${'*'.repeat(key.length - 12)}${key.substring(key.length - 4)}`;
  }

  /**
   * Initialize quota tracking for all keys based on current model
   * Should be called when model changes or at startup
   */
  initializeQuotaTracking(modelName: string): void {
    const { QuotaTracker } = require('./quota-tracker');

    // Store the current model for quota tracking
    this.currentModel = modelName;

    for (const key of this.keys) {
      QuotaTracker.initializeQuotaTracking(key, modelName);
    }

    console.log(`[Quota Tracking] Initialized for model: ${modelName}`);
  }

  /**
   * Update quota limits when model changes
   */
  updateQuotaLimits(modelName: string): void {
    const { QuotaTracker } = require('./quota-tracker');

    for (const key of this.keys) {
      QuotaTracker.updateQuotaLimits(key, modelName);
    }

    console.log(`[Quota Tracking] Updated limits for model: ${modelName}`);
  }

  /**
   * Record usage for a specific key (tracks RPM, TPM, RPD)
   * Persists to database for tracking across restarts
   */
  recordKeyUsage(apiKey: string, tokensUsed: number): void {
    const { QuotaTracker } = require('./quota-tracker');
    const keyInfo = this.keys.find(k => k.key === apiKey);

    if (keyInfo) {
      QuotaTracker.recordUsage(keyInfo, tokensUsed, this.currentModel);
    }
  }

  /**
   * Smart key selection - chooses the key with the most available quota
   * Returns null if no keys have available quota
   */
  selectBestAvailableKey(estimatedTokens: number = 1000): string | null {
    const { QuotaTracker } = require('./quota-tracker');

    let bestKey: APIKeyInfo | null = null;
    let bestQuotaRemaining = -1;

    for (const key of this.keys) {
      // Skip unhealthy or invalid keys
      if (key.status === 'invalid' || key.status === 'error') continue;
      if (key.healthCheck && !key.healthCheck.isHealthy) continue;

      // Check if key has available quota
      if (!QuotaTracker.hasAvailableQuota(key, estimatedTokens)) continue;

      // Get quota remaining percentage
      const quotaRemaining = QuotaTracker.getQuotaRemaining(key);

      // Select key with most quota remaining
      if (quotaRemaining > bestQuotaRemaining) {
        bestQuotaRemaining = quotaRemaining;
        bestKey = key;
      }
    }

    if (bestKey) {
      console.log(`[Smart Selection] Selected ${bestKey.label} (${bestQuotaRemaining.toFixed(1)}% quota remaining)`);
      return bestKey.key;
    }

    return null;
  }

  /**
   * Get all keys with available quota, sorted by most quota remaining
   */
  getKeysWithQuota(estimatedTokens: number = 1000): string[] {
    const { QuotaTracker } = require('./quota-tracker');

    const keysWithQuota = this.keys
      .filter(k => {
        if (k.status === 'invalid' || k.status === 'error') return false;
        if (k.healthCheck && !k.healthCheck.isHealthy) return false;
        return QuotaTracker.hasAvailableQuota(k, estimatedTokens);
      })
      .map(k => ({
        key: k.key,
        quotaRemaining: QuotaTracker.getQuotaRemaining(k)
      }))
      .sort((a, b) => b.quotaRemaining - a.quotaRemaining)
      .map(item => item.key);

    return keysWithQuota;
  }

  /**
   * Run health check on all API keys using a simple test request
   * Uses gemini-2.5-flash-lite (free-tier model) for testing to ensure compatibility
   */
  async runHealthCheck(testModel: string = 'gemini-2.5-flash-lite'): Promise<{ healthy: number; unhealthy: number; results: Map<string, boolean> }> {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const results = new Map<string, boolean>();

    console.log(`[Health Check] Starting diagnostic with model: ${testModel}`);

    const testPrompt = 'Respond with only: OK';

    for (const keyInfo of this.keys) {
      try {
        const genAI = new GoogleGenerativeAI(keyInfo.key);
        const model = genAI.getGenerativeModel({ model: testModel });

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 10,
          },
        });

        const response = result.response.text();

        // Mark as healthy
        keyInfo.healthCheck = {
          lastChecked: new Date(),
          isHealthy: true,
          lastError: undefined
        };
        keyInfo.status = 'active';
        keyInfo.errorCount = 0;

        results.set(keyInfo.label || keyInfo.key, true);
        console.log(`[Health Check] ✓ ${keyInfo.label} - HEALTHY`);

        // Small delay between checks to avoid rate limits
        await this.delay(500);

      } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error';

        // Classify error type
        const isRateLimited = errorMessage.toLowerCase().includes('rate limit') ||
                             errorMessage.toLowerCase().includes('429') ||
                             errorMessage.toLowerCase().includes('quota');

        const isAuthError = errorMessage.toLowerCase().includes('invalid') ||
                           errorMessage.toLowerCase().includes('unauthorized') ||
                           errorMessage.toLowerCase().includes('401') ||
                           errorMessage.toLowerCase().includes('403');

        // Mark health status
        if (isRateLimited) {
          // Rate-limited keys are temporarily unavailable but NOT unhealthy
          keyInfo.healthCheck = {
            lastChecked: new Date(),
            isHealthy: true, // Still healthy, just rate-limited
            lastError: errorMessage.substring(0, 100)
          };
          keyInfo.status = 'rate_limited';
          keyInfo.rateLimitResetAt = new Date(Date.now() + 60000);
          results.set(keyInfo.label || keyInfo.key, true); // Count as healthy
          console.log(`[Health Check] ⏸️  ${keyInfo.label} - RATE LIMITED (will recover)`);
        } else if (isAuthError) {
          // Authentication errors = permanently invalid
          keyInfo.healthCheck = {
            lastChecked: new Date(),
            isHealthy: false,
            lastError: errorMessage.substring(0, 100)
          };
          keyInfo.status = 'invalid';
          results.set(keyInfo.label || keyInfo.key, false);
          console.log(`[Health Check] ✗ ${keyInfo.label} - INVALID (auth error)`);
        } else {
          // Other errors = unhealthy
          keyInfo.healthCheck = {
            lastChecked: new Date(),
            isHealthy: false,
            lastError: errorMessage.substring(0, 100)
          };
          keyInfo.status = 'error';
          results.set(keyInfo.label || keyInfo.key, false);
          console.log(`[Health Check] ✗ ${keyInfo.label} - UNHEALTHY (${errorMessage.substring(0, 50)})`);
        }

        // Small delay even on error
        await this.delay(500);
      }
    }

    const healthy = Array.from(results.values()).filter(v => v).length;
    const unhealthy = results.size - healthy;

    console.log(`[Health Check] Complete: ${healthy} healthy (including rate-limited), ${unhealthy} permanently unhealthy out of ${results.size} keys`);

    return { healthy, unhealthy, results };
  }

  /**
   * Get quota status for all keys
   */
  getQuotaStatus(): Array<{ label: string; status: string; quotaRemaining: number; quotaDetails: string }> {
    const { QuotaTracker } = require('./quota-tracker');

    return this.keys.map(k => ({
      label: k.label || 'Unknown',
      status: k.status,
      quotaRemaining: QuotaTracker.getQuotaRemaining(k),
      quotaDetails: QuotaTracker.formatQuotaStatus(k),
      healthStatus: k.healthCheck?.isHealthy ? 'Healthy' : 'Unhealthy'
    }));
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
