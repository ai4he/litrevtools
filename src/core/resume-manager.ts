/**
 * Resume Manager - Handles metadata generation and ZIP operations for resume functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import {
  Step1ResumeMetadata,
  Step2ResumeMetadata,
  Step3ResumeMetadata,
  ResumeMetadata,
  SearchSession,
  SearchProgress,
  Paper,
  PRISMAData,
  OutputProgress
} from './types';

export class ResumeManager {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Generate Step 1 metadata from current session state
   */
  generateStep1Metadata(
    session: SearchSession,
    progress: SearchProgress,
    lastOffset: number
  ): Step1ResumeMetadata {
    // Map status to allowed values (idle/estimating -> running for resume purposes)
    const status: 'running' | 'paused' | 'completed' | 'error' =
      progress.status === 'idle' || progress.status === 'estimating' ? 'running' : progress.status;

    return {
      step: 1,
      sessionId: session.id,
      parameters: session.parameters,
      progress: {
        status,
        totalPapers: progress.totalPapers,
        processedPapers: progress.processedPapers,
        includedPapers: progress.includedPapers,
        excludedPapers: progress.excludedPapers,
        lastOffset,
        currentYear: progress.currentYear,
        timestamp: new Date().toISOString()
      },
      prismaData: session.prismaData,
      createdAt: session.createdAt.toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Generate Step 2 metadata from current filtering state
   */
  generateStep2Metadata(
    sessionId: string,
    sourceStep1SessionId: string | undefined,
    parameters: {
      inclusionPrompt?: string;
      exclusionPrompt?: string;
      batchSize: number;
      model: string;
    },
    progress: {
      totalPapers: number;
      processedPapers: number;
      currentBatch: number;
      totalBatches: number;
    },
    originalPapersPreserved: boolean,
    createdAt: Date
  ): Step2ResumeMetadata {
    return {
      step: 2,
      sessionId,
      sourceStep1SessionId,
      parameters,
      progress: {
        status: 'running',
        totalPapers: progress.totalPapers,
        processedPapers: progress.processedPapers,
        currentBatch: progress.currentBatch,
        totalBatches: progress.totalBatches,
        timestamp: new Date().toISOString()
      },
      originalPapersPreserved,
      createdAt: createdAt.toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Generate Step 3 metadata from current generation state
   */
  generateStep3Metadata(
    sessionId: string,
    sourceStep2SessionId: string | undefined,
    sourceStep1SessionId: string | undefined,
    parameters: {
      dataSource: 'step1' | 'step2' | 'upload';
      model: string;
      batchSize: number;
      latexPrompt?: string;
    },
    progress: OutputProgress,
    completedOutputs: {
      csv: boolean;
      bibtex: boolean;
      latex: boolean;
      prismaDiagram: boolean;
      prismaTable: boolean;
      zip: boolean;
    },
    createdAt: Date
  ): Step3ResumeMetadata {
    // Map status to allowed values (idle -> running for resume purposes)
    const status: 'running' | 'paused' | 'completed' | 'error' =
      progress.status === 'idle' ? 'running' : progress.status;

    return {
      step: 3,
      sessionId,
      sourceStep2SessionId,
      sourceStep1SessionId,
      parameters,
      progress: {
        status,
        stage: progress.stage,
        completedStages: progress.completedStages,
        totalStages: progress.totalStages,
        latexBatchProgress: progress.latexBatchProgress,
        timestamp: new Date().toISOString()
      },
      completedOutputs,
      createdAt: createdAt.toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Create a progress ZIP file with CSV and metadata
   */
  async createProgressZip(
    sessionId: string,
    csvPath: string,
    metadata: ResumeMetadata,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log(`[ResumeManager] Created progress ZIP: ${outputPath} (${archive.pointer()} bytes)`);
        resolve();
      });

      archive.on('error', (err) => {
        console.error('[ResumeManager] Error creating progress ZIP:', err);
        reject(err);
      });

      archive.pipe(output);

      // Add CSV file
      if (fs.existsSync(csvPath)) {
        const csvFilename = path.basename(csvPath);
        archive.file(csvPath, { name: csvFilename });
      }

      // Add metadata.json
      const metadataJson = JSON.stringify(metadata, null, 2);
      archive.append(metadataJson, { name: 'metadata.json' });

      archive.finalize();
    });
  }

  /**
   * Extract ZIP contents to temporary directory
   */
  async extractZipContents(zipPath: string): Promise<{
    csvPath: string;
    metadata: ResumeMetadata;
    tempDir: string;
  }> {
    const tempDir = path.join(this.outputDir, 'temp', `extract_${Date.now()}`);

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // Extract ZIP using adm-zip
      console.log(`[ResumeManager] Extracting ZIP to: ${tempDir}`);
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempDir, true);

      // Find CSV file (should be the only .csv file)
      const files = fs.readdirSync(tempDir);
      const csvFile = files.find(f => f.endsWith('.csv'));

      if (!csvFile) {
        throw new Error('No CSV file found in ZIP archive');
      }

      const csvPath = path.join(tempDir, csvFile);

      // Read metadata.json
      const metadataPath = path.join(tempDir, 'metadata.json');
      if (!fs.existsSync(metadataPath)) {
        throw new Error('No metadata.json found in ZIP archive');
      }

      const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent) as ResumeMetadata;

      // Validate metadata
      this.validateMetadata(metadata);

      return { csvPath, metadata, tempDir };
    } catch (error) {
      // Clean up temp directory on error
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Validate metadata structure
   */
  validateMetadata(metadata: ResumeMetadata): void {
    if (!metadata.step || ![1, 2, 3].includes(metadata.step)) {
      throw new Error('Invalid metadata: missing or invalid step number');
    }

    if (!metadata.sessionId) {
      throw new Error('Invalid metadata: missing sessionId');
    }

    if (!metadata.parameters) {
      throw new Error('Invalid metadata: missing parameters');
    }

    if (!metadata.progress) {
      throw new Error('Invalid metadata: missing progress');
    }

    // Step-specific validation
    switch (metadata.step) {
      case 1:
        const step1 = metadata as Step1ResumeMetadata;
        if (!step1.parameters.inclusionKeywords || !Array.isArray(step1.parameters.inclusionKeywords)) {
          throw new Error('Invalid Step 1 metadata: missing or invalid inclusionKeywords');
        }
        if (step1.progress.lastOffset === undefined) {
          throw new Error('Invalid Step 1 metadata: missing lastOffset');
        }
        break;

      case 2:
        const step2 = metadata as Step2ResumeMetadata;
        if (!step2.parameters.batchSize || !step2.parameters.model) {
          throw new Error('Invalid Step 2 metadata: missing batchSize or model');
        }
        break;

      case 3:
        const step3 = metadata as Step3ResumeMetadata;
        if (!step3.parameters.dataSource || !step3.completedOutputs) {
          throw new Error('Invalid Step 3 metadata: missing dataSource or completedOutputs');
        }
        break;
    }

    console.log(`[ResumeManager] Metadata validation passed for Step ${metadata.step}`);
  }

  /**
   * Clean up temporary extraction directory
   */
  cleanupTempDir(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[ResumeManager] Cleaned up temp directory: ${tempDir}`);
      }
    } catch (error) {
      console.error(`[ResumeManager] Error cleaning up temp directory:`, error);
    }
  }

  /**
   * Parse CSV content and return papers array
   */
  async parseCsvToPapers(csvPath: string): Promise<Paper[]> {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const papers: Paper[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const paper: any = {};

      headers.forEach((header, index) => {
        const value = values[index] || '';

        switch (header.toLowerCase()) {
          case 'id':
            paper.id = value;
            break;
          case 'title':
            paper.title = value;
            break;
          case 'authors':
            paper.authors = value.split(';').map(a => a.trim()).filter(a => a);
            break;
          case 'year':
            paper.year = parseInt(value) || 0;
            break;
          case 'abstract':
            paper.abstract = value;
            break;
          case 'url':
            paper.url = value;
            break;
          case 'citations':
            paper.citations = parseInt(value) || 0;
            break;
          case 'doi':
            paper.doi = value;
            break;
          case 'venue':
            paper.venue = value;
            break;
          case 'included':
            paper.included = value.toLowerCase() === 'yes' || value === '1';
            break;
          case 'exclusion reason':
            paper.exclusionReason = value;
            break;
          case 'systematic filtering inclusion':
            paper.systematic_filtering_inclusion = value === '1' || value.toLowerCase() === 'true';
            break;
          case 'systematic filtering inclusion reasoning':
            paper.systematic_filtering_inclusion_reasoning = value;
            break;
          case 'systematic filtering exclusion':
            paper.systematic_filtering_exclusion = value === '1' || value.toLowerCase() === 'true';
            break;
          case 'systematic filtering exclusion reasoning':
            paper.systematic_filtering_exclusion_reasoning = value;
            break;
        }
      });

      // Set defaults
      paper.source = 'semantic-scholar';
      paper.extractedAt = new Date();

      if (paper.id && paper.title) {
        papers.push(paper as Paper);
      }
    }

    console.log(`[ResumeManager] Parsed ${papers.length} papers from CSV`);
    return papers;
  }

  /**
   * Parse a CSV line, handling quoted values with commas
   */
  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          // Escaped quote
          currentValue += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // End of value
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add last value
    values.push(currentValue);

    return values;
  }
}
