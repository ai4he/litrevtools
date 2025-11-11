# Quick Reference Guide: Key Files & Architecture

## File Location Map

### Core Business Logic (`src/core/`)

**Types & Interfaces** → `/home/user/litrevtools/src/core/types/index.ts`
- SearchParameters, Paper, SearchProgress
- PRISMAData, TorCircuit, OutputFiles
- AppConfig, GeminiConfig

**Main Orchestrator** → `/home/user/litrevtools/src/core/index.ts`
- LitRevTools class (entry point)
- startSearch(), pauseSearch(), resumeSearch(), stopSearch()
- generateOutputs(), generatePRISMAPaper()
- Configuration building

**Google Scholar Extraction** → `/home/user/litrevtools/src/core/scholar/index.ts`
- ScholarExtractor class
- startSearch() - main entry point
- executeParallelSearch() - year-based parallel processing
- applyExclusionFilters() - WHERE RULE-BASED FILTERING HAPPENS (lines 244-308)
- shouldExclude() - THE FILTERING LOGIC TO ENHANCE

**Scraping Engine** → `/home/user/litrevtools/src/core/scholar/scraper.ts`
- GoogleScholarScraper class (Puppeteer-based)
- ParallelScholarScraper class (Tor pool management)
- search() - executes searches
- extractPaperFromElement() - parses Google Scholar HTML

**Tor Management** → `/home/user/litrevtools/src/core/scholar/tor-manager.ts`
- TorManager class (single circuit control)
- TorPoolManager class (multiple circuits)
- rotateCircuit() - IP rotation

**Gemini AI Integration** → `/home/user/litrevtools/src/core/gemini/index.ts`
- GeminiService class
- generateAbstract(), generateIntroduction(), generateMethodology()
- generateResults(), generateDiscussion(), generateConclusion()
- classifyPapers(), generateKeywords()

**Database Layer** → `/home/user/litrevtools/src/core/database/index.ts`
- LitRevDatabase class (SQLite wrapper)
- createSession(), addPaper(), updateProgress()
- updatePRISMAData(), updateOutputFiles()
- Tables: sessions, papers, prisma_data, output_files, screenshots

**Output Generation** → `/home/user/litrevtools/src/core/outputs/index.ts`
- OutputManager class
- generateAll(), generateIncremental()
- CSVGenerator, BibTeXGenerator, LaTeXGenerator, PRISMADiagramGenerator

---

### Platform-Specific Code (`src/platforms/`)

**Web Server** → `/home/user/litrevtools/src/platforms/web/server.ts`
- Express.js setup with Socket.IO
- REST API endpoints
- Authentication routes
- Search control routes
- Real-time event emission

**Web Authentication** → `/home/user/litrevtools/src/platforms/web/auth.ts`
- verifyGoogleToken()
- generateJWT()
- authMiddleware()
- optionalAuthMiddleware()

**Desktop Main** → `/home/user/litrevtools/src/platforms/desktop/main.ts`
- Electron main process
- IPC handler setup
- Window management

**CLI Interface** → `/home/user/litrevtools/src/platforms/cli/index.ts`
- Commander.js CLI setup
- search command implementation
- Progress bar display
- Interactive parameter gathering

---

### Frontend UI (`src/frontend/`)

**Main Entry** → `/home/user/litrevtools/src/frontend/src/App.tsx`
- App component structure
- Route setup
- Global state management

**Search Page** → `/home/user/litrevtools/src/frontend/src/pages/SearchPage.tsx`
- Main page component
- Search lifecycle management
- Pause/Resume/Stop handlers

**Search Form** → `/home/user/litrevtools/src/frontend/src/components/SearchForm.tsx`
- Keyword input management
- Year range selection
- Search parameter collection
- Default suggestions

**Progress Dashboard** → `/home/user/litrevtools/src/frontend/src/components/ProgressDashboard.tsx`
- Real-time progress display
- Status indicators
- Control buttons

**Paper List** → `/home/user/litrevtools/src/frontend/src/components/PaperList.tsx`
- Paper results display
- Included/excluded filters
- Search within results

**API Utilities** → `/home/user/litrevtools/src/frontend/src/utils/api.ts`
- searchAPI.start()
- searchAPI.pause()
- searchAPI.resume()
- searchAPI.stop()

**Socket Hooks** → `/home/user/litrevtools/src/frontend/src/hooks/useSocket.ts`
- Socket.IO connection management
- Event subscription

**Progress Hooks** → `/home/user/litrevtools/src/frontend/src/hooks/useProgress.ts`
- Progress state management
- Paper collection from socket events
- Error handling

---

## Critical Code Sections for LLM Filtering

### 1. CURRENT FILTERING LOGIC

**File**: `/home/user/litrevtools/src/core/scholar/index.ts`
**Lines**: 244-308

```typescript
private async applyExclusionFilters(exclusionKeywords: string[]): Promise<void> {
  // WHERE TO ADD FILTERING MODE SWITCHING
  
  for (const paper of papers) {
    const excluded = this.shouldExclude(paper, exclusionKeywords);
    // CURRENT: Uses shouldExclude() method only
    // NEEDED: Route to FilteringService based on mode
  }
}

private shouldExclude(paper: Paper, exclusionKeywords: string[]): string | null {
  // CURRENT IMPLEMENTATION TO REFACTOR
  const searchText = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
  
  for (const keyword of exclusionKeywords) {
    if (searchText.includes(keyword.toLowerCase())) {
      return `Contains excluded keyword: ${keyword}`;
    }
  }
  
  return null;
}
```

### 2. PAPER STRUCTURE

**File**: `/home/user/litrevtools/src/core/types/index.ts`
**Lines**: 15-31

```typescript
export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract?: string;
  url: string;
  citations?: number;
  source: 'semantic-scholar' | 'other';
  pdfUrl?: string;
  venue?: string;
  doi?: string;
  keywords?: string[];
  extractedAt: Date;
  included: boolean; // SET BY FILTERING
  exclusionReason?: string; // STORE FILTERING REASON
}
```

### 3. SEARCH PARAMETERS

**File**: `/home/user/litrevtools/src/core/types/index.ts`
**Lines**: 6-13

```typescript
export interface SearchParameters {
  name?: string;
  inclusionKeywords: string[];
  exclusionKeywords: string[];
  maxResults?: number;
  startYear?: number;
  endYear?: number;
  // ADD HERE: filteringMode?: 'rule-based' | 'llm-based' | 'hybrid';
}
```

### 4. DATABASE UPDATE HOOK

**File**: `/home/user/litrevtools/src/core/database/index.ts`
**Lines**: 52-72 (papers table schema)

```typescript
this.db.exec(`
  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    year INTEGER NOT NULL,
    abstract TEXT,
    url TEXT NOT NULL,
    citations INTEGER,
    source TEXT NOT NULL,
    pdf_url TEXT,
    venue TEXT,
    doi TEXT,
    keywords TEXT,
    extracted_at TEXT NOT NULL,
    included INTEGER NOT NULL DEFAULT 1,
    exclusion_reason TEXT,
    // ADD HERE: filtering_mode TEXT, filtering_confidence REAL
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
  )
`);
```

---

## Data Flow Diagrams

### Current Filtering Flow
```
ScholarExtractor.startSearch()
  │
  ├─→ executeParallelSearch()
  │   └─→ GoogleScholarScraper.search()
  │       └─→ extractPaperFromElement()
  │           └─→ Paper { included: true, ... }
  │
  └─→ applyExclusionFilters()
      └─→ shouldExclude() [RULE-BASED ONLY]
          └─→ Paper { included: boolean, exclusionReason: string }
```

### Proposed Filtering Flow (with LLM mode)
```
ScholarExtractor.startSearch()
  │
  ├─→ executeParallelSearch()
  │   └─→ GoogleScholarScraper.search()
  │       └─→ extractPaperFromElement()
  │           └─→ Paper { included: true, ... }
  │
  └─→ applyExclusionFilters(mode)
      │
      ├─→ IF mode === 'rule-based':
      │   └─→ RuleBasedFilter.filterPaper()
      │       └─→ Paper { included: boolean, reason: string }
      │
      ├─→ IF mode === 'llm-based':
      │   └─→ LLMFilter.filterBatch() [ASYNC]
      │       └─→ Paper { included: boolean, reason: string, confidence: 0-1 }
      │
      └─→ IF mode === 'hybrid':
          └─→ RuleBasedFilter.filterPaper() first
              IF uncertain → LLMFilter.filterPaper()
```

---

## Key Interfaces to Implement

### For Filtering Service
- `FilteringService` interface (initialize, filterPaper, filterBatch)
- `FilterDecision` interface (included, reason, confidence, processingTime)
- `FilteringParams` interface (inclusionKeywords, exclusionKeywords, context)
- `FilteringMode` type ('rule-based' | 'llm-based' | 'hybrid')
- `FilteringStrategy` interface (mode, ruleBasedConfig, llmConfig)

### For Database Extensions
- `filtering_mode` column in sessions table
- `filtering_confidence` column in papers table
- Optional: `filtering_strategy` JSON column for strategy details

### For Frontend Extensions
- `FilterModeSelector` component in SearchForm
- `FilteringStats` component in ProgressDashboard
- Confidence score display in PaperList

---

## Performance Baselines

| Mode | Speed | Accuracy | Cost |
|------|-------|----------|------|
| Rule-based | < 1ms/paper | ~70% | Free |
| LLM-based | ~200-500ms/paper* | ~95% | $0.001-0.01/paper** |
| Hybrid | ~100ms/paper (avg) | ~90% | $0.0005-0.005/paper |

\* For single paper; batching improves throughput
\* Estimated based on Gemini Flash pricing

---

## Environment Configuration for LLM Mode

Add to `.env` for LLM filtering:
```env
# Filtering Configuration
FILTERING_MODE=rule-based  # or llm-based, hybrid
FILTERING_LLM_MODEL=gemini-flash-lite-latest
FILTERING_BATCH_SIZE=10
FILTERING_RELEVANCE_THRESHOLD=0.7
FILTERING_CACHE_ENABLED=true
FILTERING_COST_LIMIT=10.0  # $ per session
```

---

## Testing Strategy

### Unit Tests
- RuleBasedFilter with known paper sets
- LLMFilter with mocked Gemini responses
- HybridFilter with borderline papers

### Integration Tests
- Full search with rule-based filtering
- Full search with LLM-based filtering
- Mode switching during search (if supported)

### Benchmark Tests
- Accuracy comparison (LLM vs rule-based on sample papers)
- Performance measurement (time per paper)
- Cost tracking (API calls and pricing)
- Database schema performance with new columns

