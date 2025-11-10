/**
 * Core types for the LitRevTools application
 * These types are shared across all platforms (CLI, Web, Desktop, Mobile)
 */

export interface SearchParameters {
  name?: string;
  inclusionKeywords: string[];
  exclusionKeywords: string[];
  maxResults?: number; // undefined means infinite
  startYear?: number;
  endYear?: number;
  llmConfig?: LLMConfig; // LLM configuration for intelligent tasks
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract?: string;
  url: string;
  citations?: number;
  source: 'google-scholar' | 'semantic-scholar' | 'other';
  pdfUrl?: string;
  venue?: string;
  doi?: string;
  keywords?: string[];
  extractedAt: Date;
  included: boolean; // PRISMA inclusion decision
  exclusionReason?: string;
  category?: string; // LLM-identified category
  llmConfidence?: number; // LLM confidence score for filtering decision (0-1)
  llmReasoning?: string; // LLM reasoning for inclusion/exclusion
}

export interface SearchProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentTask: string;
  nextTask: string;
  totalPapers: number;
  processedPapers: number;
  includedPapers: number;
  excludedPapers: number;
  currentYear?: number;
  timeElapsed: number; // in milliseconds
  estimatedTimeRemaining?: number; // in milliseconds
  screenshot?: string; // base64 encoded screenshot
  error?: string;
  progress: number; // 0-100
}

export interface TorCircuit {
  id: string;
  ip: string;
  country: string;
  isActive: boolean;
  lastRotated: Date;
}

export interface PRISMAData {
  identification: {
    recordsIdentified: number;
    recordsRemoved: number;
  };
  screening: {
    recordsScreened: number;
    recordsExcluded: number;
    reasonsForExclusion: Record<string, number>;
  };
  included: {
    studiesIncluded: number;
  };
}

export interface OutputFiles {
  csv?: string; // file path
  bibtex?: string; // file path
  latex?: string; // file path
  prismaDiagram?: string; // file path
  prismaTable?: string; // file path
  zip?: string; // file path
}

export interface SearchSession {
  id: string;
  parameters: SearchParameters;
  progress: SearchProgress;
  papers: Paper[];
  prismaData: PRISMAData;
  outputs: OutputFiles;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseConfig {
  path: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

/**
 * API Key status tracking
 */
export type APIKeyStatus =
  | 'active'        // Key is working normally
  | 'rate_limited'  // Key hit rate limit
  | 'quota_exceeded' // Key exceeded quota
  | 'invalid'       // Key is invalid or expired
  | 'error';        // Key encountered errors

/**
 * API Key with metadata
 */
export interface APIKeyInfo {
  key: string;
  status: APIKeyStatus;
  lastUsed?: Date;
  errorCount: number;
  rateLimitResetAt?: Date;
  requestCount: number;
  label?: string; // Optional label for identification
}

/**
 * Fallback strategy when all API keys are exhausted
 */
export type FallbackStrategy =
  | 'rule_based'    // Fall back to rule-based filtering (default)
  | 'prompt_user'   // Prompt user for a new API key
  | 'fail';         // Fail the operation

/**
 * LLM Configuration for intelligent tasks in literature review
 */
export interface LLMConfig {
  enabled: boolean; // Use LLM for intelligent tasks (default: true)
  provider: 'gemini' | 'openai' | 'anthropic'; // LLM provider (default: gemini)
  model?: string; // Model name (default depends on provider)
  apiKey?: string; // Primary API key for the LLM provider (backward compatibility)
  apiKeys?: string[]; // Multiple API keys for rotation
  batchSize: number; // Number of items to process in a batch (default: 10)
  maxConcurrentBatches: number; // Maximum concurrent batch requests (default: 3)
  timeout: number; // Request timeout in milliseconds (default: 30000)
  retryAttempts: number; // Number of retry attempts on failure (default: 3)
  temperature: number; // Model temperature for creative tasks (default: 0.3)
  fallbackStrategy: FallbackStrategy; // Strategy when all keys exhausted (default: rule_based)
  enableKeyRotation: boolean; // Enable automatic key rotation (default: true)
}

/**
 * LLM Task Types - Different intelligent tasks that can use LLM
 */
export type LLMTaskType =
  | 'semantic_filtering'      // Semantic understanding of inclusion/exclusion criteria
  | 'category_identification' // Identifying categories of papers
  | 'draft_generation'       // Writing draft review papers
  | 'abstract_summarization' // Summarizing paper abstracts
  | 'quality_assessment';    // Assessing paper quality

/**
 * LLM Request for batch processing
 */
export interface LLMRequest {
  id: string;
  taskType: LLMTaskType;
  prompt: string;
  context?: any;
}

/**
 * LLM Response from batch processing
 */
export interface LLMResponse {
  id: string;
  taskType: LLMTaskType;
  result: any;
  confidence?: number; // Confidence score 0-1
  error?: string;
  tokensUsed?: number;
}

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface TorConfig {
  socksPort: number;
  controlPort: number;
  password?: string;
}

export interface AppConfig {
  database: DatabaseConfig;
  gemini: GeminiConfig;
  googleAuth: GoogleAuthConfig;
  tor: TorConfig;
  maxParallelRequests: number;
  screenshotEnabled: boolean;
  outputDir: string;
}

export type ProgressCallback = (progress: SearchProgress) => void;
export type PaperCallback = (paper: Paper) => void;
export type ErrorCallback = (error: Error) => void;
