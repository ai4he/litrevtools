/**
 * Unified output generator
 */

import { Paper, PRISMAData, SearchParameters, OutputFiles, OutputProgress } from '../types';
import { LitRevDatabase } from '../database';
import { GeminiService } from '../gemini';
import { CSVGenerator } from './csv-generator';
import { BibTeXGenerator } from './bibtex-generator';
import { LaTeXGenerator } from './latex-generator';
import { PRISMADiagramGenerator } from './prisma-diagram';
import * as path from 'path';
import * as fs from 'fs';
import archiver from 'archiver';

export type OutputProgressCallback = (progress: OutputProgress) => void;

export class OutputManager {
  private database: LitRevDatabase;
  private gemini: GeminiService;
  private outputDir: string;
  private paperBatchSize: number;

  constructor(database: LitRevDatabase, gemini: GeminiService, outputDir: string, paperBatchSize?: number) {
    this.database = database;
    this.gemini = gemini;
    this.outputDir = outputDir;
    this.paperBatchSize = paperBatchSize || 15;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Generate all outputs for a session
   */
  async generateAll(sessionId: string, onProgress?: OutputProgressCallback): Promise<OutputFiles> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionDir = path.join(this.outputDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const outputs: OutputFiles = {};
    const totalStages = 5; // CSV, BibTeX, LaTeX, PRISMA, ZIP
    let completedStages = 0;

    try {
      // Generate CSV files (both raw and labeled)
      onProgress?.({
        status: 'running',
        stage: 'csv',
        currentTask: 'Generating CSV files (raw and labeled)...',
        totalStages,
        completedStages,
        progress: Math.round((completedStages / totalStages) * 100)
      });

      const csvGen = new CSVGenerator();

      // Generate raw extractions CSV (Phase 1 output)
      const rawCsvPath = path.join(sessionDir, 'papers-raw.csv');
      await csvGen.generateRawExtractions(session.papers, rawCsvPath);

      // Generate labeled extractions CSV (Phase 2 output)
      const labeledCsvPath = path.join(sessionDir, 'papers-labeled.csv');
      await csvGen.generateLabeledExtractions(session.papers, labeledCsvPath);

      // Set the labeled CSV as the primary output for backward compatibility
      outputs.csv = labeledCsvPath;
      completedStages++;

      // Generate BibTeX
      onProgress?.({
        status: 'running',
        stage: 'bibtex',
        currentTask: 'Generating BibTeX file...',
        totalStages,
        completedStages,
        progress: Math.round((completedStages / totalStages) * 100)
      });

      const bibtexPath = path.join(sessionDir, 'references.bib');
      const bibtexGen = new BibTeXGenerator();
      await bibtexGen.generate(session.papers, bibtexPath);
      outputs.bibtex = bibtexPath;
      completedStages++;

      // Generate LaTeX paper (only if Gemini API is available)
      try {
        const includedCount = session.papers.filter(p => p.included).length;
        const totalBatches = Math.ceil(includedCount / this.paperBatchSize);

        onProgress?.({
          status: 'running',
          stage: 'latex',
          currentTask: `Generating LaTeX paper (${includedCount} papers in ${totalBatches} batches)...`,
          totalStages,
          completedStages,
          latexBatchProgress: {
            currentBatch: 0,
            totalBatches,
            papersInBatch: 0,
            papersProcessed: 0,
            papersRemaining: includedCount,
            currentDocumentSize: 0,
            estimatedFinalSize: 0
          },
          progress: Math.round((completedStages / totalStages) * 100)
        });

        const latexPath = path.join(sessionDir, 'paper.tex');
        const latexGen = new LaTeXGenerator(this.gemini, this.paperBatchSize);

        // Track start time for output generation
        const outputStartTime = Date.now();

        // Pass batch progress callback
        await latexGen.generate(
          session.papers,
          session.parameters,
          session.prismaData,
          latexPath,
          (currentBatch: number, papersInBatch: number, papersProcessed: number, papersRemaining: number, currentDocSize: number, estimatedFinalSize: number) => {
            const timeElapsed = Date.now() - outputStartTime;
            const estimatedTimeRemaining = papersProcessed > 0
              ? Math.round((timeElapsed / papersProcessed) * papersRemaining)
              : 0;

            onProgress?.({
              status: 'running',
              stage: 'latex',
              currentTask: `Generating LaTeX paper - Batch ${currentBatch}/${totalBatches} (${papersProcessed}/${includedCount} papers)`,
              totalStages,
              completedStages,
              latexBatchProgress: {
                currentBatch,
                totalBatches,
                papersInBatch,
                papersProcessed,
                papersRemaining,
                currentDocumentSize: currentDocSize,
                estimatedFinalSize
              },
              progress: Math.round((completedStages / totalStages) * 100),
              timeElapsed,
              estimatedTimeRemaining
            });
          }
        );
        outputs.latex = latexPath;
      } catch (error: any) {
        console.error('[OutputManager] LaTeX generation failed:', error);
        console.error('[OutputManager] Error details:', {
          message: error.message,
          stack: error.stack?.substring(0, 500)
        });
        // Skip LaTeX generation if no API key or generation fails
      }
      completedStages++;

      // Generate PRISMA diagram and table
      onProgress?.({
        status: 'running',
        stage: 'prisma',
        currentTask: 'Generating PRISMA diagram and tables...',
        totalStages,
        completedStages,
        progress: Math.round((completedStages / totalStages) * 100)
      });

      const prismaDiagramPath = path.join(sessionDir, 'prisma-diagram.tex');
      const prismaGen = new PRISMADiagramGenerator();
      await prismaGen.generateTikZ(session.prismaData, prismaDiagramPath);
      outputs.prismaDiagram = prismaDiagramPath;

      const prismaTablePath = path.join(sessionDir, 'prisma-table.tex');
      await prismaGen.generateTable(session.prismaData, prismaTablePath);
      outputs.prismaTable = prismaTablePath;
      completedStages++;

      // Generate ZIP
      onProgress?.({
        status: 'running',
        stage: 'zip',
        currentTask: 'Creating ZIP archive...',
        totalStages,
        completedStages,
        progress: Math.round((completedStages / totalStages) * 100)
      });

      const zipPath = path.join(sessionDir, 'litreview.zip');
      const filesToZip = [
        path.join(sessionDir, 'papers-raw.csv'),      // Raw extractions
        path.join(sessionDir, 'papers-labeled.csv'),  // Labeled extractions
        outputs.bibtex!,
        outputs.prismaDiagram!,
        outputs.prismaTable!
      ];

      // Only include LaTeX if it was generated
      if (outputs.latex) {
        filesToZip.push(outputs.latex);
      }

      await this.createZip(sessionDir, zipPath, filesToZip);
      outputs.zip = zipPath;
      completedStages++;

      // Update database with output file paths
      this.database.updateOutputFiles(sessionId, outputs);

      // Final completion
      onProgress?.({
        status: 'completed',
        stage: 'completed',
        currentTask: 'All outputs generated successfully!',
        totalStages,
        completedStages,
        progress: 100
      });

      return outputs;
    } catch (error: any) {
      onProgress?.({
        status: 'error',
        stage: 'completed',
        currentTask: 'Output generation failed',
        totalStages,
        completedStages,
        error: error.message,
        progress: Math.round((completedStages / totalStages) * 100)
      });
      throw error;
    }
  }

  /**
   * Generate incremental outputs (as search progresses)
   */
  async generateIncremental(sessionId: string): Promise<Partial<OutputFiles>> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionDir = path.join(this.outputDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const outputs: Partial<OutputFiles> = {};

    // Generate CSV (quick)
    const csvPath = path.join(sessionDir, 'papers-progress.csv');
    const csvGen = new CSVGenerator();
    await csvGen.generate(session.papers, csvPath);
    outputs.csv = csvPath;

    // Update database with CSV file path
    this.database.updateOutputFiles(sessionId, outputs);

    return outputs;
  }

  /**
   * Create ZIP archive
   */
  private async createZip(sourceDir: string, outputPath: string, files: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add files to archive
      for (const file of files) {
        if (fs.existsSync(file)) {
          const fileName = path.basename(file);
          archive.file(file, { name: fileName });
        }
      }

      archive.finalize();
    });
  }
}

export { CSVGenerator } from './csv-generator';
export { BibTeXGenerator } from './bibtex-generator';
export { LaTeXGenerator } from './latex-generator';
export { PRISMADiagramGenerator } from './prisma-diagram';
