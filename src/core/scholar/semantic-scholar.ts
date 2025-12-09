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
  private lastRequestTime: number = 0;

  constructor(config: SemanticScholarConfig = {}) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.semanticscholar.org/graph/v1';
  }

  /**
   * Search for papers using Semantic Scholar API
   *
   * IMPORTANT: The Semantic Scholar API has a hard limit of 1000 results per query
   * (offset + limit ≤ 1000). If you need more results, consider:
   * - Breaking your query into smaller, more specific searches
   * - Using the bulk search endpoint or Datasets API for large-scale data extraction
   */
  async search(
    params: SemanticScholarSearchParams,
    retryCount: number = 0,
    maxRetries: number = 3,
    onWaitStart?: (waitTimeMs: number, reason: string) => void,
    onWaitEnd?: () => void
  ): Promise<{
    papers: Paper[];
    total: number;
    hasMore: boolean;
  }> {
    // Warn if trying to exceed the 1000-result limit
    const requestedOffset = params.offset || 0;
    const requestedLimit = params.limit || 100;
    if (requestedOffset + requestedLimit > 1000) {
      console.warn(`⚠️  WARNING: Semantic Scholar API limits results to 1000 per query. Requested offset (${requestedOffset}) + limit (${requestedLimit}) = ${requestedOffset + requestedLimit} exceeds this limit.`);
    }

    // Rate limiting check
    await this.checkRateLimit(onWaitStart, onWaitEnd);

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
          } : {},
          timeout: 30000 // 30 second timeout to prevent hanging
        }
      );

      const papers = response.data.data.map(paper => this.mapToPaper(paper));

      console.log(`Found ${papers.length} papers (${response.data.total} total available)`);

      return {
        papers,
        total: response.data.total,
        hasMore: response.data.next !== undefined
      };
    } catch (error: any) {
      // Handle 400 Bad Request - often means offset exceeded limit or invalid params
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.message || error.response?.data?.error || '';
        console.warn(`Semantic Scholar API returned 400: ${errorMessage}`);

        // If offset is high, this is likely the API's way of saying "no more results"
        // The API has a hard limit of 1000 results (offset + limit <= 1000)
        if (requestedOffset >= 900 || (requestedOffset + requestedLimit > 1000)) {
          console.log(`Treating 400 error as end of results (offset ${requestedOffset} likely exceeds API limit)`);
          return {
            papers: [],
            total: requestedOffset, // We got at least this many
            hasMore: false
          };
        }

        // For other 400 errors, make it retryable in case it's transient
        if (retryCount < maxRetries) {
          const waitTime = 5000 * Math.pow(2, retryCount);
          console.error(`Bad request (400), waiting ${waitTime / 1000}s before retry... (attempt ${retryCount + 1}/${maxRetries})`);
          if (onWaitStart) {
            onWaitStart(waitTime, `Bad request (400), retrying in ${waitTime / 1000}s`);
          }
          await this.delay(waitTime);
          if (onWaitEnd) {
            onWaitEnd();
          }
          return this.search(params, retryCount + 1, maxRetries, onWaitStart, onWaitEnd);
        }

        // After max retries, treat as retryable error for batch recovery
        const retryableError = new Error(`Bad request (400) after ${maxRetries} retries: ${errorMessage}`);
        (retryableError as any).retryable = true;
        (retryableError as any).type = 'bad_request';
        (retryableError as any).params = params;
        throw retryableError;
      }

      if (error.response?.status === 429) {
        if (retryCount >= maxRetries) {
          console.error(`Rate limit exceeded. Max retries (${maxRetries}) reached.`);
          // Throw a retryable error instead of returning empty results
          const retryableError = new Error(`Rate limit exceeded after ${maxRetries} retries`);
          (retryableError as any).retryable = true;
          (retryableError as any).type = 'rate_limit';
          (retryableError as any).params = params;
          throw retryableError;
        }
        // Exponential backoff: 10s, 20s, 40s, etc.
        const waitTime = 10000 * Math.pow(2, retryCount);
        console.error(`Rate limit exceeded, waiting ${waitTime / 1000}s before retry... (attempt ${retryCount + 1}/${maxRetries})`);
        if (onWaitStart) {
          onWaitStart(waitTime, `Rate limit exceeded (429), retrying in ${waitTime / 1000}s (attempt ${retryCount + 1}/${maxRetries})`);
        }
        await this.delay(waitTime);
        if (onWaitEnd) {
          onWaitEnd();
        }
        return this.search(params, retryCount + 1, maxRetries, onWaitStart, onWaitEnd); // Retry with incremented count
      }

      // Handle timeout errors
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        if (retryCount >= maxRetries) {
          console.error(`Request timeout. Max retries (${maxRetries}) reached.`);
          // Throw a retryable error instead of returning empty results
          const retryableError = new Error(`Request timeout after ${maxRetries} retries`);
          (retryableError as any).retryable = true;
          (retryableError as any).type = 'timeout';
          (retryableError as any).params = params;
          throw retryableError;
        }
        // Exponential backoff for timeouts: 5s, 10s, 20s
        const waitTime = 5000 * Math.pow(2, retryCount);
        console.error(`Request timeout, waiting ${waitTime / 1000}s before retry... (attempt ${retryCount + 1}/${maxRetries})`);
        if (onWaitStart) {
          onWaitStart(waitTime, `Request timeout, retrying in ${waitTime / 1000}s (attempt ${retryCount + 1}/${maxRetries})`);
        }
        await this.delay(waitTime);
        if (onWaitEnd) {
          onWaitEnd();
        }
        return this.search(params, retryCount + 1, maxRetries, onWaitStart, onWaitEnd);
      }

      // Handle 5xx server errors (retryable)
      if (error.response?.status >= 500 && error.response?.status < 600) {
        if (retryCount >= maxRetries) {
          console.error(`Server error (${error.response.status}). Max retries (${maxRetries}) reached.`);
          const retryableError = new Error(`Server error ${error.response.status} after ${maxRetries} retries`);
          (retryableError as any).retryable = true;
          (retryableError as any).type = 'server_error';
          (retryableError as any).params = params;
          throw retryableError;
        }
        const waitTime = 5000 * Math.pow(2, retryCount);
        console.error(`Server error (${error.response.status}), waiting ${waitTime / 1000}s before retry... (attempt ${retryCount + 1}/${maxRetries})`);
        if (onWaitStart) {
          onWaitStart(waitTime, `Server error (${error.response.status}), retrying in ${waitTime / 1000}s`);
        }
        await this.delay(waitTime);
        if (onWaitEnd) {
          onWaitEnd();
        }
        return this.search(params, retryCount + 1, maxRetries, onWaitStart, onWaitEnd);
      }

      // Handle network errors (retryable)
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        if (retryCount >= maxRetries) {
          console.error(`Network error: ${error.message}. Max retries (${maxRetries}) reached.`);
          const retryableError = new Error(`Network error after ${maxRetries} retries: ${error.message}`);
          (retryableError as any).retryable = true;
          (retryableError as any).type = 'network';
          (retryableError as any).params = params;
          throw retryableError;
        }
        const waitTime = 5000 * Math.pow(2, retryCount);
        console.error(`Network error, waiting ${waitTime / 1000}s before retry... (attempt ${retryCount + 1}/${maxRetries})`);
        if (onWaitStart) {
          onWaitStart(waitTime, `Network error, retrying in ${waitTime / 1000}s`);
        }
        await this.delay(waitTime);
        if (onWaitEnd) {
          onWaitEnd();
        }
        return this.search(params, retryCount + 1, maxRetries, onWaitStart, onWaitEnd);
      }

      // For any other errors, make them retryable if we haven't exceeded retries
      if (retryCount < maxRetries) {
        const waitTime = 5000 * Math.pow(2, retryCount);
        console.error(`Unexpected error: ${error.message}, waiting ${waitTime / 1000}s before retry... (attempt ${retryCount + 1}/${maxRetries})`);
        if (onWaitStart) {
          onWaitStart(waitTime, `Unexpected error, retrying in ${waitTime / 1000}s`);
        }
        await this.delay(waitTime);
        if (onWaitEnd) {
          onWaitEnd();
        }
        return this.search(params, retryCount + 1, maxRetries, onWaitStart, onWaitEnd);
      }

      console.error(`Semantic Scholar API error: ${error.message}`, error.response?.data || '');
      // Make all errors retryable for batch recovery mechanism
      const retryableError = new Error(`Semantic Scholar API error after ${maxRetries} retries: ${error.message}`);
      (retryableError as any).retryable = true;
      (retryableError as any).type = 'unknown';
      (retryableError as any).params = params;
      throw retryableError;
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
   *
   * Current Semantic Scholar API rate limits (as of 2024):
   * - Unauthenticated: 1,000 requests/second (shared across all users)
   * - Authenticated: 1 request/second (dedicated, per API key)
   *
   * We enforce the authenticated limit (1 RPS) when an API key is present.
   * For unauthenticated requests, we don't enforce delays (the shared 1000 RPS is sufficient).
   */
  private async checkRateLimit(
    onWaitStart?: (waitTimeMs: number, reason: string) => void,
    onWaitEnd?: () => void
  ): Promise<void> {
    // Only enforce rate limiting for authenticated requests (1 RPS)
    if (this.config.apiKey) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const minDelay = 1000; // 1 second = 1 RPS

      if (timeSinceLastRequest < minDelay) {
        const waitTime = minDelay - timeSinceLastRequest;
        if (onWaitStart) {
          onWaitStart(waitTime, `Rate limiting: Waiting ${Math.ceil(waitTime)}ms (authenticated API key, 1 req/sec limit)`);
        }
        await this.delay(waitTime);
        if (onWaitEnd) {
          onWaitEnd();
        }
      }

      this.lastRequestTime = Date.now();
    }
    // For unauthenticated requests, no delay needed (1000 RPS shared is plenty)
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
    authenticated: boolean;
    rateLimit: string;
    lastRequestTime: Date | null;
    timeSinceLastRequest: number;
  } {
    const now = Date.now();
    const timeSinceLastRequest = this.lastRequestTime > 0 ? now - this.lastRequestTime : 0;

    return {
      authenticated: !!this.config.apiKey,
      rateLimit: this.config.apiKey
        ? '1 request/second (authenticated)'
        : '1000 requests/second (shared, unauthenticated)',
      lastRequestTime: this.lastRequestTime > 0 ? new Date(this.lastRequestTime) : null,
      timeSinceLastRequest
    };
  }
}
