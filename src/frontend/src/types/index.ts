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
