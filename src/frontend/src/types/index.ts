export interface SearchParameters {
  name?: string;
  inclusionKeywords: string[];
  exclusionKeywords: string[];
  startYear?: number;
  endYear?: number;
  maxResults?: number;
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
}

export interface ProgressUpdate {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentTask: string;
  nextTask: string;
  totalPapers: number;
  processedPapers: number;
  includedPapers: number;
  excludedPapers: number;
  currentYear?: number;
  timeElapsed: number;
  estimatedTimeRemaining: number;
  progress: number;
  screenshot?: string;
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
