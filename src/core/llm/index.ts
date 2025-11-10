/**
 * LLM Module - Exports for LLM services and providers
 */

export { LLMService } from './llm-service';
export { LLMProvider, BaseLLMProvider, UsageStats } from './base-provider';
export { GeminiProvider } from './gemini-provider';
export { APIKeyManager } from './api-key-manager';

/**
 * Create a default LLM configuration
 */
export function createDefaultLLMConfig() {
  return {
    enabled: true,
    provider: 'gemini' as const,
    model: 'gemini-1.5-flash',
    batchSize: 10,
    maxConcurrentBatches: 3,
    timeout: 30000,
    retryAttempts: 3,
    temperature: 0.3,
    fallbackStrategy: 'rule_based' as const,
    enableKeyRotation: true
  };
}
