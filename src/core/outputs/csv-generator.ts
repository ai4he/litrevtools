/**
 * CSV output generator
 */

import { stringify } from 'csv-stringify/sync';
import { Paper } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class CSVGenerator {
  /**
   * Generate raw extractions CSV file (Phase 1 output)
   * Contains all extracted papers with basic extraction information
   */
  async generateRawExtractions(papers: Paper[], outputPath: string): Promise<string> {
    // Prepare data for CSV
    const records = papers.map(paper => ({
      ID: paper.id,
      Title: paper.title,
      Authors: paper.authors.join('; '),
      Year: paper.year,
      'Publication Date': paper.publicationDate || '',
      Venue: paper.venue || '',
      Citations: paper.citations || 0,
      URL: paper.url,
      'PDF URL': paper.pdfUrl || '',
      DOI: paper.doi || '',
      Abstract: paper.abstract || '',
      Keywords: paper.keywords?.join('; ') || '',
      'Excluded by Keyword': paper.excluded_by_keyword ? 'Yes' : 'No',
      // Keyword presence validation fields
      'All Keywords Present': this.formatBooleanFlag(paper.all_keywords_present),
      'Missing Keywords': paper.missing_keywords?.join('; ') || '',
      'Keyword Presence Details': paper.keyword_presence_details ? this.formatKeywordPresenceDetails(paper.keyword_presence_details) : '',
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
        'Publication Date',
        'Venue',
        'Citations',
        'URL',
        'PDF URL',
        'DOI',
        'Abstract',
        'Keywords',
        'Excluded by Keyword',
        'All Keywords Present',
        'Missing Keywords',
        'Keyword Presence Details',
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
   * Generate annotated/labeled CSV file (Phase 2 output)
   * Contains all papers with semantic filtering labels and reasoning
   */
  async generateLabeledExtractions(papers: Paper[], outputPath: string): Promise<string> {
    // Prepare data for CSV
    const records = papers.map(paper => ({
      ID: paper.id,
      Title: paper.title,
      Authors: paper.authors.join('; '),
      Year: paper.year,
      'Publication Date': paper.publicationDate || '',
      Venue: paper.venue || '',
      Citations: paper.citations || 0,
      URL: paper.url,
      'PDF URL': paper.pdfUrl || '',
      DOI: paper.doi || '',
      Abstract: paper.abstract || '',
      Keywords: paper.keywords?.join('; ') || '',
      'Excluded by Keyword': paper.excluded_by_keyword ? 'Yes' : 'No',
      // Keyword presence validation fields
      'All Keywords Present': this.formatBooleanFlag(paper.all_keywords_present),
      'Missing Keywords': paper.missing_keywords?.join('; ') || '',
      'Keyword Presence Details': paper.keyword_presence_details ? this.formatKeywordPresenceDetails(paper.keyword_presence_details) : '',
      // Semantic filtering fields
      'Systematic Filtering Inclusion': this.formatBooleanFlag(paper.systematic_filtering_inclusion),
      'Systematic Filtering Inclusion Reasoning': paper.systematic_filtering_inclusion_reasoning || '',
      'Systematic Filtering Exclusion': this.formatBooleanFlag(paper.systematic_filtering_exclusion),
      'Systematic Filtering Exclusion Reasoning': paper.systematic_filtering_exclusion_reasoning || '',
      // Overall decision
      'Included': paper.included ? 'Yes' : 'No',
      // Legacy LLM fields (for backward compatibility)
      'LLM Confidence': paper.llmConfidence?.toFixed(2) || '',
      'LLM Reasoning': paper.llmReasoning || '',
      'Category': paper.category || '',
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
        'Publication Date',
        'Venue',
        'Citations',
        'URL',
        'PDF URL',
        'DOI',
        'Abstract',
        'Keywords',
        'Excluded by Keyword',
        'All Keywords Present',
        'Missing Keywords',
        'Keyword Presence Details',
        'Systematic Filtering Inclusion',
        'Systematic Filtering Inclusion Reasoning',
        'Systematic Filtering Exclusion',
        'Systematic Filtering Exclusion Reasoning',
        'Included',
        'LLM Confidence',
        'LLM Reasoning',
        'Category',
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
   * Generate CSV file from papers (legacy method, now generates labeled CSV)
   * @deprecated Use generateRawExtractions or generateLabeledExtractions instead
   */
  async generate(papers: Paper[], outputPath: string): Promise<string> {
    return this.generateLabeledExtractions(papers, outputPath);
  }

  /**
   * Generate CSV with only included papers
   */
  async generateIncludedOnly(papers: Paper[], outputPath: string): Promise<string> {
    const includedPapers = papers.filter(p => p.included);
    return this.generateLabeledExtractions(includedPapers, outputPath);
  }

  /**
   * Format boolean flag for CSV (1, 0, or empty)
   */
  private formatBooleanFlag(value: boolean | undefined): string {
    if (value === undefined) return '';
    return value ? '1' : '0';
  }

  /**
   * Format keyword presence details as a readable string
   * Example: "large language model: YES; mathematical reasoning: NO"
   */
  private formatKeywordPresenceDetails(details: Record<string, boolean>): string {
    return Object.entries(details)
      .map(([keyword, present]) => `${keyword}: ${present ? 'YES' : 'NO'}`)
      .join('; ');
  }
}
