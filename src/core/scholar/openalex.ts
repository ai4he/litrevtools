/**
 * OpenAlex API Integration
 * API Documentation: https://docs.openalex.org/
 *
 * OpenAlex is a free and open catalog of the world's scholarly papers,
 * with over 240M works indexed.
 */

import axios from 'axios';
import { Paper } from '../types';

export interface OpenAlexConfig {
  apiKey?: string; // Optional API key for premium users
  email?: string; // Email for polite pool (recommended)
  baseUrl?: string;
}

export interface OpenAlexSearchParams {
  query: string;
  year?: number;
  yearRange?: { min: number; max: number };
  limit?: number; // Max 200 per page
  cursor?: string; // For pagination
  fields?: string[];
}

/**
 * OpenAlex Work Object (simplified)
 * Full spec: https://docs.openalex.org/api-entities/works/work-object
 */
interface OpenAlexWork {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  publication_date?: string;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: Array<{
    author: {
      id: string;
      display_name: string;
    };
    institutions?: Array<{
      id: string;
      display_name: string;
    }>;
  }>;
  cited_by_count?: number;
  primary_location?: {
    source?: {
      id: string;
      display_name: string;
      type: string;
    };
    pdf_url?: string;
    landing_page_url?: string;
  };
  locations?: Array<{
    pdf_url?: string;
    landing_page_url?: string;
    is_oa?: boolean;
  }>;
  open_access?: {
    is_oa: boolean;
    oa_status: string;
    oa_url?: string;
  };
  keywords?: Array<{
    keyword: string;
    score: number;
  }>;
  concepts?: Array<{
    id: string;
    display_name: string;
    score: number;
  }>;
}

interface OpenAlexResponse {
  meta: {
    count: number;
    db_response_time_ms: number;
    page?: number;
    per_page: number;
    next_cursor?: string;
  };
  results: OpenAlexWork[];
}

export class OpenAlexService {
  private config: OpenAlexConfig;
  private baseUrl: string;
  private lastRequestTime: number = 0;

  constructor(config: OpenAlexConfig = {}) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.openalex.org';
  }

  /**
   * Search for papers using OpenAlex API
   *
   * OpenAlex has generous limits:
   * - 100,000 calls per day
   * - 10 requests per second
   * - Cursor pagination allows unlimited results
   */
  async search(
    params: OpenAlexSearchParams,
    retryCount: number = 0,
    maxRetries: number = 3,
    onWaitStart?: (waitTimeMs: number, reason: string) => void,
    onWaitEnd?: () => void
  ): Promise<{
    papers: Paper[];
    total: number;
    hasMore: boolean;
    nextCursor?: string;
  }> {
    // Rate limiting check (10 requests per second)
    await this.checkRateLimit(onWaitStart, onWaitEnd);

    // Build query parameters
    const queryParams: Record<string, string> = {};

    // Add search query
    if (params.query) {
      queryParams.search = params.query;
    }

    // Add filters
    const filters: string[] = [];

    // Add year filter
    if (params.year) {
      filters.push(`publication_year:${params.year}`);
    } else if (params.yearRange) {
      filters.push(`publication_year:${params.yearRange.min}-${params.yearRange.max}`);
    }

    // Add filters to query params
    if (filters.length > 0) {
      queryParams.filter = filters.join(',');
    }

    // Pagination
    queryParams['per-page'] = String(Math.min(params.limit || 200, 200)); // Max 200 per page

    // Use cursor-based pagination for large result sets
    if (params.cursor) {
      queryParams.cursor = params.cursor;
    } else {
      // Start cursor pagination
      queryParams.cursor = '*';
    }

    // Select specific fields to reduce response size
    queryParams.select = [
      'id',
      'doi',
      'title',
      'display_name',
      'publication_year',
      'publication_date',
      'abstract_inverted_index',
      'authorships',
      'cited_by_count',
      'primary_location',
      'locations',
      'open_access',
      'keywords',
      'concepts'
    ].join(',');

    // Add authentication (polite pool)
    if (this.config.apiKey) {
      queryParams.api_key = this.config.apiKey;
    } else if (this.config.email) {
      queryParams.mailto = this.config.email;
    }

    try {
      console.log(`Searching OpenAlex: "${params.query}" (per-page: ${queryParams['per-page']}, cursor: ${params.cursor ? 'continuing' : 'start'})`);

      const response = await axios.get<OpenAlexResponse>(
        `${this.baseUrl}/works`,
        {
          params: queryParams,
          timeout: 30000 // 30 second timeout
        }
      );

      const papers = response.data.results
        .filter(work => work.title || work.display_name) // Skip works without titles
        .map(work => this.mapToPaper(work));

      console.log(`Found ${papers.length} papers (${response.data.meta.count} total available)`);

      return {
        papers,
        total: response.data.meta.count,
        hasMore: !!response.data.meta.next_cursor && response.data.results.length > 0,
        nextCursor: response.data.meta.next_cursor
      };
    } catch (error: any) {
      // Handle rate limit (429)
      if (error.response?.status === 429) {
        if (retryCount >= maxRetries) {
          console.error(`Rate limit exceeded. Max retries (${maxRetries}) reached.`);
          const retryableError = new Error(`Rate limit exceeded after ${maxRetries} retries`);
          (retryableError as any).retryable = true;
          (retryableError as any).type = 'rate_limit';
          (retryableError as any).params = params;
          throw retryableError;
        }
        // Exponential backoff: 1s, 2s, 4s, etc. (OpenAlex is more lenient)
        const waitTime = 1000 * Math.pow(2, retryCount);
        console.error(`Rate limit exceeded, waiting ${waitTime / 1000}s before retry... (attempt ${retryCount + 1}/${maxRetries})`);
        if (onWaitStart) {
          onWaitStart(waitTime, `Rate limit exceeded (429), retrying in ${waitTime / 1000}s (attempt ${retryCount + 1}/${maxRetries})`);
        }
        await this.delay(waitTime);
        if (onWaitEnd) {
          onWaitEnd();
        }
        return this.search(params, retryCount + 1, maxRetries, onWaitStart, onWaitEnd);
      }

      // Handle timeout
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        if (retryCount >= maxRetries) {
          const retryableError = new Error(`Request timeout after ${maxRetries} retries`);
          (retryableError as any).retryable = true;
          (retryableError as any).type = 'timeout';
          (retryableError as any).params = params;
          throw retryableError;
        }
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

      // Handle 5xx server errors
      if (error.response?.status >= 500 && error.response?.status < 600) {
        if (retryCount >= maxRetries) {
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

      // Handle network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        if (retryCount >= maxRetries) {
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

      // For any other errors, try to retry
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

      console.error(`OpenAlex API error: ${error.message}`, error.response?.data || '');
      const retryableError = new Error(`OpenAlex API error after ${maxRetries} retries: ${error.message}`);
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
    maxResultsPerYear: number = 200
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
   * Paginated search - fetches all results up to maxTotal using cursor pagination
   */
  async searchPaginated(
    keywords: string[],
    year: number | undefined,
    maxTotal: number = 10000
  ): Promise<Paper[]> {
    const allPapers: Paper[] = [];
    const query = keywords.join(' ');
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore && allPapers.length < maxTotal) {
      const result = await this.search({
        query,
        year,
        limit: Math.min(200, maxTotal - allPapers.length),
        cursor
      });

      allPapers.push(...result.papers);

      hasMore = result.hasMore && allPapers.length < maxTotal;
      cursor = result.nextCursor;

      console.log(`Progress: ${allPapers.length}/${Math.min(result.total, maxTotal)} papers`);
    }

    return allPapers;
  }

  /**
   * Convert inverted index abstract to plain text
   * OpenAlex stores abstracts as inverted indexes due to legal constraints
   */
  private invertedIndexToText(invertedIndex: Record<string, number[]> | undefined): string | undefined {
    if (!invertedIndex || Object.keys(invertedIndex).length === 0) {
      return undefined;
    }

    // Find the maximum position to determine array size
    let maxPosition = 0;
    for (const positions of Object.values(invertedIndex)) {
      for (const pos of positions) {
        if (pos > maxPosition) {
          maxPosition = pos;
        }
      }
    }

    // Create array and fill with words at their positions
    const words: string[] = new Array(maxPosition + 1).fill('');
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) {
        words[pos] = word;
      }
    }

    // Join words to form the abstract
    return words.join(' ').trim();
  }

  /**
   * Map OpenAlex work to internal Paper type
   */
  private mapToPaper(work: OpenAlexWork): Paper {
    const title = work.title || work.display_name || 'Untitled';
    const id = this.generatePaperId(title, work.publication_year || 0);

    // Get authors from authorships array
    const authors = work.authorships?.map(a => a.author.display_name) || [];

    // Get abstract from inverted index
    const abstract = this.invertedIndexToText(work.abstract_inverted_index);

    // Get primary URL
    const url = work.primary_location?.landing_page_url ||
                work.doi ||
                work.id ||
                '';

    // Get PDF URL (prefer open access)
    let pdfUrl: string | undefined;
    if (work.open_access?.oa_url) {
      pdfUrl = work.open_access.oa_url;
    } else if (work.primary_location?.pdf_url) {
      pdfUrl = work.primary_location.pdf_url;
    } else {
      // Check other locations for PDF
      const pdfLocation = work.locations?.find(loc => loc.pdf_url);
      pdfUrl = pdfLocation?.pdf_url;
    }

    // Get venue/source name
    const venue = work.primary_location?.source?.display_name;

    // Get DOI (clean format)
    let doi: string | undefined;
    if (work.doi) {
      // Remove https://doi.org/ prefix if present
      doi = work.doi.replace(/^https?:\/\/doi\.org\//, '');
    }

    // Get keywords from concepts or keywords field
    let keywords: string[] = [];
    if (work.keywords && work.keywords.length > 0) {
      keywords = work.keywords.map(k => k.keyword);
    } else if (work.concepts && work.concepts.length > 0) {
      // Use top concepts as keywords (score > 0.5)
      keywords = work.concepts
        .filter(c => c.score > 0.5)
        .map(c => c.display_name);
    }

    const paper: Paper = {
      id,
      title,
      authors,
      year: work.publication_year || new Date().getFullYear(),
      publicationDate: work.publication_date,
      abstract,
      url,
      citations: work.cited_by_count || 0,
      source: 'openalex',
      venue,
      pdfUrl,
      doi,
      keywords: keywords.length > 0 ? keywords : undefined,
      extractedAt: new Date(),
      included: true // Will be filtered later based on exclusion criteria
    };

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
   * OpenAlex rate limits:
   * - 10 requests per second (100ms between requests)
   * - 100,000 calls per day
   */
  private async checkRateLimit(
    onWaitStart?: (waitTimeMs: number, reason: string) => void,
    onWaitEnd?: () => void
  ): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minDelay = 100; // 10 RPS = 100ms between requests

    if (timeSinceLastRequest < minDelay) {
      const waitTime = minDelay - timeSinceLastRequest;
      if (onWaitStart) {
        onWaitStart(waitTime, `Rate limiting: Waiting ${Math.ceil(waitTime)}ms (OpenAlex 10 req/sec limit)`);
      }
      await this.delay(waitTime);
      if (onWaitEnd) {
        onWaitEnd();
      }
    }

    this.lastRequestTime = Date.now();
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
      authenticated: !!(this.config.apiKey || this.config.email),
      rateLimit: '10 requests/second, 100,000 requests/day',
      lastRequestTime: this.lastRequestTime > 0 ? new Date(this.lastRequestTime) : null,
      timeSinceLastRequest
    };
  }
}
