export interface LLMConfig {
  enabled: boolean;
  provider: 'gemini' | 'openai' | 'anthropic';
  model?: string;
  apiKey?: string;
  apiKeys?: string[];
  batchSize: number;
  maxConcurrentBatches: number;
  timeout: number;
  retryAttempts: number;
  temperature: number;
  fallbackStrategy: 'rule_based' | 'prompt_user' | 'fail';
  enableKeyRotation: boolean;
}

export interface SearchParameters {
  name?: string;
  inclusionKeywords: string[];
  exclusionKeywords: string[];
  startYear?: number;
  endYear?: number;
  startMonth?: number;
  endMonth?: number;
  startDay?: number;
  endDay?: number;
  maxResults?: number;
  llmConfig?: LLMConfig;
  inclusionCriteriaPrompt?: string;
  exclusionCriteriaPrompt?: string;
  latexGenerationPrompt?: string;
  autoMode?: boolean; // Auto-run all steps sequentially
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  url: string;
  citations: number;
  doi?: string;
  venue?: string;
  included: boolean;
  exclusionReason?: string;
  category?: string;
  llmConfidence?: number;
  llmReasoning?: string;
}

export interface ProgressUpdate {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'estimating';
  currentTask: string;
  nextTask: string;
  totalPapers: number;
  processedPapers: number;
  includedPapers: number;
  excludedPapers: number;
  duplicateCount?: number;
  currentYear?: number;
  timeElapsed: number;
  estimatedTimeRemaining: number;
  progress: number;
  screenshot?: string;
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
  progress: number;
  timeElapsed?: number;
  estimatedTimeRemaining?: number;

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
}

export interface SearchSession {
  id: string;
  name: string;
  inclusionKeywords: string[];
  exclusionKeywords: string[];
  startYear?: number;
  endYear?: number;
  maxResults?: number;
  status: 'running' | 'paused' | 'completed' | 'error';
  progress: number;
  createdAt: string;
  updatedAt: string;
  papers?: Paper[];
}

export interface OutputFiles {
  csv?: string;
  bibtex?: string;
  latex?: string;
  prisma?: string;
  zip?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}
