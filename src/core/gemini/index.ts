/**
 * Gemini AI integration for PRISMA paper generation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Paper, PRISMAData } from '../types';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(config: GeminiConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.model });
  }

  /**
   * Generate PRISMA systematic review introduction
   */
  async generateIntroduction(
    papers: Paper[],
    searchKeywords: string[]
  ): Promise<string> {
    const prompt = `
You are an expert in writing systematic literature reviews following the PRISMA methodology.

Generate a comprehensive introduction section for a systematic literature review based on the following:

Search Keywords: ${searchKeywords.join(', ')}
Number of Papers: ${papers.length}
Year Range: ${this.getYearRange(papers)}

The introduction should:
1. Provide background on the topic
2. Explain the motivation for this systematic review
3. State the research questions
4. Describe the PRISMA methodology briefly
5. Outline the structure of the paper

Write in academic style, approximately 500-800 words.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate PRISMA methodology section
   */
  async generateMethodology(
    searchKeywords: string[],
    inclusionCriteria: string[],
    exclusionCriteria: string[],
    prismaData: PRISMAData
  ): Promise<string> {
    const prompt = `
Generate a methodology section for a PRISMA systematic literature review with the following details:

Search Strategy:
- Keywords: ${searchKeywords.join(', ')}
- Database: Google Scholar
- Inclusion criteria: ${inclusionCriteria.join(', ')}
- Exclusion criteria: ${exclusionCriteria.join(', ')}

PRISMA Flow:
- Records identified: ${prismaData.identification.recordsIdentified}
- Records removed: ${prismaData.identification.recordsRemoved}
- Records screened: ${prismaData.screening.recordsScreened}
- Records excluded: ${prismaData.screening.recordsExcluded}
- Studies included: ${prismaData.included.studiesIncluded}

The methodology section should:
1. Describe the search strategy in detail
2. Explain the inclusion and exclusion criteria
3. Describe the screening process
4. Reference the PRISMA flow diagram
5. Discuss quality assessment criteria

Write in academic style, approximately 600-1000 words.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate results section with paper analysis
   */
  async generateResults(papers: Paper[]): Promise<string> {
    const includedPapers = papers.filter(p => p.included);

    const prompt = `
Generate a results section for a systematic literature review analyzing ${includedPapers.length} papers.

Paper Statistics:
- Total papers: ${includedPapers.length}
- Year range: ${this.getYearRange(includedPapers)}
- Top venues: ${this.getTopVenues(includedPapers)}

Sample papers (titles):
${includedPapers.slice(0, 10).map(p => `- ${p.title} (${p.year})`).join('\n')}

The results section should:
1. Provide overview statistics
2. Analyze publication trends over time
3. Identify key venues and journals
4. Discuss common themes and topics
5. Present findings in a structured way

Write in academic style, approximately 800-1200 words.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate discussion section
   */
  async generateDiscussion(
    papers: Paper[],
    searchKeywords: string[]
  ): Promise<string> {
    const includedPapers = papers.filter(p => p.included);

    const prompt = `
Generate a discussion section for a systematic literature review on "${searchKeywords.join(', ')}".

Context:
- ${includedPapers.length} papers analyzed
- Research focus: ${searchKeywords.join(', ')}
- Year range: ${this.getYearRange(includedPapers)}

The discussion section should:
1. Synthesize key findings from the reviewed literature
2. Identify research gaps and opportunities
3. Discuss implications for theory and practice
4. Address limitations of the review
5. Suggest directions for future research

Write in academic style, approximately 700-1000 words.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate conclusion section
   */
  async generateConclusion(
    papers: Paper[],
    searchKeywords: string[]
  ): Promise<string> {
    const includedPapers = papers.filter(p => p.included);

    const prompt = `
Generate a conclusion section for a systematic literature review on "${searchKeywords.join(', ')}".

Summary:
- ${includedPapers.length} papers reviewed
- Research area: ${searchKeywords.join(', ')}

The conclusion should:
1. Summarize the main findings
2. Restate the contribution of this review
3. Highlight practical implications
4. Provide final thoughts on future directions

Write in academic style, approximately 300-500 words.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate abstract for the entire paper
   */
  async generateAbstract(
    papers: Paper[],
    searchKeywords: string[],
    prismaData: PRISMAData
  ): Promise<string> {
    const includedPapers = papers.filter(p => p.included);

    const prompt = `
Generate an abstract for a PRISMA systematic literature review with the following details:

Topic: ${searchKeywords.join(', ')}
Papers reviewed: ${includedPapers.length}
Initial records: ${prismaData.identification.recordsIdentified}
Final included: ${prismaData.included.studiesIncluded}

The abstract should:
1. State the purpose and scope
2. Describe the methodology (PRISMA)
3. Summarize key findings
4. Present implications
5. Be approximately 200-300 words

Write in academic style suitable for publication.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Classify papers into themes/categories
   */
  async classifyPapers(papers: Paper[]): Promise<Record<string, Paper[]>> {
    const includedPapers = papers.filter(p => p.included);

    if (includedPapers.length === 0) {
      return {};
    }

    const titles = includedPapers.slice(0, 50).map(p => p.title).join('\n');

    const prompt = `
Analyze these paper titles and identify 5-7 main research themes or categories.
Return ONLY a JSON array of theme names, nothing else.

Paper titles:
${titles}

Example response format:
["Theme 1", "Theme 2", "Theme 3"]
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      // Extract JSON from response
      const jsonMatch = text.match(/\[.*\]/s);
      if (!jsonMatch) {
        // Fallback themes
        return this.createDefaultThemes(includedPapers);
      }

      const themes: string[] = JSON.parse(jsonMatch[0]);

      // Classify each paper into themes (simplified version)
      const classified: Record<string, Paper[]> = {};
      themes.forEach(theme => {
        classified[theme] = [];
      });

      // Simple keyword-based classification
      for (const paper of includedPapers) {
        const text = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
        let assigned = false;

        for (const theme of themes) {
          const keywords = theme.toLowerCase().split(' ');
          if (keywords.some(kw => text.includes(kw))) {
            classified[theme].push(paper);
            assigned = true;
            break;
          }
        }

        // Assign to first theme if no match
        if (!assigned) {
          classified[themes[0]].push(paper);
        }
      }

      return classified;
    } catch (error) {
      console.error('Error classifying papers:', error);
      return this.createDefaultThemes(includedPapers);
    }
  }

  /**
   * Generate keywords for a paper based on title and abstract
   */
  async generateKeywords(title: string, abstract?: string): Promise<string[]> {
    const prompt = `
Extract 5-7 relevant keywords from this research paper.
Return ONLY a JSON array of keywords, nothing else.

Title: ${title}
Abstract: ${abstract || 'N/A'}

Example response format:
["keyword1", "keyword2", "keyword3"]
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      const jsonMatch = text.match(/\[.*\]/s);
      if (!jsonMatch) return [];

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error generating keywords:', error);
      return [];
    }
  }

  /**
   * Helper: Get year range from papers
   */
  private getYearRange(papers: Paper[]): string {
    if (papers.length === 0) return 'N/A';

    const years = papers.map(p => p.year).sort((a, b) => a - b);
    const minYear = years[0];
    const maxYear = years[years.length - 1];

    return `${minYear}-${maxYear}`;
  }

  /**
   * Helper: Get top venues from papers
   */
  private getTopVenues(papers: Paper[], limit: number = 5): string {
    const venueCounts: Record<string, number> = {};

    papers.forEach(p => {
      if (p.venue) {
        venueCounts[p.venue] = (venueCounts[p.venue] || 0) + 1;
      }
    });

    const topVenues = Object.entries(venueCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([venue]) => venue);

    return topVenues.join(', ') || 'N/A';
  }

  /**
   * Helper: Create default themes when AI classification fails
   */
  private createDefaultThemes(papers: Paper[]): Record<string, Paper[]> {
    return {
      'General': papers
    };
  }
}
