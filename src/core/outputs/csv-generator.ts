/**
 * CSV output generator
 */

import { stringify } from 'csv-stringify/sync';
import { Paper } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class CSVGenerator {
  /**
   * Generate CSV file from papers
   */
  async generate(papers: Paper[], outputPath: string): Promise<string> {
    // Prepare data for CSV
    const records = papers.map(paper => ({
      ID: paper.id,
      Title: paper.title,
      Authors: paper.authors.join('; '),
      Year: paper.year,
      Venue: paper.venue || '',
      Citations: paper.citations || 0,
      URL: paper.url,
      'PDF URL': paper.pdfUrl || '',
      DOI: paper.doi || '',
      Abstract: paper.abstract || '',
      Keywords: paper.keywords?.join('; ') || '',
      Included: paper.included ? 'Yes' : 'No',
      'Exclusion Reason': paper.exclusionReason || '',
      'Extracted At': paper.extractedAt.toISOString()
    }));

    // Convert to CSV
    const csv = stringify(records, {
      header: true,
      columns: [
        'ID',
        'Title',
        'Authors',
        'Year',
        'Venue',
        'Citations',
        'URL',
        'PDF URL',
        'DOI',
        'Abstract',
        'Keywords',
        'Included',
        'Exclusion Reason',
        'Extracted At'
      ]
    });

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(outputPath, csv, 'utf-8');

    return outputPath;
  }

  /**
   * Generate CSV with only included papers
   */
  async generateIncludedOnly(papers: Paper[], outputPath: string): Promise<string> {
    const includedPapers = papers.filter(p => p.included);
    return this.generate(includedPapers, outputPath);
  }
}
