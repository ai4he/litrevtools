# Implementation Guide: LLM vs Rule-Based Filtering

## Overview

This guide provides step-by-step instructions for implementing dual filtering modes (LLM and rule-based) in the LitRevTools codebase.

---

## Phase 1: Type System Updates

### Step 1.1: Update SearchParameters

**File**: `src/core/types/index.ts`

Add after line 13 (after maxResults field):

```typescript
export type FilteringMode = 'rule-based' | 'llm-based' | 'hybrid';

export interface RuleBasedFilterConfig {
  keywordMatching: 'substring' | 'fuzzy' | 'regex';
  caseSensitive: boolean;
  minSimilarity?: number; // 0-1 for fuzzy matching
}

export interface LLMFilterConfig {
  provider: 'gemini' | 'openai' | 'custom';
  model: string;
  systemPrompt?: string;
  temperature?: number; // 0-2, default 1.0
  relevanceThreshold: number; // 0-1
  batchSize: number; // how many papers to process together
  cacheEnabled?: boolean;
  timeoutMs?: number; // per batch timeout
}

export interface FilteringStrategy {
  mode: FilteringMode;
  ruleBasedConfig?: RuleBasedFilterConfig;
  llmConfig?: LLMFilterConfig;
}

export interface SearchParameters {
  name?: string;
  inclusionKeywords: string[];
  exclusionKeywords: string[];
  maxResults?: number;
  startYear?: number;
  endYear?: number;
  // NEW FIELDS:
  filteringMode?: FilteringMode; // default: 'rule-based'
  filteringStrategy?: Partial<FilteringStrategy>;
}
```

### Step 1.2: Update Paper Interface

**File**: `src/core/types/index.ts`

Add after line 31 (in Paper interface):

```typescript
export interface Paper {
  // ... existing fields ...
  included: boolean;
  exclusionReason?: string;
  // NEW FIELDS:
  filteringMode?: FilteringMode; // which method was used
  filteringConfidence?: number; // 0-1, only for LLM-based
  filteringProcessingTime?: number; // milliseconds
}
```

### Step 1.3: Add Filtering Result Types

**File**: `src/core/types/index.ts`

Add at the end of the file (before the callback types):

```typescript
export interface FilteringResult {
  included: boolean;
  reason: string;
  confidence?: number; // 0-1 for LLM
  processingTime: number; // milliseconds
}

export interface FilteringStats {
  totalProcessed: number;
  totalIncluded: number;
  totalExcluded: number;
  averageProcessingTime: number;
  averageConfidence?: number;
  reasonsForExclusion: Record<string, number>;
}
```

---

## Phase 2: Create Filtering Service Abstraction

### Step 2.1: Create Filtering Module Structure

```bash
mkdir -p src/core/filtering
touch src/core/filtering/index.ts
touch src/core/filtering/types.ts
touch src/core/filtering/rule-based-filter.ts
touch src/core/filtering/llm-filter.ts
touch src/core/filtering/hybrid-filter.ts
```

### Step 2.2: Filtering Types

**File**: `src/core/filtering/types.ts`

```typescript
import { Paper, FilteringResult, FilteringStrategy } from '../types';

export interface IFilteringService {
  initialize(): Promise<void>;
  
  filterPaper(
    paper: Paper,
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult>;
  
  filterBatch(
    papers: Paper[],
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult[]>;
  
  getStats(): FilteringStats;
}

export interface FilteringStats {
  totalProcessed: number;
  totalIncluded: number;
  totalExcluded: number;
  averageProcessingTime: number;
  reasonsForExclusion: Record<string, number>;
}
```

### Step 2.3: Rule-Based Filter Implementation

**File**: `src/core/filtering/rule-based-filter.ts`

```typescript
import { Paper, RuleBasedFilterConfig } from '../types';
import { IFilteringService, FilteringStats } from './types';
import { FilteringResult } from '../types';

export class RuleBasedFilter implements IFilteringService {
  private stats: FilteringStats = {
    totalProcessed: 0,
    totalIncluded: 0,
    totalExcluded: 0,
    averageProcessingTime: 0,
    reasonsForExclusion: {}
  };
  private processingTimes: number[] = [];

  constructor(private config: RuleBasedFilterConfig = {
    keywordMatching: 'substring',
    caseSensitive: false
  }) {}

  async initialize(): Promise<void> {
    // No initialization needed for rule-based
  }

  async filterPaper(
    paper: Paper,
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult> {
    const startTime = Date.now();
    
    try {
      // Check exclusion keywords
      for (const keyword of exclusionKeywords) {
        const matches = this.matchesKeyword(paper, keyword);
        if (matches) {
          this.recordExclusion(`Contains excluded keyword: ${keyword}`);
          return {
            included: false,
            reason: `Contains excluded keyword: ${keyword}`,
            processingTime: Date.now() - startTime
          };
        }
      }

      // Optionally verify inclusion keywords are present
      // (can be disabled for soft filtering)
      const hasInclusionKeyword = inclusionKeywords.length === 0 ||
        inclusionKeywords.some(kw => this.matchesKeyword(paper, kw));

      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      this.updateAverageTime();

      if (!hasInclusionKeyword) {
        this.recordExclusion('Missing inclusion keywords');
        return {
          included: false,
          reason: 'Missing inclusion keywords',
          processingTime
        };
      }

      this.stats.totalIncluded++;
      this.stats.totalProcessed++;

      return {
        included: true,
        reason: 'Passed rule-based filtering',
        processingTime
      };
    } catch (error) {
      return {
        included: true, // Default to include on error
        reason: `Error during filtering: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  async filterBatch(
    papers: Paper[],
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult[]> {
    return Promise.all(
      papers.map(paper =>
        this.filterPaper(paper, inclusionKeywords, exclusionKeywords)
      )
    );
  }

  private matchesKeyword(paper: Paper, keyword: string): boolean {
    const searchText = `${paper.title} ${paper.abstract || ''}`;
    const text = this.config.caseSensitive ? searchText : searchText.toLowerCase();
    const kw = this.config.caseSensitive ? keyword : keyword.toLowerCase();

    switch (this.config.keywordMatching) {
      case 'substring':
        return text.includes(kw);
      case 'regex':
        try {
          return new RegExp(kw, this.config.caseSensitive ? '' : 'i').test(text);
        } catch {
          return text.includes(kw); // Fallback to substring
        }
      case 'fuzzy':
        return this.fuzzyMatch(text, kw);
      default:
        return text.includes(kw);
    }
  }

  private fuzzyMatch(text: string, pattern: string): boolean {
    let patternIdx = 0;
    for (let textIdx = 0; textIdx < text.length && patternIdx < pattern.length; textIdx++) {
      if (text[textIdx] === pattern[patternIdx]) {
        patternIdx++;
      }
    }
    return patternIdx === pattern.length;
  }

  private recordExclusion(reason: string): void {
    this.stats.totalExcluded++;
    this.stats.totalProcessed++;
    this.stats.reasonsForExclusion[reason] = (this.stats.reasonsForExclusion[reason] || 0) + 1;
  }

  private updateAverageTime(): void {
    if (this.processingTimes.length > 0) {
      this.stats.averageProcessingTime =
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    }
  }

  getStats(): FilteringStats {
    return { ...this.stats };
  }
}
```

### Step 2.4: LLM-Based Filter Implementation

**File**: `src/core/filtering/llm-filter.ts`

```typescript
import { Paper, LLMFilterConfig } from '../types';
import { GeminiService } from '../gemini';
import { IFilteringService, FilteringStats } from './types';
import { FilteringResult } from '../types';

export class LLMFilter implements IFilteringService {
  private gemini: GeminiService;
  private stats: FilteringStats = {
    totalProcessed: 0,
    totalIncluded: 0,
    totalExcluded: 0,
    averageProcessingTime: 0,
    reasonsForExclusion: {}
  };
  private processingTimes: number[] = [];
  private confidenceScores: number[] = [];

  constructor(
    geminiConfig: { apiKey: string; model: string },
    private config: LLMFilterConfig
  ) {
    this.gemini = new GeminiService(geminiConfig);
  }

  async initialize(): Promise<void> {
    // Initialization if needed
  }

  async filterPaper(
    paper: Paper,
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.assessRelevance(
        paper,
        inclusionKeywords,
        exclusionKeywords
      );

      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      this.confidenceScores.push(result.confidence);
      this.updateAverageMetrics();

      if (!result.included) {
        this.stats.reasonsForExclusion[result.reason] =
          (this.stats.reasonsForExclusion[result.reason] || 0) + 1;
        this.stats.totalExcluded++;
      } else {
        this.stats.totalIncluded++;
      }

      this.stats.totalProcessed++;

      return {
        included: result.included,
        reason: result.reason,
        confidence: result.confidence,
        processingTime
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        included: true, // Default to include on error
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processingTime
      };
    }
  }

  async filterBatch(
    papers: Paper[],
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult[]> {
    const results: FilteringResult[] = [];
    const batchSize = this.config.batchSize || 10;

    for (let i = 0; i < papers.length; i += batchSize) {
      const batch = papers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(paper =>
          this.filterPaper(paper, inclusionKeywords, exclusionKeywords)
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async assessRelevance(
    paper: Paper,
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<{
    included: boolean;
    reason: string;
    confidence: number;
  }> {
    const prompt = `
You are a research paper relevance assessment expert. Analyze the following paper and determine if it should be included in a systematic literature review.

SEARCH CRITERIA:
- Inclusion Keywords: ${inclusionKeywords.join(', ')}
- Exclusion Keywords: ${exclusionKeywords.join(', ')}

PAPER:
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Year: ${paper.year}
Abstract: ${paper.abstract || 'N/A'}

Based on the criteria above, respond with a JSON object containing:
{
  "included": boolean,
  "reason": "explanation of decision (max 100 chars)",
  "confidence": number between 0 and 1
}

Consider:
1. Does the paper address the inclusion keywords?
2. Does it contain any exclusion keywords?
3. Is it relevant to the research topic?

Respond ONLY with valid JSON.
`;

    try {
      const response = await this.gemini.generateContent(prompt);
      const text = response.toString();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        included: result.included === true,
        reason: result.reason || 'No reason provided',
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5))
      };
    } catch (error) {
      // Fallback to rule-based if LLM fails
      console.error('LLM filtering error:', error);
      throw error;
    }
  }

  private updateAverageMetrics(): void {
    if (this.processingTimes.length > 0) {
      this.stats.averageProcessingTime =
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    }
    
    if (this.confidenceScores.length > 0) {
      const avgConfidence =
        this.confidenceScores.reduce((a, b) => a + b, 0) / this.confidenceScores.length;
      // Store in extended stats if needed
    }
  }

  getStats(): FilteringStats {
    return { ...this.stats };
  }
}
```

### Step 2.5: Hybrid Filter Implementation

**File**: `src/core/filtering/hybrid-filter.ts`

```typescript
import { Paper } from '../types';
import { IFilteringService, FilteringStats } from './types';
import { FilteringResult } from '../types';
import { RuleBasedFilter } from './rule-based-filter';
import { LLMFilter } from './llm-filter';

export class HybridFilter implements IFilteringService {
  private ruleBasedFilter: RuleBasedFilter;
  private llmFilter: LLMFilter;
  private confidenceThreshold: number;

  constructor(
    ruleBasedFilter: RuleBasedFilter,
    llmFilter: LLMFilter,
    confidenceThreshold: number = 0.6
  ) {
    this.ruleBasedFilter = ruleBasedFilter;
    this.llmFilter = llmFilter;
    this.confidenceThreshold = confidenceThreshold;
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.ruleBasedFilter.initialize(),
      this.llmFilter.initialize()
    ]);
  }

  async filterPaper(
    paper: Paper,
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult> {
    // First pass: quick rule-based filtering
    const ruleResult = await this.ruleBasedFilter.filterPaper(
      paper,
      inclusionKeywords,
      exclusionKeywords
    );

    // If rule-based is confident, return immediately
    if (!ruleResult.included || ruleResult.processingTime < 10) {
      return ruleResult;
    }

    // If uncertain, use LLM for better accuracy
    const llmResult = await this.llmFilter.filterPaper(
      paper,
      inclusionKeywords,
      exclusionKeywords
    );

    // Use LLM result if confidence is high enough
    if ((llmResult.confidence || 0) > this.confidenceThreshold) {
      return llmResult;
    }

    // Otherwise, combine both results
    return {
      included: ruleResult.included && llmResult.included,
      reason: `Rule-based: ${ruleResult.reason}, LLM: ${llmResult.reason}`,
      confidence: ((ruleResult.processingTime > 0 ? 0.5 : 0) + (llmResult.confidence || 0)) / 2,
      processingTime: ruleResult.processingTime + llmResult.processingTime
    };
  }

  async filterBatch(
    papers: Paper[],
    inclusionKeywords: string[],
    exclusionKeywords: string[]
  ): Promise<FilteringResult[]> {
    // First pass: all rule-based
    const ruleResults = await this.ruleBasedFilter.filterBatch(
      papers,
      inclusionKeywords,
      exclusionKeywords
    );

    // Identify uncertain papers
    const uncertainPapers = papers.filter((paper, i) =>
      ruleResults[i].included &&
      ruleResults[i].processingTime > this.confidenceThreshold * 1000
    );

    if (uncertainPapers.length === 0) {
      return ruleResults;
    }

    // Second pass: LLM for uncertain papers
    const llmResults = await this.llmFilter.filterBatch(
      uncertainPapers,
      inclusionKeywords,
      exclusionKeywords
    );

    // Combine results
    const finalResults: FilteringResult[] = [];
    let llmIndex = 0;

    for (let i = 0; i < papers.length; i++) {
      const isUncertain = uncertainPapers.includes(papers[i]);

      if (isUncertain && llmIndex < llmResults.length) {
        finalResults.push(llmResults[llmIndex++]);
      } else {
        finalResults.push(ruleResults[i]);
      }
    }

    return finalResults;
  }

  getStats(): FilteringStats {
    // Return combined stats
    const ruleStats = this.ruleBasedFilter.getStats();
    const llmStats = this.llmFilter.getStats();

    return {
      totalProcessed: ruleStats.totalProcessed + llmStats.totalProcessed,
      totalIncluded: ruleStats.totalIncluded + llmStats.totalIncluded,
      totalExcluded: ruleStats.totalExcluded + llmStats.totalExcluded,
      averageProcessingTime:
        (ruleStats.averageProcessingTime + llmStats.averageProcessingTime) / 2,
      reasonsForExclusion: {
        ...ruleStats.reasonsForExclusion,
        ...llmStats.reasonsForExclusion
      }
    };
  }
}
```

### Step 2.6: Main Filtering Service Factory

**File**: `src/core/filtering/index.ts`

```typescript
import { SearchParameters, FilteringMode } from '../types';
import { GeminiService } from '../gemini';
import { IFilteringService } from './types';
import { RuleBasedFilter } from './rule-based-filter';
import { LLMFilter } from './llm-filter';
import { HybridFilter } from './hybrid-filter';

export class FilteringServiceFactory {
  static async createFilteringService(
    mode: FilteringMode | undefined,
    geminiConfig: { apiKey: string; model: string }
  ): Promise<IFilteringService> {
    const filteringMode = mode || 'rule-based';

    switch (filteringMode) {
      case 'rule-based':
        const ruleFilter = new RuleBasedFilter({
          keywordMatching: 'substring',
          caseSensitive: false
        });
        await ruleFilter.initialize();
        return ruleFilter;

      case 'llm-based':
        const llmFilter = new LLMFilter(geminiConfig, {
          provider: 'gemini',
          model: geminiConfig.model,
          relevanceThreshold: 0.7,
          batchSize: 10,
          cacheEnabled: true
        });
        await llmFilter.initialize();
        return llmFilter;

      case 'hybrid':
        const hybridRuleFilter = new RuleBasedFilter({
          keywordMatching: 'substring',
          caseSensitive: false
        });
        const hybridLLMFilter = new LLMFilter(geminiConfig, {
          provider: 'gemini',
          model: geminiConfig.model,
          relevanceThreshold: 0.7,
          batchSize: 10,
          cacheEnabled: true
        });
        await Promise.all([
          hybridRuleFilter.initialize(),
          hybridLLMFilter.initialize()
        ]);
        return new HybridFilter(hybridRuleFilter, hybridLLMFilter, 0.6);

      default:
        throw new Error(`Unknown filtering mode: ${filteringMode}`);
    }
  }
}

export type { IFilteringService } from './types';
export { RuleBasedFilter } from './rule-based-filter';
export { LLMFilter } from './llm-filter';
export { HybridFilter } from './hybrid-filter';
```

---

## Phase 3: Integrate Filtering Service into ScholarExtractor

### Step 3.1: Update ScholarExtractor

**File**: `src/core/scholar/index.ts`

Replace the `applyExclusionFilters` method (lines 244-293):

```typescript
private filteringService?: IFilteringService;

async startSearch(
  parameters: SearchParameters,
  onProgress?: ProgressCallback,
  onPaper?: PaperCallback
): Promise<string> {
  // ... existing code ...
  
  // Initialize filtering service
  this.filteringService = await FilteringServiceFactory.createFilteringService(
    parameters.filteringMode,
    this.database.getConfig().gemini
  );

  // ... rest of existing code ...
}

private async applyExclusionFilters(
  exclusionKeywords: string[],
  inclusionKeywords: string[]
): Promise<void> {
  if (!this.sessionId || !this.filteringService) return;

  this.updateProgress({
    currentTask: 'Applying filtering',
    nextTask: 'Finalizing results',
    progress: 90
  });

  const papers = this.database.getPapers(this.sessionId);
  const filteringStats: Record<string, number> = {};

  // Use filtering service to filter papers
  const filteringResults = await this.filteringService.filterBatch(
    papers,
    inclusionKeywords,
    exclusionKeywords
  );

  // Update papers with filtering results
  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const result = filteringResults[i];

    const updatedPaper: Paper = {
      ...paper,
      included: result.included,
      exclusionReason: result.included ? undefined : result.reason,
      filteringMode: parameters.filteringMode,
      filteringConfidence: result.confidence,
      filteringProcessingTime: result.processingTime
    };

    this.database.addPaper(this.sessionId, updatedPaper);

    // Track exclusion reasons
    if (!result.included) {
      filteringStats[result.reason] = (filteringStats[result.reason] || 0) + 1;
    }
  }

  // Get stats from filtering service
  const stats = this.filteringService.getStats();

  // Update PRISMA data
  this.database.updatePRISMAData(this.sessionId, {
    identification: {
      recordsIdentified: stats.totalProcessed,
      recordsRemoved: 0
    },
    screening: {
      recordsScreened: stats.totalProcessed,
      recordsExcluded: stats.totalExcluded,
      reasonsForExclusion: stats.reasonsForExclusion
    },
    included: {
      studiesIncluded: stats.totalIncluded
    }
  });
}
```

---

## Phase 4: Update Frontend

### Step 4.1: Add Filtering Mode Selector to SearchForm

**File**: `src/frontend/src/components/SearchForm.tsx`

Add after the inclusionKeywords section:

```typescript
const [filteringMode, setFilteringMode] = useState<'rule-based' | 'llm-based' | 'hybrid'>('rule-based');

// In the form rendering, add:
<div>
  <label className="label">Filtering Mode</label>
  <select
    value={filteringMode}
    onChange={(e) => setFilteringMode(e.target.value as any)}
    className="input-field"
    disabled={disabled}
  >
    <option value="rule-based">Rule-Based (Fast, Free)</option>
    <option value="hybrid">Hybrid (Balanced)</option>
    <option value="llm-based">LLM-Based (Accurate, Slower)</option>
  </select>
  <p className="text-sm text-gray-500 mt-1">
    {filteringMode === 'rule-based' && 'Simple keyword matching. Fast but may miss relevant papers.'}
    {filteringMode === 'llm-based' && 'AI-powered filtering. More accurate but slower and requires API calls.'}
    {filteringMode === 'hybrid' && 'Uses rules first, then AI for uncertain papers. Good balance.'}
  </p>
</div>

// Update handleSubmit to include filteringMode:
const params: SearchParameters = {
  // ... existing fields ...
  filteringMode
};
```

### Step 4.2: Update ProgressDashboard to Show Filtering Info

**File**: `src/frontend/src/components/ProgressDashboard.tsx`

Add filtering mode and confidence display:

```typescript
{progress.metadata?.filteringMode && (
  <div className="text-sm text-gray-600">
    Filtering Mode: {progress.metadata.filteringMode}
    {progress.metadata.avgConfidence !== undefined && (
      <span> | Avg Confidence: {(progress.metadata.avgConfidence * 100).toFixed(1)}%</span>
    )}
  </div>
)}
```

---

## Phase 5: Database Schema Updates

### Step 5.1: Add Filtering Columns to Papers Table

**File**: `src/core/database/index.ts`

Update the papers table creation to include:

```typescript
// Add these columns to the papers table
filtering_mode TEXT,
filtering_confidence REAL,
filtering_processing_time INTEGER,
```

---

## Testing Checklist

- [ ] Test rule-based filtering with various keyword patterns
- [ ] Test LLM-based filtering with Gemini API
- [ ] Test hybrid filtering mode
- [ ] Verify database updates with new columns
- [ ] Test frontend filtering mode selector
- [ ] Compare results across all three modes
- [ ] Measure performance metrics
- [ ] Test error handling (API failures, timeouts)
- [ ] Verify cost tracking for LLM calls
- [ ] Test with different research domains

---

## Deployment Checklist

- [ ] Update environment variables documentation
- [ ] Add filtering mode to .env.example
- [ ] Document LLM cost implications
- [ ] Update README with filtering mode options
- [ ] Add API configuration for alternative LLM providers
- [ ] Test on all platforms (web, desktop, CLI, mobile)
- [ ] Create migration guide for existing users
- [ ] Document filtering accuracy benchmarks

