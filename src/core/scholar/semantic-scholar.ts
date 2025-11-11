/**
 * Semantic Scholar API Integration
 * API Documentation: https://api.semanticscholar.org/api-docs/graph
 */

import axios from 'axios';
import { Paper } from '../types';

export interface SemanticScholarConfig {
  apiKey?: string; // Optional - increases rate limits if provided
  baseUrl?: string;
}

export interface SemanticScholarSearchParams {
  query: string;
  year?: number;
  yearRange?: { min: number; max: number };
  limit?: number;
  offset?: number;
  fields?: string[];
}

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  authors: Array<{
    authorId: string;
    name: string;
  }>;
  year: number;
  abstract?: string;
  citationCount: number;
  venue?: string;
  publicationDate?: string;
  url: string;
  openAccessPdf?: {
    url: string;
    status: string;
  };
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
  };
}

interface SemanticScholarResponse {
  total: number;
  offset: number;
  next?: number;
  data: SemanticScholarPaper[];
}

export class SemanticScholarService {
  private config: SemanticScholarConfig;
  private baseUrl: string;
  private requestCount: number = 0;
  private requestWindowStart: number = Date.now();
  private readonly maxRequestsPer5Min = 4500; // Stay under 5000 limit

  constructor(config: SemanticScholarConfig = {}) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.semanticscholar.org/graph/v1';
  }

  /**
   * Search for papers using Semantic Scholar API
   */
  async search(params: SemanticScholarSearchParams): Promise<{
    papers: Paper[];
    total: number;
    hasMore: boolean;
  }> {
    // Rate limiting check
    await this.checkRateLimit();

    // Build query parameters
    const queryParams: any = {
      query: params.query,
      limit: params.limit || 100,
      offset: params.offset || 0,
      fields: (params.fields || [
        'paperId',
        'title',
        'authors',
        'year',
        'abstract',
        'citationCount',
        'venue',
        'publicationDate',
        'url',
        'openAccessPdf',
        'externalIds'
      ]).join(',')
    };

    // Add year filter
    if (params.year) {
      queryParams.year = params.year.toString();
    } else if (params.yearRange) {
      queryParams.year = `${params.yearRange.min}-${params.yearRange.max}`;
    }

    try {
      console.log(`Searching Semantic Scholar: "${params.query}" (limit: ${queryParams.limit}, offset: ${queryParams.offset})`);

      const response = await axios.get<SemanticScholarResponse>(
        `${this.baseUrl}/paper/search`,
        {
          params: queryParams,
          headers: this.config.apiKey ? {
            'x-api-key': this.config.apiKey
          } : {}
        }
      );

      this.requestCount++;

      const papers = response.data.data.map(paper => this.mapToPaper(paper));

      console.log(`Found ${papers.length} papers (${response.data.total} total available)`);

      return {
        papers,
        total: response.data.total,
        hasMore: response.data.next !== undefined
      };
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.error('Rate limit exceeded, waiting before retry...');
        await this.delay(60000); // Wait 1 minute
        return this.search(params); // Retry
      }

      throw new Error(`Semantic Scholar API error: ${error.message}`);
    }
  }

  /**
   * Search across multiple years
   */
  async searchByYears(
    keywords: string[],
    years: number[],
    maxResultsPerYear: number = 100
  ): Promise<Paper[]> {
    const allPapers: Paper[] = [];
    const query = keywords.join(' ');

    for (const year of years) {
      try {
        console.log(`\nSearching year ${year}...`);

        const result = await this.search({
          query,
          year,
          limit: maxResultsPerYear
        });

        allPapers.push(...result.papers);

        console.log(`Year ${year}: Found ${result.papers.length} papers`);

        // Small delay between year searches to be respectful
        await this.delay(500);
      } catch (error: any) {
        console.error(`Error searching year ${year}:`, error.message);
        // Continue with other years
      }
    }

    return allPapers;
  }

  /**
   * Paginated search - fetches all results up to maxTotal
   */
  async searchPaginated(
    keywords: string[],
    year: number | undefined,
    maxTotal: number = 1000
  ): Promise<Paper[]> {
    const allPapers: Paper[] = [];
    const query = keywords.join(' ');
    const pageSize = 100; // Semantic Scholar max is 100
    let offset = 0;
    let hasMore = true;

    while (hasMore && allPapers.length < maxTotal) {
      const result = await this.search({
        query,
        year,
        limit: Math.min(pageSize, maxTotal - allPapers.length),
        offset
      });

      allPapers.push(...result.papers);

      hasMore = result.hasMore && allPapers.length < maxTotal;
      offset += result.papers.length;

      console.log(`Progress: ${allPapers.length}/${Math.min(result.total, maxTotal)} papers`);

      if (hasMore) {
        // Small delay between pages
        await this.delay(500);
      }
    }

    return allPapers;
  }

  /**
   * Map Semantic Scholar paper to internal Paper type
   */
  private mapToPaper(sPaper: SemanticScholarPaper): Paper {
    const id = this.generatePaperId(sPaper.title, sPaper.year);

    const paper: Paper = {
      id,
      title: sPaper.title,
      authors: sPaper.authors.map(a => a.name),
      year: sPaper.year,
      publicationDate: sPaper.publicationDate, // Include publication date for month filtering
      abstract: sPaper.abstract,
      url: sPaper.url,
      citations: sPaper.citationCount,
      source: 'semantic-scholar',
      venue: sPaper.venue,
      extractedAt: new Date(),
      included: true // Will be filtered later based on exclusion criteria
    };

    // Add PDF URL if available
    if (sPaper.openAccessPdf?.url) {
      paper.pdfUrl = sPaper.openAccessPdf.url;
    }

    // Add DOI if available
    if (sPaper.externalIds?.DOI) {
      paper.doi = sPaper.externalIds.DOI;
    }

    // Add keywords/external IDs as keywords
    const keywords: string[] = [];
    if (sPaper.externalIds?.ArXiv) {
      keywords.push(`arxiv:${sPaper.externalIds.ArXiv}`);
    }
    if (keywords.length > 0) {
      paper.keywords = keywords;
    }

    return paper;
  }

  /**
   * Generate a unique paper ID
   */
  private generatePaperId(title: string, year: number): string {
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hash = normalized.substring(0, 20);
    return `${hash}-${year}`;
  }

  /**
   * Check rate limit and wait if necessary
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowElapsed = now - this.requestWindowStart;

    // Reset counter every 5 minutes
    if (windowElapsed >= 5 * 60 * 1000) {
      this.requestCount = 0;
      this.requestWindowStart = now;
      return;
    }

    // If approaching limit, wait until window resets
    if (this.requestCount >= this.maxRequestsPer5Min) {
      const waitTime = (5 * 60 * 1000) - windowElapsed;
      console.log(`Rate limit approaching, waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this.delay(waitTime);
      this.requestCount = 0;
      this.requestWindowStart = Date.now();
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    requestCount: number;
    windowStart: Date;
    windowElapsed: number;
    remainingRequests: number;
  } {
    const now = Date.now();
    const windowElapsed = now - this.requestWindowStart;

    return {
      requestCount: this.requestCount,
      windowStart: new Date(this.requestWindowStart),
      windowElapsed,
      remainingRequests: Math.max(0, this.maxRequestsPer5Min - this.requestCount)
    };
  }
}
