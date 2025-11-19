/**
 * Gemini AI integration for PRISMA paper generation
 * Now supports multiple API keys with automatic rotation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Paper, PRISMAData } from '../types';

export interface GeminiConfig {
  apiKey?: string; // Single API key (backward compatibility)
  apiKeys?: string[]; // Multiple API keys for rotation
  model: string;
}

export class GeminiService {
  private apiKeys: string[];
  private currentKeyIndex: number = 0;
  private modelName: string;

  constructor(config: GeminiConfig) {
    // Support both single key and multiple keys
    if (config.apiKeys && config.apiKeys.length > 0) {
      this.apiKeys = config.apiKeys;
    } else if (config.apiKey) {
      this.apiKeys = [config.apiKey];
    } else {
      throw new Error('At least one API key must be provided');
    }

    this.modelName = config.model;
    console.log(`[GeminiService] Initialized with ${this.apiKeys.length} API key(s) for model ${this.modelName}`);
  }

  /**
   * Clean and sanitize JSON string for robust parsing
   * Handles control characters, LaTeX escapes, and malformed JSON
   */
  private cleanJSONString(jsonStr: string): string {
    let inString = false;
    let result = '';
    let i = 0;
    let escaped = false;

    while (i < jsonStr.length) {
      const char = jsonStr[i];
      const nextChar = i < jsonStr.length - 1 ? jsonStr[i + 1] : '';

      // Handle escape sequences
      if (escaped) {
        // If previous char was backslash, this is part of an escape sequence
        // Just add it and continue
        result += char;
        escaped = false;
        i++;
        continue;
      }

      // Check for backslash (potential escape)
      if (char === '\\') {
        // Check if it's a valid JSON escape sequence
        if (nextChar === '"' || nextChar === '\\' || nextChar === '/' ||
            nextChar === 'b' || nextChar === 'f' || nextChar === 'n' ||
            nextChar === 'r' || nextChar === 't' || nextChar === 'u') {
          // Valid JSON escape - keep as is
          result += char;
          escaped = true;
          i++;
          continue;
        } else if (inString) {
          // Invalid escape inside a string (probably LaTeX) - escape the backslash
          result += '\\\\';
          i++;
          continue;
        } else {
          // Outside string - keep as is
          result += char;
          i++;
          continue;
        }
      }

      // Track if we're inside a string value
      if (char === '"') {
        inString = !inString;
        result += char;
        i++;
        continue;
      }

      // If we're in a string, handle special characters
      if (inString) {
        // Handle literal control characters in strings
        if (char === '\n') {
          result += '\\n';
          i++;
          continue;
        }
        if (char === '\r') {
          result += '\\r';
          i++;
          continue;
        }
        if (char === '\t') {
          result += '\\t';
          i++;
          continue;
        }
        // Remove other control characters (0x00-0x1F)
        const charCode = char.charCodeAt(0);
        if (charCode < 0x20 && charCode !== 0x09 && charCode !== 0x0A && charCode !== 0x0D) {
          // Skip control character
          i++;
          continue;
        }
      }

      // Default: keep character as is
      result += char;
      i++;
    }

    return result;
  }

  /**
   * Make a request with automatic key rotation on failures
   */
  private async requestWithRetry(prompt: string): Promise<string> {
    const maxAttemptsPerKey = 2;
    const maxTotalAttempts = this.apiKeys.length * maxAttemptsPerKey;
    let attempt = 0;

    while (attempt < maxTotalAttempts) {
      const currentKey = this.apiKeys[this.currentKeyIndex];

      try {
        const genAI = new GoogleGenerativeAI(currentKey);
        const model = genAI.getGenerativeModel({ model: this.modelName });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (error) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        console.error(`[GeminiService] Request failed with key ${this.currentKeyIndex + 1}/${this.apiKeys.length} (attempt ${attempt}/${maxTotalAttempts}): ${errorMessage.substring(0, 100)}`);

        // Check if it's a quota/rate limit error
        const isQuotaError = errorMessage.toLowerCase().includes('quota') ||
                            errorMessage.toLowerCase().includes('rate limit') ||
                            errorMessage.toLowerCase().includes('429');

        if (isQuotaError && this.apiKeys.length > 1) {
          // Rotate to next key
          this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
          console.log(`[GeminiService] Rotating to key ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);

          // Wait a bit before retrying
          await this.delay(2000);
          continue;
        }

        // For other errors or last attempt, throw
        if (attempt >= maxTotalAttempts) {
          throw new Error(`Gemini request failed after ${maxTotalAttempts} attempts: ${errorMessage}`);
        }

        // Wait before retry
        await this.delay(3000);
      }
    }

    throw new Error('Gemini request failed: max attempts exceeded');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate PRISMA systematic review introduction
   */
  async generateIntroduction(
    papers: Paper[],
    searchKeywords: string[]
  ): Promise<string> {
    const includedPapers = papers.filter(p => p.included);
    const paperList = this.formatPapersWithCitations(includedPapers.slice(0, 20));

    const prompt = `
You are an expert in writing systematic literature reviews following the PRISMA methodology.

Generate a comprehensive introduction section for a systematic literature review based on the following:

Search Keywords: ${searchKeywords.join(', ')}
Number of Papers: ${papers.length}
Year Range: ${this.getYearRange(papers)}

Sample of reviewed papers (use these citation keys when citing):
${paperList}

The introduction should:
1. Provide background on the topic
2. Explain the motivation for this systematic review
3. State the research questions
4. Describe the PRISMA methodology briefly
5. Outline the structure of the paper
6. IMPORTANT: When citing papers, use LaTeX citation format \\cite{citationKey} using the citation keys provided above

Write in academic style, approximately 500-800 words.
Return the text in LaTeX format, with proper citations using \\cite{} commands.
`;

    return await this.requestWithRetry(prompt);
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
- Records identified: ${prismaData.identification.totalRecordsIdentified}
- Records removed: ${prismaData.identification.totalRecordsRemoved}
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
Return the text in LaTeX format.
`;

    return await this.requestWithRetry(prompt);
  }

  /**
   * Generate results section with paper analysis
   */
  async generateResults(papers: Paper[]): Promise<string> {
    const includedPapers = papers.filter(p => p.included);
    const paperList = this.formatPapersWithCitations(includedPapers.slice(0, 30));

    const prompt = `
Generate a results section for a systematic literature review analyzing ${includedPapers.length} papers.

Paper Statistics:
- Total papers: ${includedPapers.length}
- Year range: ${this.getYearRange(includedPapers)}
- Top venues: ${this.getTopVenues(includedPapers)}

Sample papers with citation keys (cite these papers in your discussion):
${paperList}

The results section should:
1. Provide overview statistics
2. Analyze publication trends over time
3. Identify key venues and journals
4. Discuss common themes and topics
5. Present findings in a structured way
6. IMPORTANT: Cite specific papers using \\cite{citationKey} format to support your findings

Write in academic style, approximately 800-1200 words.
Return the text in LaTeX format, with proper citations using \\cite{} commands.
`;

    return await this.requestWithRetry(prompt);
  }

  /**
   * Generate discussion section
   */
  async generateDiscussion(
    papers: Paper[],
    searchKeywords: string[]
  ): Promise<string> {
    const includedPapers = papers.filter(p => p.included);
    const paperList = this.formatPapersWithCitations(includedPapers.slice(0, 30));

    const prompt = `
Generate a discussion section for a systematic literature review on "${searchKeywords.join(', ')}".

Context:
- ${includedPapers.length} papers analyzed
- Research focus: ${searchKeywords.join(', ')}
- Year range: ${this.getYearRange(includedPapers)}

Sample papers with citation keys (cite these papers in your discussion):
${paperList}

The discussion section should:
1. Synthesize key findings from the reviewed literature
2. Identify research gaps and opportunities
3. Discuss implications for theory and practice
4. Address limitations of the review
5. Suggest directions for future research
6. IMPORTANT: Support your discussion with citations using \\cite{citationKey} format

Write in academic style, approximately 700-1000 words.
Return the text in LaTeX format, with proper citations using \\cite{} commands.
`;

    return await this.requestWithRetry(prompt);
  }

  /**
   * Generate conclusion section
   */
  async generateConclusion(
    papers: Paper[],
    searchKeywords: string[]
  ): Promise<string> {
    const includedPapers = papers.filter(p => p.included);
    const paperList = this.formatPapersWithCitations(includedPapers.slice(0, 20));

    const prompt = `
Generate a conclusion section for a systematic literature review on "${searchKeywords.join(', ')}".

Summary:
- ${includedPapers.length} papers reviewed
- Research area: ${searchKeywords.join(', ')}

Sample papers with citation keys:
${paperList}

The conclusion should:
1. Summarize the main findings
2. Restate the contribution of this review
3. Highlight practical implications
4. Provide final thoughts on future directions
5. IMPORTANT: Use \\cite{citationKey} format when referencing papers

Write in academic style, approximately 300-500 words.
Return the text in LaTeX format, with proper citations using \\cite{} commands.
`;

    return await this.requestWithRetry(prompt);
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
Initial records: ${prismaData.identification.totalRecordsIdentified}
Final included: ${prismaData.included.studiesIncluded}

The abstract should:
1. State the purpose and scope
2. Describe the methodology (PRISMA)
3. Summarize key findings
4. Present implications
5. Be approximately 200-300 words

Write in academic style suitable for publication.
Return the text in plain format (citations not needed in abstract).
`;

    return await this.requestWithRetry(prompt);
  }

  /**
   * Generate complete PRISMA paper draft from scratch with a batch of papers
   * This creates the initial draft with the first batch
   */
  async generateFullPaperDraft(
    papers: Paper[],
    searchKeywords: string[],
    inclusionCriteria: string[],
    exclusionCriteria: string[],
    prismaData: PRISMAData,
    latexGenerationPrompt?: string
  ): Promise<{
    abstract: string;
    introduction: string;
    methodology: string;
    results: string;
    discussion: string;
    conclusion: string;
  }> {
    const includedPapers = papers.filter(p => p.included);
    const bibtexEntries = this.formatPapersAsBibTeX(includedPapers);

    console.log(`[GeminiService] generateFullPaperDraft - Processing ${includedPapers.length} included papers`);
    console.log(`[GeminiService] BibTeX entries length: ${bibtexEntries.length} characters`);
    console.log(`[GeminiService] First 500 chars of BibTeX entries:\n${bibtexEntries.substring(0, 500)}...`);

    const prompt = `
You are an expert in writing PRISMA systematic literature reviews for academic publication.

CRITICAL REQUIREMENT: You MUST cite papers using LaTeX \\cite{} commands throughout the paper. Every claim, finding, or reference to a paper MUST include a citation.

=== BIBTEX ENTRIES (USE THESE CITATION KEYS) ===
${bibtexEntries}

=== END BIBTEX ENTRIES ===

SEARCH PARAMETERS:
- Keywords: ${searchKeywords.join(', ')}
- Inclusion criteria: ${inclusionCriteria.join(', ')}
- Exclusion criteria: ${exclusionCriteria.join(', ')}

PRISMA STATISTICS:
- Records identified: ${prismaData.identification.totalRecordsIdentified}
- Records removed: ${prismaData.identification.totalRecordsRemoved}
- Records screened: ${prismaData.screening.recordsScreened}
- Records excluded: ${prismaData.screening.recordsExcluded}
- Studies included: ${prismaData.included.studiesIncluded}

CITATION EXAMPLES (YOU MUST FOLLOW THIS FORMAT):
- Single citation: "Recent advances in transformer architectures \\cite{vaswani2017attention} have enabled..."
- Multiple citations: "Several studies \\cite{brown2020language,radford2019language,devlin2018bert} have demonstrated..."
- Citation in parentheses: "Deep learning has shown promise (see \\cite{lecun2015deep} for a review)."

Generate a COMPLETE systematic literature review with these sections:

1. ABSTRACT (200-300 words)
   - State purpose, methodology, key findings, implications
   - Citations NOT needed in abstract (abstract should be citation-free)

2. INTRODUCTION (500-800 words)
   - Background on the topic - CITE foundational papers
   - Motivation for this review - CITE relevant work
   - Research questions
   - Brief PRISMA overview
   - Paper structure
   - MINIMUM 5-10 citations using \\cite{citationKey}

3. METHODOLOGY (600-1000 words)
   - Detailed search strategy
   - Inclusion and exclusion criteria
   - Screening process
   - Quality assessment
   - Reference PRISMA flow
   - Citations only if referring to PRISMA guidelines or methodological papers

4. RESULTS (800-1200 words)
   - Overview statistics
   - Publication trends over time
   - Key venues/journals
   - Create thematic subsections using \\subsection{Theme Name}
   - CITE papers extensively in each subsection
   - Every paper discussed MUST be cited with \\cite{}
   - MINIMUM 15-20 citations throughout Results section

5. DISCUSSION (700-1000 words)
   - Synthesize findings - CITE supporting papers
   - Identify research gaps - CITE papers that highlight gaps
   - Implications - CITE relevant work
   - Limitations
   - Future directions - CITE papers suggesting future work
   - MINIMUM 10-15 citations

6. CONCLUSION (300-500 words)
   - Summarize main findings - CITE key papers
   - Contribution of this review
   - Practical implications - CITE relevant applications
   - Final thoughts
   - MINIMUM 3-5 citations of most important papers

MANDATORY REQUIREMENTS:
✓ Every section (except abstract) MUST contain \\cite{} commands
✓ Use ONLY the citation keys from the BibTeX entries above
✓ Format: \\cite{citationkey} NOT cite{} or [citationkey]
✓ Return LaTeX-formatted text with proper citation commands
✓ Results section MUST have subsections organized by theme
✓ Each claim about a paper MUST have a citation
${latexGenerationPrompt ? `\nADDITIONAL INSTRUCTIONS:\n${latexGenerationPrompt}\n` : ''}
CRITICAL: Return your response as VALID JSON with PROPER ESCAPING:

IMPORTANT JSON ESCAPING RULES:
- Every single backslash in LaTeX commands MUST be escaped as double backslash
- \\cite{} becomes \\\\cite{} in JSON
- \\section{} becomes \\\\section{} in JSON
- \\subsection{} becomes \\\\subsection{} in JSON
- Example: "text": "Recent work \\\\cite{smith2020} shows..."

Return ONLY valid JSON in this EXACT format:
{
  "abstract": "text with no citations",
  "introduction": "text with \\\\cite{citationkey} commands properly escaped",
  "methodology": "text with \\\\cite{} commands properly escaped if needed",
  "results": "text with \\\\subsection{} and \\\\cite{} commands properly escaped",
  "discussion": "text with \\\\cite{} commands properly escaped",
  "conclusion": "text with \\\\cite{} commands properly escaped"
}

VERIFY: Before returning, check that ALL backslashes are doubled (\\\\) in the JSON!
`;

    console.log(`[GeminiService] generateFullPaperDraft - Full prompt length: ${prompt.length} characters`);
    console.log(`[GeminiService] Sending prompt to Gemini...`);

    // Write prompt to file for debugging
    try {
      const fs = require('fs');
      const debugPath = './data/outputs/debug_initial_prompt.txt';
      fs.mkdirSync('./data/outputs', { recursive: true });
      fs.writeFileSync(debugPath, prompt, 'utf-8');
      console.log(`[GeminiService] Debug: Initial prompt written to ${debugPath}`);
    } catch (err) {
      console.error(`[GeminiService] Failed to write debug prompt:`, err);
    }

    const text = (await this.requestWithRetry(prompt)).trim();

    console.log(`[GeminiService] Received response, length: ${text.length} characters`);

    // Save response for debugging
    try {
      const fs = require('fs');
      const debugPath = './data/outputs/debug_initial_response.txt';
      fs.writeFileSync(debugPath, text, 'utf-8');
      console.log(`[GeminiService] Debug: Response written to ${debugPath}`);
    } catch (err) {
      console.error(`[GeminiService] Failed to write debug response:`, err);
    }

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[GeminiService] No JSON found in response. First 500 chars:\n${text.substring(0, 500)}`);
      throw new Error('Failed to find JSON in paper draft response');
    }

    let jsonStr = jsonMatch[0];

    // Try to parse JSON, if it fails due to escaping issues, try to fix them
    try {
      return JSON.parse(jsonStr);
    } catch (parseError: any) {
      console.error(`[GeminiService] JSON parse error: ${parseError.message}`);
      console.error(`[GeminiService] Attempting to fix escaping issues...`);

      // Save original problematic JSON for debugging
      try {
        const fs = require('fs');
        const debugPath = './data/outputs/debug_failed_json_original.txt';
        fs.writeFileSync(debugPath, jsonStr, 'utf-8');
        console.log(`[GeminiService] Debug: Original failed JSON written to ${debugPath}`);
      } catch (err) {
        // Ignore
      }

      // Use robust JSON cleaner to fix escaping and control characters
      try {
        const cleaned = this.cleanJSONString(jsonStr);

        console.log(`[GeminiService] Attempting to parse cleaned JSON...`);

        // Save cleaned JSON for debugging
        try {
          const fs = require('fs');
          const debugPath = './data/outputs/debug_cleaned_json.txt';
          fs.writeFileSync(debugPath, cleaned, 'utf-8');
          console.log(`[GeminiService] Debug: Cleaned JSON written to ${debugPath}`);
        } catch (err) {
          // Ignore
        }

        const parsed = JSON.parse(cleaned);
        console.log(`[GeminiService] Successfully parsed after cleaning!`);
        return parsed;
      } catch (fixError: any) {
        console.error(`[GeminiService] Failed to fix JSON: ${fixError.message}`);
        throw new Error(`JSON parsing failed: ${parseError.message}. Auto-fix also failed: ${fixError.message}. Check debug files for details.`);
      }
    }
  }

  /**
   * Regenerate paper with additional papers, integrating them into existing content
   * Takes previous draft and new papers, returns updated draft
   */
  async regeneratePaperWithNewPapers(
    previousDraft: {
      abstract: string;
      introduction: string;
      methodology: string;
      results: string;
      discussion: string;
      conclusion: string;
    },
    newPapers: Paper[],
    allPapers: Paper[],
    searchKeywords: string[],
    prismaData: PRISMAData,
    latexGenerationPrompt?: string
  ): Promise<{
    abstract: string;
    introduction: string;
    methodology: string;
    results: string;
    discussion: string;
    conclusion: string;
  }> {
    const allIncluded = allPapers.filter(p => p.included);
    const newBibtexEntries = this.formatPapersAsBibTeX(newPapers.filter(p => p.included));
    const allBibtexEntries = this.formatPapersAsBibTeX(allIncluded);

    console.log(`[GeminiService] regeneratePaperWithNewPapers - Total papers: ${allIncluded.length}, New papers: ${newPapers.filter(p => p.included).length}`);
    console.log(`[GeminiService] All BibTeX entries length: ${allBibtexEntries.length} characters`);
    console.log(`[GeminiService] New BibTeX entries length: ${newBibtexEntries.length} characters`);
    console.log(`[GeminiService] Previous draft abstract length: ${previousDraft.abstract.length} characters`);
    console.log(`[GeminiService] Previous draft introduction length: ${previousDraft.introduction.length} characters`);
    console.log(`[GeminiService] Previous draft results length: ${previousDraft.results.length} characters`);

    const prompt = `
You are an expert in writing PRISMA systematic literature reviews for academic publication.

CRITICAL REQUIREMENT: You MUST cite ALL papers (existing AND new) using LaTeX \\cite{} commands throughout the regenerated paper.

=== ALL BIBTEX ENTRIES (INCLUDING NEW PAPERS) ===
${allBibtexEntries}

=== END BIBTEX ENTRIES ===

=== NEW PAPERS BEING ADDED THIS ITERATION ===
${newBibtexEntries}

=== END NEW PAPERS ===

PREVIOUS DRAFT OF THE PAPER:
=== ABSTRACT ===
${previousDraft.abstract}

=== INTRODUCTION ===
${previousDraft.introduction}

=== METHODOLOGY ===
${previousDraft.methodology}

=== RESULTS ===
${previousDraft.results}

=== DISCUSSION ===
${previousDraft.discussion}

=== CONCLUSION ===
${previousDraft.conclusion}

=== END PREVIOUS DRAFT ===

UPDATED STATISTICS:
- Total papers now included: ${allIncluded.length}
- Records identified: ${prismaData.identification.totalRecordsIdentified}
- Studies included: ${prismaData.included.studiesIncluded}

TASK: COMPLETELY REGENERATE the paper integrating the new papers.

REGENERATION INSTRUCTIONS:
1. Read the previous draft to understand existing structure and themes
2. Review the NEW papers being added (listed in "NEW PAPERS BEING ADDED" section)
3. Integrate new papers throughout ALL sections where relevant
4. In Results section:
   - Add new subsections if new themes emerge from new papers
   - Reorganize existing subsections for better coherence
   - CITE every paper discussed using \\cite{citationKey}
5. Update all statistics to reflect new paper count
6. Maintain academic quality and narrative flow
7. Ensure EVERY paper (old and new) is cited using \\cite{citationKey}

CITATION REQUIREMENTS:
✓ Use \\cite{citationKey} format (e.g., \\cite{smith2020deep})
✓ Cite papers from BOTH previous draft AND new additions
✓ Introduction: MINIMUM 5-10 citations
✓ Results: MINIMUM 15-25 citations (more with larger paper count)
✓ Discussion: MINIMUM 10-15 citations
✓ Conclusion: MINIMUM 3-5 citations
✓ Each subsection in Results MUST cite papers relevant to that theme

REGENERATE COMPLETE PAPER:
1. ABSTRACT: Update with new paper count, refined findings (NO citations)
2. INTRODUCTION: Integrate relevant new papers, update scope, CITE extensively
3. METHODOLOGY: Update statistics (cite PRISMA guidelines if needed)
4. RESULTS: **CRITICAL** - Reorganize with new papers, cite ALL papers discussed
5. DISCUSSION: Integrate new findings, synthesize across all papers, CITE extensively
6. CONCLUSION: Update with insights from complete set, CITE key papers
${latexGenerationPrompt ? `\nADDITIONAL INSTRUCTIONS:\n${latexGenerationPrompt}\n` : ''}
CRITICAL: Return your response as VALID JSON with PROPER ESCAPING:

IMPORTANT JSON ESCAPING RULES:
- Every single backslash in LaTeX commands MUST be escaped as double backslash
- \\cite{} becomes \\\\cite{} in JSON
- \\subsection{} becomes \\\\subsection{} in JSON
- Example: "introduction": "Recent work \\\\cite{smith2020} shows..."

Return ONLY valid JSON in this EXACT format:
{
  "abstract": "...",
  "introduction": "text with \\\\cite{} properly escaped",
  "methodology": "...",
  "results": "text with \\\\subsection{} and \\\\cite{} properly escaped",
  "discussion": "text with \\\\cite{} properly escaped",
  "conclusion": "text with \\\\cite{} properly escaped"
}

VERIFY: Check that ALL backslashes are doubled (\\\\) in JSON before returning!
`;

    console.log(`[GeminiService] regeneratePaperWithNewPapers - Full prompt length: ${prompt.length} characters`);
    console.log(`[GeminiService] Sending regeneration prompt to Gemini...`);

    // Write prompt to file for debugging
    try {
      const fs = require('fs');
      const debugPath = `./data/outputs/debug_regeneration_prompt_${Date.now()}.txt`;
      fs.mkdirSync('./data/outputs', { recursive: true });
      fs.writeFileSync(debugPath, prompt, 'utf-8');
      console.log(`[GeminiService] Debug: Regeneration prompt written to ${debugPath}`);
    } catch (err) {
      console.error(`[GeminiService] Failed to write debug prompt:`, err);
    }

    const text = (await this.requestWithRetry(prompt)).trim();

    console.log(`[GeminiService] Received regeneration response, length: ${text.length} characters`);

    // Save response for debugging
    try {
      const fs = require('fs');
      const debugPath = `./data/outputs/debug_regeneration_response_${Date.now()}.txt`;
      fs.writeFileSync(debugPath, text, 'utf-8');
      console.log(`[GeminiService] Debug: Regeneration response written to ${debugPath}`);
    } catch (err) {
      console.error(`[GeminiService] Failed to write debug response:`, err);
    }

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[GeminiService] No JSON found in regeneration response. First 500 chars:\n${text.substring(0, 500)}`);
      throw new Error('Failed to find JSON in regenerated paper response');
    }

    let jsonStr = jsonMatch[0];

    // Try to parse JSON, if it fails due to escaping issues, try to fix them
    try {
      return JSON.parse(jsonStr);
    } catch (parseError: any) {
      console.error(`[GeminiService] Regeneration JSON parse error: ${parseError.message}`);
      console.error(`[GeminiService] Attempting to fix escaping issues...`);

      // Save problematic JSON for debugging
      try {
        const fs = require('fs');
        const debugPath = `./data/outputs/debug_failed_regeneration_json_${Date.now()}.txt`;
        fs.writeFileSync(debugPath, jsonStr, 'utf-8');
        console.log(`[GeminiService] Debug: Failed regeneration JSON written to ${debugPath}`);
      } catch (err) {
        // Ignore
      }

      // Use robust JSON cleaner to fix escaping and control characters
      try {
        const cleaned = this.cleanJSONString(jsonStr);

        console.log(`[GeminiService] Attempting to parse cleaned regeneration JSON...`);

        // Save cleaned JSON for debugging
        try {
          const fs = require('fs');
          const debugPath = `./data/outputs/debug_cleaned_regeneration_json_${Date.now()}.txt`;
          fs.writeFileSync(debugPath, cleaned, 'utf-8');
          console.log(`[GeminiService] Debug: Cleaned regeneration JSON written to ${debugPath}`);
        } catch (err) {
          // Ignore
        }

        const parsed = JSON.parse(cleaned);
        console.log(`[GeminiService] Successfully parsed regeneration JSON after cleaning!`);
        return parsed;
      } catch (fixError: any) {
        console.error(`[GeminiService] Failed to fix regeneration JSON: ${fixError.message}`);
        throw new Error(`Regeneration JSON parsing failed: ${parseError.message}. Auto-fix also failed: ${fixError.message}. Check debug files for details.`);
      }
    }
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
      const text = (await this.requestWithRetry(prompt)).trim();

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
      const text = (await this.requestWithRetry(prompt)).trim();

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

  /**
   * Helper: Generate citation key for a paper (matching BibTeX generator)
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
   * Helper: Format papers with citation keys for prompts
   */
  private formatPapersWithCitations(papers: Paper[]): string {
    return papers.map(p => {
      const citationKey = this.generateCitationKey(p);
      const authors = p.authors.slice(0, 2).join(', ') + (p.authors.length > 2 ? ' et al.' : '');
      return `[${citationKey}] ${authors} (${p.year}). ${p.title}`;
    }).join('\n');
  }

  /**
   * Helper: Format papers with full details including abstracts
   */
  private formatPapersWithFullDetails(papers: Paper[]): string {
    return papers.map((p, index) => {
      const citationKey = this.generateCitationKey(p);
      const authors = p.authors.join(', ');
      const venue = p.venue || 'N/A';
      const abstract = p.abstract || 'No abstract available';

      return `
Paper ${index + 1}:
Citation Key: ${citationKey}
Title: ${p.title}
Authors: ${authors}
Year: ${p.year}
Venue: ${venue}
Abstract: ${abstract}
${p.doi ? `DOI: ${p.doi}` : ''}
${p.url ? `URL: ${p.url}` : ''}
---`;
    }).join('\n');
  }

  /**
   * Helper: Generate BibTeX entry for a paper (for inclusion in prompts)
   */
  private paperToBibTeX(paper: Paper): string {
    const citationKey = this.generateCitationKey(paper);
    const fields: string[] = [];

    // Title
    fields.push(`  title={${paper.title}}`);

    // Authors
    if (paper.authors.length > 0) {
      const authors = paper.authors.join(' and ');
      fields.push(`  author={${authors}}`);
    }

    // Year
    fields.push(`  year={${paper.year}}`);

    // Venue/Journal
    if (paper.venue) {
      const isJournal = paper.venue.toLowerCase().includes('journal') ||
                       paper.venue.toLowerCase().includes('transactions');
      if (isJournal) {
        fields.push(`  journal={${paper.venue}}`);
      } else {
        fields.push(`  booktitle={${paper.venue}}`);
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

    // Abstract (include for context)
    if (paper.abstract) {
      fields.push(`  abstract={${paper.abstract}}`);
    }

    // Determine entry type
    const entryType = paper.venue ? 'article' : 'misc';

    return `@${entryType}{${citationKey},\n${fields.join(',\n')}\n}`;
  }

  /**
   * Helper: Format papers as BibTeX entries for prompts
   */
  private formatPapersAsBibTeX(papers: Paper[]): string {
    return papers.map(p => this.paperToBibTeX(p)).join('\n\n');
  }
}
