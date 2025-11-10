/**
 * PRISMA flow diagram generator
 */

import { PRISMAData } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class PRISMADiagramGenerator {
  /**
   * Generate PRISMA flow diagram in TikZ (LaTeX)
   */
  async generateTikZ(prismaData: PRISMAData, outputPath: string): Promise<string> {
    const tikz = `\\documentclass[tikz,border=10pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{shapes.geometric, arrows, positioning, fit}

\\tikzstyle{box} = [rectangle, rounded corners, minimum width=3cm, minimum height=1cm, text centered, draw=black, fill=blue!10]
\\tikzstyle{arrow} = [thick,->,>=stealth]

\\begin{document}

\\begin{tikzpicture}[node distance=2cm]

% Identification
\\node (identification) [box] {
    \\textbf{Identification} \\\\
    Records identified \\\\
    n = ${prismaData.identification.recordsIdentified}
};

% Records removed
\\node (removed) [box, below of=identification] {
    Records removed \\\\
    n = ${prismaData.identification.recordsRemoved}
};

% Screening
\\node (screening) [box, below of=removed] {
    \\textbf{Screening} \\\\
    Records screened \\\\
    n = ${prismaData.screening.recordsScreened}
};

% Records excluded
\\node (excluded) [box, right of=screening, xshift=4cm] {
    Records excluded \\\\
    n = ${prismaData.screening.recordsExcluded}
};

% Included
\\node (included) [box, below of=screening] {
    \\textbf{Included} \\\\
    Studies included \\\\
    n = ${prismaData.included.studiesIncluded}
};

% Arrows
\\draw [arrow] (identification) -- (removed);
\\draw [arrow] (removed) -- (screening);
\\draw [arrow] (screening) -- (included);
\\draw [arrow] (screening) -- (excluded);

\\end{tikzpicture}

\\end{document}`;

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(outputPath, tikz, 'utf-8');

    return outputPath;
  }

  /**
   * Generate PRISMA table in LaTeX
   */
  async generateTable(prismaData: PRISMAData, outputPath: string): Promise<string> {
    const latex = `\\documentclass[12pt,a4paper]{article}
\\usepackage{booktabs}
\\usepackage{geometry}
\\geometry{margin=1in}

\\begin{document}

\\begin{table}[h]
\\centering
\\caption{PRISMA Flow Statistics}
\\begin{tabular}{lr}
\\toprule
\\textbf{Stage} & \\textbf{Count} \\\\
\\midrule
Records identified & ${prismaData.identification.recordsIdentified} \\\\
Records removed & ${prismaData.identification.recordsRemoved} \\\\
Records screened & ${prismaData.screening.recordsScreened} \\\\
Records excluded & ${prismaData.screening.recordsExcluded} \\\\
Studies included & ${prismaData.included.studiesIncluded} \\\\
\\bottomrule
\\end{tabular}
\\end{table}

${this.generateExclusionTable(prismaData)}

\\end{document}`;

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(outputPath, latex, 'utf-8');

    return outputPath;
  }

  /**
   * Generate exclusion reasons table
   */
  private generateExclusionTable(prismaData: PRISMAData): string {
    const reasons = prismaData.screening.reasonsForExclusion;
    const entries = Object.entries(reasons);

    if (entries.length === 0) {
      return '';
    }

    const rows = entries.map(([reason, count]) =>
      `${this.escapeLatex(reason)} & ${count} \\\\`
    ).join('\n');

    return `
\\begin{table}[h]
\\centering
\\caption{Exclusion Reasons}
\\begin{tabular}{lr}
\\toprule
\\textbf{Reason} & \\textbf{Count} \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}
\\end{table}`;
  }

  /**
   * Escape LaTeX special characters
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
}
