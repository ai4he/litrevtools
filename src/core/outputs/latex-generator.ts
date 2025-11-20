/**
 * LaTeX research paper generator
 */

import { Paper, PRISMAData, SearchParameters } from '../types';
import { GeminiService } from '../gemini';
import * as fs from 'fs';
import * as path from 'path';

export class LaTeXGenerator {
  private gemini: GeminiService;
  private batchSize: number = 15; // Papers per batch
  private isPaused: boolean = false;
  private isStopped: boolean = false;

  constructor(gemini: GeminiService, batchSize?: number) {
    this.gemini = gemini;
    if (batchSize) {
      this.batchSize = batchSize;
    }
  }

  /**
   * Pause LaTeX generation
   */
  pause(): void {
    this.isPaused = true;
    console.log('[LaTeXGenerator] Paused');
  }

  /**
   * Resume LaTeX generation
   */
  resume(): void {
    this.isPaused = false;
    console.log('[LaTeXGenerator] Resumed');
  }

  /**
   * Stop LaTeX generation
   */
  stop(): void {
    this.isStopped = true;
    this.isPaused = false;
    console.log('[LaTeXGenerator] Stopped');
  }

  /**
   * Reset control flags (for new generation session)
   */
  resetControlFlags(): void {
    this.isPaused = false;
    this.isStopped = false;
  }

  /**
   * Generate complete LaTeX research paper using iterative drafting
   * Processes papers in batches, regenerating the entire paper each time
   *
   * NOTE: This process is SEQUENTIAL (Step 3: Paper Generation).
   * Each batch regenerates the full paper using the output from the previous batch
   * as input, so batches cannot be processed in parallel like Step 2 (Semantic Filtering).
   */
  async generate(
    papers: Paper[],
    searchParams: SearchParameters,
    prismaData: PRISMAData,
    outputPath: string,
    onBatchProgress?: (
      currentBatch: number,
      papersInBatch: number,
      papersProcessed: number,
      papersRemaining: number,
      currentDocSize: number,
      estimatedFinalSize: number
    ) => void,
    onTokenStreaming?: (tokensReceived: number, streamSpeed: number) => void
  ): Promise<string> {
    console.log(`[LaTeXGenerator] Total papers received: ${papers.length}`);
    const includedPapers = papers.filter(p => p.included);

    console.log(`[LaTeXGenerator] Generating paper with ${includedPapers.length} papers using iterative approach`);
    console.log(`[LaTeXGenerator] Batch size: ${this.batchSize} papers per iteration`);

    if (includedPapers.length === 0) {
      console.warn(`[LaTeXGenerator] WARNING: No included papers found!`);
      console.log(`[LaTeXGenerator] Sample of all papers (first 3):`);
      papers.slice(0, 3).forEach((p, i) => {
        console.log(`  Paper ${i + 1}: included=${p.included}, title="${p.title.substring(0, 50)}..."`);
      });
    }

    // Split papers into batches
    const batches: Paper[][] = [];
    for (let i = 0; i < includedPapers.length; i += this.batchSize) {
      batches.push(includedPapers.slice(i, i + this.batchSize));
    }

    console.log(`[LaTeXGenerator] Processing ${batches.length} batches`);

    // Reset control flags for new generation session
    this.resetControlFlags();

    let currentDraft: {
      abstract: string;
      introduction: string;
      methodology: string;
      results: string;
      discussion: string;
      conclusion: string;
    } | null = null;

    // Process batches iteratively
    for (let i = 0; i < batches.length; i++) {
      // Check if stopped
      if (this.isStopped) {
        console.log(`[LaTeXGenerator] Processing stopped by user at batch ${i + 1}/${batches.length}`);
        throw new Error('Processing stopped by user');
      }

      // Wait while paused
      while (this.isPaused) {
        console.log(`[LaTeXGenerator] Processing paused at batch ${i + 1}/${batches.length}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
      }

      const batch = batches[i];
      const papersProcessedSoFar = includedPapers.slice(0, (i + 1) * this.batchSize);
      const papersProcessed = Math.min(papersProcessedSoFar.length, includedPapers.length);
      const papersRemaining = includedPapers.length - papersProcessed;

      console.log(`[LaTeXGenerator] Processing batch ${i + 1}/${batches.length} (${batch.length} papers)`);
      console.log(`[LaTeXGenerator] Total papers processed so far: ${papersProcessed}/${includedPapers.length}`);

      // Calculate current document size
      const currentDocSize = currentDraft ? this.estimateDocumentSize(currentDraft) : 0;
      // Estimate final size based on current progress
      const estimatedFinalSize = papersProcessed > 0
        ? Math.round((currentDocSize / papersProcessed) * includedPapers.length)
        : 0;

      // Emit progress with enhanced metrics
      onBatchProgress?.(i + 1, batch.length, papersProcessed, papersRemaining, currentDocSize, estimatedFinalSize);

      if (i === 0) {
        // First batch: generate initial draft
        console.log(`[LaTeXGenerator] Generating initial draft with first ${batch.length} papers...`);
        currentDraft = await this.gemini.generateFullPaperDraft(
          batch,
          searchParams.inclusionKeywords,
          searchParams.inclusionKeywords,
          searchParams.exclusionKeywords,
          prismaData,
          searchParams.latexGenerationPrompt
        );
      } else {
        // Subsequent batches: regenerate with new papers
        console.log(`[LaTeXGenerator] Regenerating paper with ${batch.length} additional papers...`);
        currentDraft = await this.gemini.regeneratePaperWithNewPapers(
          currentDraft!,
          batch,
          papersProcessedSoFar,
          searchParams.inclusionKeywords,
          prismaData,
          searchParams.latexGenerationPrompt
        );
      }

      console.log(`[LaTeXGenerator] Batch ${i + 1} completed`);
    }

    if (!currentDraft) {
      throw new Error('No papers to generate LaTeX document');
    }

    console.log(`[LaTeXGenerator] All batches processed, building final LaTeX document...`);

    // Build LaTeX document
    const latex = this.buildLaTeXDocument({
      title: this.generateTitle(searchParams.inclusionKeywords),
      abstract: currentDraft.abstract,
      introduction: currentDraft.introduction,
      methodology: currentDraft.methodology,
      results: currentDraft.results,
      discussion: currentDraft.discussion,
      conclusion: currentDraft.conclusion,
      searchParams,
      prismaData
    });

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(outputPath, latex, 'utf-8');

    console.log(`[LaTeXGenerator] LaTeX document written to ${outputPath}`);

    return outputPath;
  }

  /**
   * Build complete LaTeX document
   */
  private buildLaTeXDocument(content: {
    title: string;
    abstract: string;
    introduction: string;
    methodology: string;
    results: string;
    discussion: string;
    conclusion: string;
    searchParams: SearchParameters;
    prismaData: PRISMAData;
  }): string {
    return `\\documentclass[12pt,a4paper]{article}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}
\\usepackage{natbib}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{float}
\\usepackage{caption}

% Page layout
\\geometry{margin=1in}

% Hyperref setup
\\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    filecolor=magenta,
    urlcolor=cyan,
    citecolor=blue,
}

% Title and authors
\\title{${this.escapeLatex(content.title)}}
\\author{Generated by LitRevTools}
\\date{\\today}

\\begin{document}

\\maketitle

% Abstract
\\begin{abstract}
${content.abstract}
\\end{abstract}

\\newpage
\\tableofcontents
\\newpage

% Introduction
\\section{Introduction}
${content.introduction}

% Methodology
\\section{Methodology}
${content.methodology}

\\subsection{PRISMA Flow}
The systematic review process followed the PRISMA (Preferred Reporting Items for Systematic Reviews and Meta-Analyses) guidelines. Figure~\\ref{fig:prisma} shows the flow diagram of the study selection process.

\\begin{figure}[H]
\\centering
\\caption{PRISMA flow diagram}
\\label{fig:prisma}
\\textit{[PRISMA diagram should be included here]}
\\end{figure}

% Results
\\section{Results}
${content.results}

${this.generatePRISMATable(content.prismaData)}

% Discussion
\\section{Discussion}
${content.discussion}

% Conclusion
\\section{Conclusion}
${content.conclusion}

% References
\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;
  }

  /**
   * Generate PRISMA summary table in LaTeX
   */
  private generatePRISMATable(prismaData: PRISMAData): string {
    return `
\\subsection{PRISMA Summary}

Table~\\ref{tab:prisma} summarizes the PRISMA flow statistics.

\\begin{table}[H]
\\centering
\\caption{PRISMA Flow Statistics}
\\label{tab:prisma}
\\begin{tabular}{lr}
\\toprule
\\textbf{Stage} & \\textbf{Count} \\\\
\\midrule
Records identified & ${prismaData.identification.totalRecordsIdentified} \\\\
Records removed (duplicates, etc.) & ${prismaData.identification.totalRecordsRemoved} \\\\
Records screened & ${prismaData.screening.recordsScreened} \\\\
Records excluded & ${prismaData.screening.recordsExcluded} \\\\
Studies included in review & ${prismaData.included.studiesIncluded} \\\\
\\bottomrule
\\end{tabular}
\\end{table}

${this.generateExclusionReasonsTable(prismaData)}
`;
  }

  /**
   * Generate exclusion reasons table
   */
  private generateExclusionReasonsTable(prismaData: PRISMAData): string {
    const reasons = prismaData.screening.reasonsForExclusion;
    const entries = Object.entries(reasons);

    if (entries.length === 0) {
      return '';
    }

    const rows = entries.map(([reason, count]) =>
      `${this.escapeLatex(reason)} & ${count} \\\\`
    ).join('\n');

    return `
\\begin{table}[H]
\\centering
\\caption{Reasons for Exclusion}
\\label{tab:exclusion}
\\begin{tabular}{lr}
\\toprule
\\textbf{Reason} & \\textbf{Count} \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}
\\end{table}
`;
  }

  /**
   * Generate title from keywords
   */
  private generateTitle(keywords: string[]): string {
    const keywordPhrase = keywords.slice(0, 3).join(', ');
    return `A Systematic Literature Review on ${keywordPhrase}`;
  }

  /**
   * Escape special LaTeX characters
   */
  private escapeLatex(text: string): string {
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }

  /**
   * Estimate document size in characters
   */
  private estimateDocumentSize(draft: {
    abstract: string;
    introduction: string;
    methodology: string;
    results: string;
    discussion: string;
    conclusion: string;
  }): number {
    return (
      draft.abstract.length +
      draft.introduction.length +
      draft.methodology.length +
      draft.results.length +
      draft.discussion.length +
      draft.conclusion.length
    );
  }
}
