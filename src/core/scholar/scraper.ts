/**
 * Google Scholar Scraper with Tor support
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { Paper } from '../types';
import { TorManager, TorPoolManager } from './tor-manager';

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');

// Use stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

export interface ScraperConfig {
  useTor: boolean;
  torManager?: TorManager;
  headless: boolean;
  screenshotEnabled: boolean;
}

export class GoogleScholarScraper {
  private config: ScraperConfig;
  private browser?: Browser;
  private torManager?: TorManager;

  constructor(config: ScraperConfig) {
    this.config = config;
    this.torManager = config.torManager;
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080'
    ];

    // Add Tor proxy if enabled
    if (this.config.useTor && this.torManager) {
      const proxyConfig = this.torManager.getProxyConfig();
      args.push(`--proxy-server=${proxyConfig}`);
    }

    this.browser = await puppeteerExtra.launch({
      headless: this.config.headless ? 'new' : false,
      args
    });
  }

  /**
   * Check if page contains CAPTCHA
   */
  private async detectCaptcha(page: Page): Promise<boolean> {
    try {
      const captchaSelectors = [
        '#gs_captcha_c',
        '#gs_captcha_f',
        'iframe[src*="recaptcha"]',
        '[id*="captcha"]',
        'h1:has-text("kein Roboter")',
        'h1:has-text("not a robot")'
      ];

      for (const selector of captchaSelectors) {
        const element = await page.$(selector).catch(() => null);
        if (element) {
          console.log(`CAPTCHA detected: ${selector}`);
          return true;
        }
      }

      // Check page content for CAPTCHA text
      const bodyText = await page.evaluate(() => {
        // @ts-ignore - document is available in browser context
        const body = document.body;
        return body ? body.textContent || '' : '';
      }).catch(() => '');
      if (bodyText.toLowerCase().includes('captcha') || bodyText.includes('Roboter') || bodyText.includes('not a robot')) {
        console.log('CAPTCHA detected in page text');
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Random delay between min and max milliseconds
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Search Google Scholar for papers with automatic retry and circuit rotation
   */
  async search(
    keywords: string[],
    year?: number,
    maxResults?: number
  ): Promise<{ papers: Paper[], screenshot?: string }> {
    const maxRetries = 10;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        console.log(`Search attempt ${attempt}/${maxRetries}${year ? ` for year ${year}` : ''}`);

        // Rotate circuit before each attempt (except first)
        if (attempt > 1 && this.torManager) {
          console.log('Rotating Tor circuit...');
          await this.rotateTorCircuit();
          // Wait for circuit to stabilize
          await this.randomDelay(3000, 5000);
        }

        if (!this.browser) {
          await this.initialize();
        }

        const page = await this.browser!.newPage();

        try {
          // Set viewport with slight randomization
          const width = 1920 + Math.floor(Math.random() * 100);
          const height = 1080 + Math.floor(Math.random() * 100);
          await page.setViewport({ width, height });

          // Random delay before navigation
          await this.randomDelay(1000, 3000);

          // Build search query
          const query = keywords.join(' ');
          let url = `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`;

          if (year) {
            url += `&as_ylo=${year}&as_yhi=${year}`;
          }

          // Navigate to Google Scholar
          console.log(`Navigating to: ${url.substring(0, 100)}...`);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

          // Check for CAPTCHA
          const hasCaptcha = await this.detectCaptcha(page);

          if (hasCaptcha) {
            console.log(`CAPTCHA detected on attempt ${attempt}, will retry with new circuit`);
            await page.close();

            // Exponential backoff
            const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await this.randomDelay(backoffDelay, backoffDelay + 2000);

            continue; // Retry with new circuit
          }

          // Wait for results to load
          let resultsFound = false;
          try {
            await page.waitForSelector('.gs_r.gs_or.gs_scl', { timeout: 10000 });
            resultsFound = true;
            console.log('Results found!');
          } catch (e) {
            console.log('No results with selector .gs_r.gs_or.gs_scl, checking for alternate structures');

            // Try alternate selectors
            const alternateSelectors = [
              '.gs_r',
              '.gs_ri',
              '[data-rp]',
              '#gs_res_ccl_mid .gs_r'
            ];

            for (const selector of alternateSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: 2000 });
                console.log(`Found results with selector: ${selector}`);
                resultsFound = true;
                break;
              } catch (e2) {
                // Continue to next selector
              }
            }
          }

          if (!resultsFound) {
            console.log('No results found, retrying...');
            await page.close();
            continue;
          }

          // Extract papers
          const papers = await this.extractPapers(page, maxResults);

          if (papers.length === 0) {
            console.log('No papers extracted, retrying...');
            await page.close();
            continue;
          }

          console.log(`Successfully extracted ${papers.length} papers`);

          // Take screenshot if enabled
          let screenshot: string | undefined;
          if (this.config.screenshotEnabled) {
            const buffer = await page.screenshot({ encoding: 'base64' });
            screenshot = buffer as string;
          }

          await page.close();

          return { papers, screenshot };
        } catch (error) {
          await page.close().catch(() => {});
          throw error;
        }
      } catch (error: any) {
        console.error(`Attempt ${attempt} failed:`, error.message);

        if (attempt >= maxRetries) {
          throw new Error(`Failed to fetch results after ${maxRetries} attempts: ${error.message}`);
        }

        // Wait before next retry
        await this.randomDelay(2000, 4000);
      }
    }

    throw new Error(`Failed to fetch results after ${maxRetries} attempts`);
  }

  /**
   * Extract paper information from the current page
   */
  private async extractPapers(page: Page, maxResults?: number): Promise<Paper[]> {
    const papers: Paper[] = [];

    // Extract all paper entries
    const paperElements = await page.$$('.gs_r.gs_or.gs_scl');
    const limit = maxResults || paperElements.length;

    for (let i = 0; i < Math.min(limit, paperElements.length); i++) {
      const element = paperElements[i];

      try {
        const paper = await this.extractPaperFromElement(page, element);
        if (paper) {
          papers.push(paper);
        }
      } catch (error) {
        console.error('Error extracting paper:', error);
      }
    }

    return papers;
  }

  /**
   * Extract paper data from a single result element
   */
  private async extractPaperFromElement(page: Page, element: any): Promise<Paper | null> {
    try {
      // Extract title
      const titleElement = await element.$('.gs_rt');
      if (!titleElement) return null;

      const titleText = await page.evaluate((el: any) => el.textContent, titleElement);
      const title = titleText.replace(/^\[.*?\]\s*/, '').trim(); // Remove [PDF], [HTML] etc.

      // Extract URL
      const linkElement = await element.$('.gs_rt a');
      const url = linkElement
        ? await page.evaluate((el: any) => el.href, linkElement)
        : '';

      // Extract authors and venue
      const authorsElement = await element.$('.gs_a');
      const authorsText = authorsElement
        ? await page.evaluate((el: any) => el.textContent, authorsElement)
        : '';

      const authorsParts = authorsText.split(' - ');
      const authors = authorsParts[0]?.split(',').map((a: string) => a.trim()) || [];
      const venue = authorsParts[1]?.trim() || undefined;

      // Extract year
      const yearMatch = authorsText.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();

      // Extract abstract/snippet
      const snippetElement = await element.$('.gs_rs');
      const abstract = snippetElement
        ? await page.evaluate((el: any) => el.textContent, snippetElement)
        : undefined;

      // Extract citation count
      const citedByElement = await element.$('.gs_fl a');
      const citedByText = citedByElement
        ? await page.evaluate((el: any) => el.textContent, citedByElement)
        : '';
      const citationMatch = citedByText.match(/Cited by (\d+)/);
      const citations = citationMatch ? parseInt(citationMatch[1]) : 0;

      // Extract PDF link if available
      const pdfElement = await element.$('.gs_or_ggsm a');
      const pdfUrl = pdfElement
        ? await page.evaluate((el: any) => el.href, pdfElement)
        : undefined;

      // Generate unique ID
      const id = this.generatePaperId(title, year);

      const paper: Paper = {
        id,
        title,
        authors,
        year,
        abstract,
        url,
        citations,
        source: 'semantic-scholar',
        pdfUrl,
        venue,
        extractedAt: new Date(),
        included: true // Will be filtered later based on exclusion criteria
      };

      return paper;
    } catch (error) {
      console.error('Error extracting paper from element:', error);
      return null;
    }
  }

  /**
   * Navigate to next page of results
   */
  async goToNextPage(page: Page): Promise<boolean> {
    try {
      const nextButton = await page.$('.gs_ico_nav_next');
      if (!nextButton) return false;

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        nextButton.click()
      ]);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Rotate Tor circuit
   */
  async rotateTorCircuit(): Promise<void> {
    if (this.torManager) {
      await this.torManager.rotateCircuit();

      // Restart browser with new circuit
      await this.close();
      await this.initialize();
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(page: Page): Promise<string> {
    const buffer = await page.screenshot({ encoding: 'base64' });
    return buffer as string;
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  /**
   * Generate a unique paper ID
   */
  private generatePaperId(title: string, year: number): string {
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hash = normalized.substring(0, 20);
    return `${hash}-${year}`;
  }
}

/**
 * Parallel scraper that uses multiple Tor circuits
 */
export class ParallelScholarScraper {
  private torPool: TorPoolManager;
  private scrapers: GoogleScholarScraper[] = [];
  private config: Omit<ScraperConfig, 'torManager'>;

  constructor(
    parallelCount: number,
    torPool: TorPoolManager,
    config: Omit<ScraperConfig, 'torManager'>
  ) {
    this.torPool = torPool;
    this.config = config;

    // Create scrapers for each Tor manager
    const managers = torPool.getAllManagers();
    for (let i = 0; i < Math.min(parallelCount, managers.length); i++) {
      this.scrapers.push(new GoogleScholarScraper({
        ...config,
        torManager: managers[i]
      }));
    }
  }

  /**
   * Search across multiple years in parallel
   */
  async searchByYears(
    keywords: string[],
    years: number[],
    maxResultsPerYear?: number
  ): Promise<{ papers: Paper[], screenshots: string[] }> {
    const allPapers: Paper[] = [];
    const screenshots: string[] = [];

    // Initialize all scrapers
    await Promise.all(this.scrapers.map(s => s.initialize()));

    // Split years across scrapers
    const yearChunks = this.chunkArray(years, this.scrapers.length);

    const tasks = yearChunks.map(async (yearChunk, index) => {
      const scraper = this.scrapers[index];
      const chunkPapers: Paper[] = [];
      const chunkScreenshots: string[] = [];

      for (const year of yearChunk) {
        try {
          // Rotate circuit before each year search
          await scraper.rotateTorCircuit();

          const result = await scraper.search(keywords, year, maxResultsPerYear);
          chunkPapers.push(...result.papers);

          if (result.screenshot) {
            chunkScreenshots.push(result.screenshot);
          }

          // Small delay to avoid rate limiting
          await this.delay(2000);
        } catch (error) {
          console.error(`Error searching year ${year}:`, error);
        }
      }

      return { papers: chunkPapers, screenshots: chunkScreenshots };
    });

    const results = await Promise.all(tasks);

    // Combine results
    results.forEach(result => {
      allPapers.push(...result.papers);
      screenshots.push(...result.screenshots);
    });

    return { papers: allPapers, screenshots };
  }

  /**
   * Close all scrapers
   */
  async closeAll(): Promise<void> {
    await Promise.all(this.scrapers.map(s => s.close()));
  }

  private chunkArray<T>(array: T[], chunkCount: number): T[][] {
    const chunks: T[][] = [];
    const chunkSize = Math.ceil(array.length / chunkCount);

    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }

    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
