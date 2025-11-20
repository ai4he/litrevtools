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
  startMonth?: number; // 1-12, optional month filter
  endMonth?: number; // 1-12, optional month filter
  startDay?: number; // 1-31, optional day filter
  endDay?: number; // 1-31, optional day filter
  llmConfig?: LLMConfig; // LLM configuration for intelligent tasks
  // Semantic filtering prompts for LLM-based evaluation
  inclusionCriteriaPrompt?: string; // Semantic prompt defining inclusion criteria
  exclusionCriteriaPrompt?: string; // Semantic prompt defining exclusion criteria
  latexGenerationPrompt?: string; // Additional prompt for LaTeX generation customization
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  publicationDate?: string; // ISO date string (YYYY-MM-DD) if available
  abstract?: string;
  url: string;
  citations?: number;
  source: 'semantic-scholar' | 'other';
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
  // Keyword-based exclusion (Phase 1: Extraction)
  excluded_by_keyword?: boolean; // True if paper was excluded by keyword matching during extraction
  // Semantic filtering flags (Phase 2: Labeling)
  systematic_filtering_inclusion?: boolean; // 1 if meets LLM inclusion criteria, 0 otherwise
  systematic_filtering_exclusion?: boolean; // 1 if meets LLM exclusion criteria, 0 otherwise
  systematic_filtering_inclusion_reasoning?: string; // LLM reasoning for inclusion decision
  systematic_filtering_exclusion_reasoning?: string; // LLM reasoning for exclusion decision
}

export interface SearchProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'estimating';
  currentTask: string;
  nextTask: string;
  totalPapers: number;
  processedPapers: number;
  includedPapers: number;
  excludedPapers: number;
  duplicateCount?: number; // Number of duplicate papers removed
  currentYear?: number;
  timeElapsed: number; // in milliseconds
  estimatedTimeRemaining?: number; // in milliseconds
  screenshot?: string; // base64 encoded screenshot
  error?: string;
  progress: number; // 0-100
  // Enhanced API tracking
  lastApiCall?: {
    year?: number;
    recordsRequested: number;
    recordsReceived: number;
    offset: number;
    timestamp: number;
  };
  // Estimation phase
  estimatedTotalPapers?: number;
  isEstimating?: boolean;
}

export interface OutputProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  stage: 'csv' | 'bibtex' | 'latex' | 'prisma' | 'zip' | 'completed';
  currentTask: string;
  totalStages: number;
  completedStages: number;
  latexBatchProgress?: {
    currentBatch: number;
    totalBatches: number;
    papersInBatch: number;
    papersProcessed: number;
    papersRemaining: number;
    currentDocumentSize: number; // in characters
    estimatedFinalSize: number; // in characters
  };
  error?: string;
  progress: number; // 0-100
  timeElapsed?: number; // in milliseconds
  estimatedTimeRemaining?: number; // in milliseconds

  // Enhanced activity tracking for Step 3
  previousActivity?: string; // Last completed activity
  currentAction?: string; // Detailed current sub-task (e.g., "Generating introduction section", "Fixing LaTeX syntax errors")

  // API key tracking
  currentApiKey?: {
    index: number; // Which API key is currently being used (0-based)
    total: number; // Total number of API keys available
    switches: number; // Number of times API keys have been rotated
  };

  // Token streaming (real-time LLM response tracking)
  tokenStreaming?: {
    enabled: boolean; // Whether streaming is active
    tokensReceived: number; // Number of tokens received so far
    estimatedTotal?: number; // Estimated total tokens (if available)
    streamingSpeed?: number; // Tokens per second
  };

  // Output processing states
  isFixingOutput?: boolean; // Whether LaTeX output is being fixed/cleaned
  isWaiting?: boolean; // Whether process is waiting (e.g., rate limit cooldown)
  waitReason?: string; // Reason for waiting (e.g., "Rate limit - retrying in 5s")

  // Model information
  currentModel?: string; // Which LLM model is being used
  modelFallbacks?: number; // Number of times model has switched due to failures
  healthyKeysCount?: number; // Number of healthy API keys available
  apiKeyQuotas?: Array<{
    label: string;
    status: string;
    quotaRemaining: number;
    quotaDetails: string;
    healthStatus?: string;
  }>;
  // Real-time streaming activity
  activeStreams?: Array<{
    requestId: string;
    keyLabel: string;
    modelName: string;
    paperId?: string;
    paperTitle?: string;
    tokensReceived: number;
    streamSpeed: number;
    startTime: number;
    status: 'streaming' | 'completing' | 'completed' | 'error';
  }>;
}

export interface TorCircuit {
  id: string;
  ip: string;
  country: string;
  isActive: boolean;
  lastRotated: Date;
}

export interface PRISMAData {
  // Identification - via databases & registers
  identification: {
    recordsIdentifiedPerSource: Record<string, number>; // Records from each database/register
    totalRecordsIdentified: number; // Total across all sources
    // Records removed before screening
    duplicatesRemoved: number;
    recordsMarkedIneligibleByAutomation: number; // excluded_by_keyword count
    recordsRemovedForOtherReasons: number;
    totalRecordsRemoved: number;
  };
  // Screening
  screening: {
    recordsScreened: number; // Papers that went through screening
    recordsExcluded: number; // Papers excluded after screening
    reasonsForExclusion: Record<string, number>; // Breakdown of exclusion reasons
  };
  // Identification - via other methods (optional)
  identificationOtherMethods?: {
    recordsIdentified: number;
    reportsSought: number;
    reportsNotRetrieved: number;
  };
  // Eligibility
  eligibility: {
    reportsAssessed: number; // Full-text reports assessed
    reportsExcluded: number; // Reports excluded with reasons
    reasonsForExclusion: Record<string, number>; // Reasons for exclusion
  };
  // Included
  included: {
    studiesIncluded: number; // Final number of included studies
    reportsOfIncludedStudies: number; // Number of reports (PRISMA 2020 distinction)
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
  originalPapers?: Paper[]; // Papers before semantic filtering (Step 1)
  prismaData: PRISMAData;
  outputs: OutputFiles;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseConfig {
  path: string;
}

export interface GeminiConfig {
  apiKey?: string; // Single API key (backward compatibility)
  apiKeys?: string[]; // Multiple API keys for rotation
  model: string;
  paperBatchSize?: number; // Papers per batch for iterative paper generation (default: 15)
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
 * API Key with metadata and quota tracking
 */
export interface APIKeyInfo {
  key: string;
  status: APIKeyStatus;
  lastUsed?: Date;
  errorCount: number;
  rateLimitResetAt?: Date;
  requestCount: number;
  label?: string; // Optional label for identification

  // Quota tracking per key (resets at different intervals)
  quotaTracking?: {
    // Requests per minute (RPM) - resets every minute
    rpm: {
      limit: number;           // Max requests per minute for current model
      used: number;            // Requests used in current minute
      resetAt: Date;           // When this minute window resets
    };
    // Tokens per minute (TPM) - resets every minute
    tpm: {
      limit: number;           // Max tokens per minute for current model
      used: number;            // Tokens used in current minute
      resetAt: Date;           // When this minute window resets
    };
    // Requests per day (RPD) - resets at midnight Pacific Time
    rpd: {
      limit: number;           // Max requests per day for current model
      used: number;            // Requests used today
      resetAt: Date;           // Midnight PT (when daily quota resets)
    };
  };

  // Health check status
  healthCheck?: {
    lastChecked?: Date;
    isHealthy: boolean;
    lastError?: string;
  };
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
  model?: string; // Model name (default depends on provider), use 'auto' for automatic selection based on quota
  apiKey?: string; // Primary API key for the LLM provider (backward compatibility)
  apiKeys?: string[]; // Multiple API keys for rotation
  batchSize: number; // Number of items to process in a batch (default: 10)
  maxConcurrentBatches: number; // Maximum concurrent batch requests (default: 3)
  timeout: number; // Request timeout in milliseconds (default: 30000)
  retryAttempts: number; // Number of retry attempts on failure (default: 3)
  temperature: number; // Model temperature for creative tasks (default: 0.3)
  fallbackStrategy: FallbackStrategy; // Strategy when all keys exhausted (default: rule_based)
  enableKeyRotation: boolean; // Enable automatic key rotation (default: true)
  modelSelectionStrategy?: 'speed' | 'quality'; // Auto model selection strategy (default: 'speed' for filtering, 'quality' for generation)
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
  context?: any; // Context from the original request (e.g., batch papers)
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

/**
 * Resume metadata for Step 1 (Search & Extraction)
 */
export interface Step1ResumeMetadata {
  step: 1;
  sessionId: string;
  parameters: SearchParameters;
  progress: {
    status: 'running' | 'paused' | 'completed' | 'error';
    totalPapers: number;
    processedPapers: number;
    includedPapers: number;
    excludedPapers: number;
    lastOffset: number;
    currentYear?: number;
    timestamp: string;
  };
  prismaData: PRISMAData;
  createdAt: string;
  lastUpdated: string;
}

/**
 * Resume metadata for Step 2 (Semantic Filtering)
 */
export interface Step2ResumeMetadata {
  step: 2;
  sessionId: string;
  sourceStep1SessionId?: string;
  parameters: {
    inclusionPrompt?: string;
    exclusionPrompt?: string;
    batchSize: number;
    model: string;
  };
  progress: {
    status: 'running' | 'paused' | 'completed' | 'error';
    totalPapers: number;
    processedPapers: number;
    currentBatch: number;
    totalBatches: number;
    timestamp: string;
  };
  originalPapersPreserved: boolean;
  createdAt: string;
  lastUpdated: string;
}

/**
 * Resume metadata for Step 3 (Output Generation)
 */
export interface Step3ResumeMetadata {
  step: 3;
  sessionId: string;
  sourceStep2SessionId?: string;
  sourceStep1SessionId?: string;
  parameters: {
    dataSource: 'step1' | 'step2' | 'upload';
    model: string;
    batchSize: number;
    latexPrompt?: string;
  };
  progress: {
    status: 'running' | 'paused' | 'completed' | 'error';
    stage: 'csv' | 'bibtex' | 'latex' | 'prisma' | 'zip' | 'completed';
    completedStages: number;
    totalStages: number;
    latexBatchProgress?: {
      currentBatch: number;
      totalBatches: number;
      papersProcessed: number;
      papersRemaining: number;
    };
    timestamp: string;
  };
  completedOutputs: {
    csv: boolean;
    bibtex: boolean;
    latex: boolean;
    prismaDiagram: boolean;
    prismaTable: boolean;
    zip: boolean;
  };
  createdAt: string;
  lastUpdated: string;
}

export type ResumeMetadata = Step1ResumeMetadata | Step2ResumeMetadata | Step3ResumeMetadata;

export type ProgressCallback = (progress: SearchProgress, sessionId: string) => void;
export type PaperCallback = (paper: Paper, sessionId: string) => void;
export type ErrorCallback = (error: Error, sessionId: string) => void;
