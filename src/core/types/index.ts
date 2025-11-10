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
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract?: string;
  url: string;
  citations?: number;
  source: 'google-scholar' | 'other';
  pdfUrl?: string;
  venue?: string;
  doi?: string;
  keywords?: string[];
  extractedAt: Date;
  included: boolean; // PRISMA inclusion decision
  exclusionReason?: string;
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
