/**
 * Unified output generator
 */

import { Paper, PRISMAData, SearchParameters, OutputFiles } from '../types';
import { LitRevDatabase } from '../database';
import { GeminiService } from '../gemini';
import { CSVGenerator } from './csv-generator';
import { BibTeXGenerator } from './bibtex-generator';
import { LaTeXGenerator } from './latex-generator';
import { PRISMADiagramGenerator } from './prisma-diagram';
import * as path from 'path';
import * as fs from 'fs';
import archiver from 'archiver';

export class OutputManager {
  private database: LitRevDatabase;
  private gemini: GeminiService;
  private outputDir: string;

  constructor(database: LitRevDatabase, gemini: GeminiService, outputDir: string) {
    this.database = database;
    this.gemini = gemini;
    this.outputDir = outputDir;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Generate all outputs for a session
   */
  async generateAll(sessionId: string): Promise<OutputFiles> {
    const session = this.database.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionDir = path.join(this.outputDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const outputs: OutputFiles = {};

    // Generate CSV
    const csvPath = path.join(sessionDir, 'papers.csv');
    const csvGen = new CSVGenerator();
    await csvGen.generate(session.papers, csvPath);
    outputs.csv = csvPath;

    // Generate BibTeX
    const bibtexPath = path.join(sessionDir, 'references.bib');
    const bibtexGen = new BibTeXGenerator();
    await bibtexGen.generate(session.papers, bibtexPath);
    outputs.bibtex = bibtexPath;

    // Generate LaTeX paper (only if Gemini API is available)
    try {
      const latexPath = path.join(sessionDir, 'paper.tex');
      const latexGen = new LaTeXGenerator(this.gemini);
      await latexGen.generate(
        session.papers,
        session.parameters,
        session.prismaData,
        latexPath
      );
      outputs.latex = latexPath;
    } catch (error: any) {
      console.log('LaTeX generation skipped - Gemini API not available:', error.message);
      // Skip LaTeX generation if no API key
    }

    // Generate PRISMA diagram
    const prismaDiagramPath = path.join(sessionDir, 'prisma-diagram.tex');
    const prismaGen = new PRISMADiagramGenerator();
    await prismaGen.generateTikZ(session.prismaData, prismaDiagramPath);
    outputs.prismaDiagram = prismaDiagramPath;

    // Generate PRISMA table
    const prismaTablePath = path.join(sessionDir, 'prisma-table.tex');
    await prismaGen.generateTable(session.prismaData, prismaTablePath);
    outputs.prismaTable = prismaTablePath;

    // Generate ZIP
    const zipPath = path.join(sessionDir, 'litreview.zip');
    const filesToZip = [
      outputs.csv!,
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

    // Update database with output file paths
    this.database.updateOutputFiles(sessionId, outputs);

    return outputs;
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
