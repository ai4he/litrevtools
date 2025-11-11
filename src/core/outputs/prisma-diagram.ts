/**
 * PRISMA flow diagram generator
 */

import { PRISMAData } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class PRISMADiagramGenerator {
  /**
   * Generate PRISMA 2020 flow diagram in TikZ (LaTeX)
   */
  async generateTikZ(prismaData: PRISMAData, outputPath: string): Promise<string> {
    // Build per-source identification text
    const perSourceText = Object.entries(prismaData.identification.recordsIdentifiedPerSource)
      .map(([source, count]) => `${source}: n = ${count}`)
      .join(' \\\\ ');

    const tikz = `\\documentclass[tikz,border=10pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{shapes.geometric, arrows, positioning, fit, calc}

\\tikzstyle{box} = [rectangle, rounded corners, minimum width=4.5cm, minimum height=1.2cm, text centered, draw=black, fill=blue!10, font=\\small]
\\tikzstyle{sidebox} = [rectangle, rounded corners, minimum width=3.5cm, minimum height=0.8cm, text centered, draw=black, fill=red!10, font=\\small]
\\tikzstyle{arrow} = [thick,->,>=stealth]

\\begin{document}

\\begin{tikzpicture}[node distance=2.5cm]

% Identification - via databases
\\node (identification) [box] {
    \\textbf{Identification (Databases)} \\\\
    ${perSourceText} \\\\
    Total: n = ${prismaData.identification.totalRecordsIdentified}
};

% Records removed before screening
\\node (removed) [sidebox, right of=identification, xshift=4.5cm] {
    \\textbf{Records removed:} \\\\
    Duplicates: ${prismaData.identification.duplicatesRemoved} \\\\
    Automation: ${prismaData.identification.recordsMarkedIneligibleByAutomation} \\\\
    Other: ${prismaData.identification.recordsRemovedForOtherReasons} \\\\
    Total: ${prismaData.identification.totalRecordsRemoved}
};

% Screening
\\node (screening) [box, below of=identification] {
    \\textbf{Screening} \\\\
    Records screened \\\\
    n = ${prismaData.screening.recordsScreened}
};

% Records excluded at screening
\\node (screening_excluded) [sidebox, right of=screening, xshift=4.5cm] {
    \\textbf{Records excluded} \\\\
    n = ${prismaData.screening.recordsExcluded}
};

% Eligibility
\\node (eligibility) [box, below of=screening] {
    \\textbf{Eligibility} \\\\
    Reports assessed \\\\
    n = ${prismaData.eligibility.reportsAssessed}
};

% Reports excluded at eligibility
\\node (eligibility_excluded) [sidebox, right of=eligibility, xshift=4.5cm] {
    \\textbf{Reports excluded} \\\\
    n = ${prismaData.eligibility.reportsExcluded}
};

% Included
\\node (included) [box, below of=eligibility, fill=green!20] {
    \\textbf{Included} \\\\
    Studies included: ${prismaData.included.studiesIncluded} \\\\
    Reports: ${prismaData.included.reportsOfIncludedStudies}
};

% Arrows
\\draw [arrow] (identification) -- (screening);
\\draw [arrow] (identification) -- (removed);
\\draw [arrow] (screening) -- (eligibility);
\\draw [arrow] (screening) -- (screening_excluded);
\\draw [arrow] (eligibility) -- (included);
\\draw [arrow] (eligibility) -- (eligibility_excluded);

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
   * Generate PRISMA 2020 comprehensive table in LaTeX
   */
  async generateTable(prismaData: PRISMAData, outputPath: string): Promise<string> {
    // Build per-source rows
    const perSourceRows = Object.entries(prismaData.identification.recordsIdentifiedPerSource)
      .map(([source, count]) => `\\quad ${this.escapeLatex(source)} & ${count} \\\\`)
      .join('\n');

    const latex = `\\documentclass[12pt,a4paper]{article}
\\usepackage{booktabs}
\\usepackage{geometry}
\\geometry{margin=1in}

\\begin{document}

\\begin{table}[h]
\\centering
\\caption{PRISMA 2020 Flow Statistics - Complete Report}
\\begin{tabular}{lr}
\\toprule
\\textbf{Stage} & \\textbf{Count} \\\\
\\midrule
\\textbf{Identification (via databases \\& registers)} & \\\\
${perSourceRows}
\\quad Total records identified & ${prismaData.identification.totalRecordsIdentified} \\\\
\\addlinespace
\\textbf{Records removed before screening:} & \\\\
\\quad Duplicate records removed & ${prismaData.identification.duplicatesRemoved} \\\\
\\quad Records marked ineligible by automation & ${prismaData.identification.recordsMarkedIneligibleByAutomation} \\\\
\\quad Records removed for other reasons & ${prismaData.identification.recordsRemovedForOtherReasons} \\\\
\\quad \\textbf{Total removed} & \\textbf{${prismaData.identification.totalRecordsRemoved}} \\\\
\\addlinespace
\\textbf{Screening} & \\\\
\\quad Records screened & ${prismaData.screening.recordsScreened} \\\\
\\quad Records excluded & ${prismaData.screening.recordsExcluded} \\\\
\\addlinespace
\\textbf{Eligibility} & \\\\
\\quad Reports assessed for eligibility & ${prismaData.eligibility.reportsAssessed} \\\\
\\quad Reports excluded & ${prismaData.eligibility.reportsExcluded} \\\\
\\addlinespace
\\textbf{Included} & \\\\
\\quad Studies included in review & ${prismaData.included.studiesIncluded} \\\\
\\quad Reports of included studies & ${prismaData.included.reportsOfIncludedStudies} \\\\
\\bottomrule
\\end{tabular}
\\end{table}

${this.generateScreeningExclusionTable(prismaData)}

${this.generateEligibilityExclusionTable(prismaData)}

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
   * Generate screening exclusion reasons table
   */
  private generateScreeningExclusionTable(prismaData: PRISMAData): string {
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
\\caption{Screening Exclusion Reasons}
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
   * Generate eligibility exclusion reasons table
   */
  private generateEligibilityExclusionTable(prismaData: PRISMAData): string {
    const reasons = prismaData.eligibility.reasonsForExclusion;
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
\\caption{Eligibility Assessment Exclusion Reasons}
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
