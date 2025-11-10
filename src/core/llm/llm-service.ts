/**
 * LLM Service - Main service for managing LLM providers and batch processing
 */

import { LLMConfig, LLMRequest, LLMResponse, LLMTaskType, Paper } from '../types';
import { LLMProvider } from './base-provider';
import { GeminiProvider } from './gemini-provider';

export class LLMService {
  private provider?: LLMProvider;
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    // Default configuration with Gemini as default provider
    this.config = {
      enabled: config?.enabled ?? true,
      provider: config?.provider || 'gemini',
      model: config?.model,
      apiKey: config?.apiKey,
      batchSize: config?.batchSize || 10,
      maxConcurrentBatches: config?.maxConcurrentBatches || 3,
      timeout: config?.timeout || 30000,
      retryAttempts: config?.retryAttempts || 3,
      temperature: config?.temperature || 0.3
    };
  }

  /**
   * Initialize the LLM service with the configured provider
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (!this.config.apiKey) {
      throw new Error('LLM API key is required when LLM is enabled');
    }

    // Create provider based on configuration
    switch (this.config.provider) {
      case 'gemini':
        this.provider = new GeminiProvider();
        break;
      case 'openai':
        throw new Error('OpenAI provider not yet implemented');
      case 'anthropic':
        throw new Error('Anthropic provider not yet implemented');
      default:
        throw new Error(`Unknown LLM provider: ${this.config.provider}`);
    }

    await this.provider.initialize(this.config.apiKey, { model: this.config.model });
  }

  /**
   * Check if LLM is enabled and available
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.provider && this.provider.isAvailable();
  }

  /**
   * Filter papers using semantic understanding (LLM-based)
   * Returns papers with inclusion decisions and reasoning
   */
  async semanticFilter(
    papers: Paper[],
    inclusionCriteria: string[],
    exclusionCriteria: string[]
  ): Promise<Paper[]> {
    if (!this.isEnabled()) {
      throw new Error('LLM service is not enabled or initialized');
    }

    // Create batch requests for filtering
    const requests: LLMRequest[] = papers.map(paper => ({
      id: paper.id,
      taskType: 'semantic_filtering',
      prompt: this.buildFilteringPrompt(paper, inclusionCriteria, exclusionCriteria),
      context: { paper }
    }));

    // Process in batches
    const responses = await this.processBatchRequests(requests);

    // Update papers with LLM decisions
    return papers.map(paper => {
      const response = responses.find(r => r.id === paper.id);

      if (!response || response.error) {
        // If LLM fails, keep the paper but mark it as uncertain
        return {
          ...paper,
          llmConfidence: 0,
          llmReasoning: response?.error || 'LLM processing failed'
        };
      }

      const decision = response.result?.decision === 'include';
      return {
        ...paper,
        included: decision,
        exclusionReason: decision ? undefined : response.result?.reasoning,
        llmConfidence: response.confidence || 0.5,
        llmReasoning: response.result?.reasoning
      };
    });
  }

  /**
   * Identify categories for papers using LLM
   */
  async identifyCategories(papers: Paper[]): Promise<Paper[]> {
    if (!this.isEnabled()) {
      throw new Error('LLM service is not enabled or initialized');
    }

    const requests: LLMRequest[] = papers.map(paper => ({
      id: paper.id,
      taskType: 'category_identification',
      prompt: this.buildCategoryPrompt(paper),
      context: { paper }
    }));

    const responses = await this.processBatchRequests(requests);

    return papers.map(paper => {
      const response = responses.find(r => r.id === paper.id);

      if (!response || response.error) {
        return paper;
      }

      return {
        ...paper,
        category: response.result?.category,
        llmConfidence: response.confidence
      };
    });
  }

  /**
   * Generate a draft literature review paper using LLM
   */
  async generateDraftPaper(
    papers: Paper[],
    topic: string,
    inclusionCriteria: string[]
  ): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('LLM service is not enabled or initialized');
    }

    const prompt = this.buildDraftPaperPrompt(papers, topic, inclusionCriteria);
    const request: LLMRequest = {
      id: 'draft-paper',
      taskType: 'draft_generation',
      prompt,
      context: { papers, topic }
    };

    const responses = await this.processBatchRequests([request]);
    const response = responses[0];

    if (response.error) {
      throw new Error(`Failed to generate draft paper: ${response.error}`);
    }

    return response.result?.draft || response.result?.text || '';
  }

  /**
   * Process batch requests with concurrent batch handling
   */
  private async processBatchRequests(requests: LLMRequest[]): Promise<LLMResponse[]> {
    if (!this.provider) {
      throw new Error('LLM provider not initialized');
    }

    const allResponses: LLMResponse[] = [];
    const batchSize = this.config.batchSize;
    const maxConcurrent = this.config.maxConcurrentBatches;

    // Split into batches
    const batches: LLMRequest[][] = [];
    for (let i = 0; i < requests.length; i += batchSize) {
      batches.push(requests.slice(i, i + batchSize));
    }

    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const concurrentBatches = batches.slice(i, i + maxConcurrent);

      const batchPromises = concurrentBatches.map(batch =>
        this.provider!.batchRequest(batch, this.config.temperature)
      );

      const batchResults = await Promise.all(batchPromises);
      allResponses.push(...batchResults.flat());
    }

    return allResponses;
  }

  /**
   * Build filtering prompt for a paper
   */
  private buildFilteringPrompt(
    paper: Paper,
    inclusionCriteria: string[],
    exclusionCriteria: string[]
  ): string {
    return `You are a research assistant helping with a systematic literature review.

**Inclusion Criteria:**
${inclusionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Exclusion Criteria:**
${exclusionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Paper to Review:**
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Year: ${paper.year}
Abstract: ${paper.abstract || 'No abstract available'}

**Task:**
Determine if this paper should be INCLUDED or EXCLUDED based on the criteria above.

**Response Format:**
Provide your response as JSON:
{
  "decision": "include" or "exclude",
  "reasoning": "Brief explanation of your decision",
  "confidence": 0.0 to 1.0
}`;
  }

  /**
   * Build category identification prompt
   */
  private buildCategoryPrompt(paper: Paper): string {
    return `Analyze the following research paper and identify its primary category/research area.

**Paper:**
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Year: ${paper.year}
Abstract: ${paper.abstract || 'No abstract available'}

**Task:**
Identify the primary research category or area this paper belongs to. Be specific but concise.

**Response Format:**
Provide your response as JSON:
{
  "category": "The primary category name",
  "confidence": 0.0 to 1.0
}`;
  }

  /**
   * Build draft paper generation prompt
   */
  private buildDraftPaperPrompt(
    papers: Paper[],
    topic: string,
    inclusionCriteria: string[]
  ): string {
    // Group papers by year
    const papersByYear = papers.reduce((acc, paper) => {
      const year = paper.year;
      if (!acc[year]) acc[year] = [];
      acc[year].push(paper);
      return acc;
    }, {} as Record<number, Paper[]>);

    const paperSummaries = Object.entries(papersByYear)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .map(([year, yearPapers]) => {
        const summaries = yearPapers
          .slice(0, 20) // Limit to avoid token limits
          .map(p => `- ${p.title} (${p.authors[0]} et al., ${p.year})`)
          .join('\n');
        return `**${year}:**\n${summaries}`;
      })
      .join('\n\n');

    return `You are an academic writer creating a systematic literature review.

**Topic:** ${topic}

**Inclusion Criteria:**
${inclusionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Total Papers Reviewed:** ${papers.length}

**Selected Papers by Year:**
${paperSummaries}

**Task:**
Write a comprehensive literature review draft (2-3 pages) that:
1. Introduces the research topic and its importance
2. Synthesizes the key findings from the reviewed papers
3. Identifies trends and patterns in the literature over time
4. Highlights research gaps and future directions
5. Concludes with key takeaways

Use an academic tone with proper citations (Author et al., Year format).`;
  }

  /**
   * Get usage statistics from the provider
   */
  getUsageStats() {
    return this.provider?.getUsageStats() || null;
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }
}
