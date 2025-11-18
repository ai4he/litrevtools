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

    keyInfo.errorCount++;
    keyInfo.lastUsed = new Date();

    // Determine error type
    const errorMessage = error?.message?.toLowerCase() || '';

    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      keyInfo.status = 'rate_limited';
      // Gemini rate limits typically reset every minute
      // Set conservative reset time of 90 seconds to be safe
      keyInfo.rateLimitResetAt = new Date(Date.now() + 90000);
      console.log(`Key ${keyInfo.label} rate limited, will reset at ${keyInfo.rateLimitResetAt.toISOString()}`);
    } else if (errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
      keyInfo.status = 'quota_exceeded';
      // Quota exceeded might need longer to reset (could be daily quota)
      keyInfo.rateLimitResetAt = new Date(Date.now() + 3600000); // 1 hour
      console.log(`Key ${keyInfo.label} quota exceeded, will reset at ${keyInfo.rateLimitResetAt.toISOString()}`);
    } else if (errorMessage.includes('invalid') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      keyInfo.status = 'invalid';
      console.log(`Key ${keyInfo.label} marked as invalid`);
    } else {
      keyInfo.status = 'error';
      console.log(`Key ${keyInfo.label} encountered error (count: ${keyInfo.errorCount})`);

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

    currentKey.errorCount++;
    currentKey.lastUsed = new Date();

    // Determine error type
    const errorMessage = error?.message?.toLowerCase() || '';

    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      currentKey.status = 'rate_limited';
      // Gemini rate limits typically reset every minute
      // Set conservative reset time of 90 seconds to be safe
      currentKey.rateLimitResetAt = new Date(Date.now() + 90000);

      if (this.enableRotation) {
        await this.rotateToNextKey();
      }
    } else if (errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
      currentKey.status = 'quota_exceeded';
      // Quota exceeded might need longer to reset (could be daily quota)
      // Mark for manual review
      currentKey.rateLimitResetAt = new Date(Date.now() + 3600000); // 1 hour

      if (this.enableRotation) {
        await this.rotateToNextKey();
      }
    } else if (errorMessage.includes('invalid') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      currentKey.status = 'invalid';

      if (this.enableRotation) {
        await this.rotateToNextKey();
      }
    } else {
      currentKey.status = 'error';

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
   * Reset all rate-limited keys (for testing or manual intervention)
   */
  resetRateLimitedKeys(): void {
    for (const key of this.keys) {
      if (key.status === 'rate_limited') {
        key.status = 'active';
        key.errorCount = 0;
        key.rateLimitResetAt = undefined;
      }
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
}
