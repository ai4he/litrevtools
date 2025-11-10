/**
 * BibTeX output generator
 */

import { Paper } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class BibTeXGenerator {
  /**
   * Generate BibTeX file from papers
   */
  async generate(papers: Paper[], outputPath: string): Promise<string> {
    const includedPapers = papers.filter(p => p.included);

    const bibtexEntries = includedPapers.map(paper => this.paperToBibTeX(paper));
    const bibtex = bibtexEntries.join('\n\n');

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(outputPath, bibtex, 'utf-8');

    return outputPath;
  }

  /**
   * Convert a paper to BibTeX entry
   */
  private paperToBibTeX(paper: Paper): string {
    const citationKey = this.generateCitationKey(paper);

    const fields: string[] = [];

    // Title
    fields.push(`  title={${this.escapeBibTeX(paper.title)}}`);

    // Authors
    if (paper.authors.length > 0) {
      const authors = paper.authors.join(' and ');
      fields.push(`  author={${this.escapeBibTeX(authors)}}`);
    }

    // Year
    fields.push(`  year={${paper.year}}`);

    // Venue/Journal
    if (paper.venue) {
      // Detect if it's a journal or conference
      const isJournal = paper.venue.toLowerCase().includes('journal') ||
                       paper.venue.toLowerCase().includes('transactions');

      if (isJournal) {
        fields.push(`  journal={${this.escapeBibTeX(paper.venue)}}`);
      } else {
        fields.push(`  booktitle={${this.escapeBibTeX(paper.venue)}}`);
      }
    }

    // DOI
    if (paper.doi) {
      fields.push(`  doi={${paper.doi}}`);
    }

    // URL
    if (paper.url) {
      fields.push(`  url={${paper.url}}`);
    }

    // Abstract
    if (paper.abstract) {
      fields.push(`  abstract={${this.escapeBibTeX(paper.abstract)}}`);
    }

    // Keywords
    if (paper.keywords && paper.keywords.length > 0) {
      fields.push(`  keywords={${paper.keywords.join(', ')}}`);
    }

    // Determine entry type
    const entryType = paper.venue ? 'article' : 'misc';

    return `@${entryType}{${citationKey},\n${fields.join(',\n')}\n}`;
  }

  /**
   * Generate a citation key for a paper
   */
  private generateCitationKey(paper: Paper): string {
    const firstAuthor = paper.authors[0] || 'unknown';
    const lastName = firstAuthor.split(' ').pop() || 'unknown';
    const cleanLastName = lastName.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const year = paper.year;

    // Create a short title hash
    const titleWords = paper.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 2);

    const titlePart = titleWords.join('');

    return `${cleanLastName}${year}${titlePart}`;
  }

  /**
   * Escape special characters for BibTeX
   */
  private escapeBibTeX(text: string): string {
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/~/g, '\\~{}')
      .replace(/\^/g, '\\^{}');
  }
}
