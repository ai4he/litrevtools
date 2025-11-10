# LitRevTools Architecture Exploration Summary

## Project Overview

LitRevTools is an **isomorphic systematic literature review tool** that implements PRISMA methodology with AI-powered paper generation and analysis. Built with a single TypeScript codebase that runs across multiple platforms.

**Current Status**: On feature branch `claude/llm-vs-rule-based-filtering-011CUzBgHkzDY1jGQgNxK9oz` for implementing LLM vs rule-based filtering modes.

---

## 1. Project Structure & Main Components

### Core Directory (`src/core/`)
- **database/** - SQLite-based storage layer with tables for:
  - Sessions (search configurations and progress)
  - Papers (extracted metadata)
  - PRISMA data (screening statistics)
  - Output files (generated artifacts)
  - Screenshots (browser captures)

- **scholar/** - Google Scholar extraction orchestration:
  - `index.ts` - Main orchestrator for parallel searches
  - `scraper.ts` - Puppeteer-based Google Scholar scraper
  - `tor-manager.ts` - Tor circuit rotation for IP management

- **gemini/** - Google Generative AI integration:
  - Paper classification and keyword extraction
  - PRISMA section generation (abstract, intro, methodology, results, discussion, conclusion)

- **outputs/** - Multi-format output generators:
  - CSV, BibTeX, LaTeX, PRISMA diagrams
  - Incremental and batch generation modes

- **types/** - Shared TypeScript interfaces (68 lines)

### Platform-Specific Code (`src/platforms/`)

1. **Web** (`src/platforms/web/`)
   - Express.js server with Socket.IO for real-time updates
   - REST API for search management
   - Google OAuth 2.0 + JWT authentication
   - Serves React frontend from `dist/frontend/dist/`

2. **Desktop** (`src/platforms/desktop/`)
   - Electron wrapper for native OS applications
   - IPC bridge between renderer and main processes
   - Cross-platform installers (Windows .exe, macOS .dmg, Linux .AppImage)

3. **Mobile** (`src/platforms/mobile/`)
   - Capacitor wrapper for iOS and Android
   - Native device API integration
   - WebView-based frontend

4. **CLI** (`src/platforms/cli/`)
   - Commander.js-based command-line interface
   - Direct function calls without HTTP overhead
   - CLI progress bars with chalk colors

### Frontend (`src/frontend/`)
- **Single React application** shared across web, desktop, and mobile
- Vite build system
- Tailwind CSS styling
- Socket.IO client for real-time progress updates
- Google OAuth integration
- Components:
  - SearchForm (keyword management, year range selection)
  - ProgressDashboard (real-time statistics)
  - ScreenshotViewer (browser capture display)
  - PaperList (paper results)
  - OutputDownloads (file management)

---

## 2. Existing LLM/AI Integration

### Current Implementation

**Location**: `src/core/gemini/index.ts` (362 lines)

**Capabilities**:
- **Paper Classification**: Groups papers into research themes using Gemini analysis
- **Keyword Generation**: Extracts 5-7 keywords from paper titles/abstracts
- **PRISMA Section Generation**: AI-powered content creation:
  - Abstract (200-300 words)
  - Introduction (500-800 words)
  - Methodology (600-1000 words)
  - Results (800-1200 words)
  - Discussion (700-1000 words)
  - Conclusion (300-500 words)

**API Provider**: Google Generative AI (`@google/generative-ai`)

**Configuration**:
```typescript
interface GeminiConfig {
  apiKey: string;
  model: string; // default: 'gemini-flash-lite-latest'
}
```

**Limitations of Current Approach**:
- AI is used only for **output generation**, not for filtering/classification during extraction
- No LLM-based paper relevance assessment
- No sophisticated semantic filtering

---

## 3. Literature Review Processing Pipeline

### Current Flow

```
1. USER INPUT
   └─> SearchParameters {
       inclusionKeywords: string[]
       exclusionKeywords: string[]
       maxResults?: number
       startYear?, endYear?
   }

2. EXTRACTION (ScholarExtractor)
   ├─> Parallel year-based searches (1-3 concurrent)
   ├─> Tor circuit rotation (IP rotation)
   └─> Puppeteer scraping from Google Scholar
       └─> Per paper:
           - Title, Authors, Year
           - Abstract, URL, Citations
           - PDF URL, Venue, DOI

3. FILTERING (Rule-Based)
   └─> applyExclusionFilters()
       ├─> Text-based keyword matching (case-insensitive)
       └─> Mark paper as included/excluded with reason

4. PRISMA ANALYSIS
   └─> Update statistics:
       - recordsIdentified (total found)
       - recordsScreened (total processed)
       - recordsExcluded (filtered out)
       - reasonsForExclusion (keyword-based)
       - studiesIncluded (final count)

5. OUTPUT GENERATION
   └─> Parallel generation:
       - CSV (spreadsheet with metadata)
       - BibTeX (citation format)
       - LaTeX (full research paper + Gemini sections)
       - PRISMA diagram (TikZ flow chart)
       - PRISMA table (statistics)
       - ZIP (archive with all files)
```

### Key Filtering Code

**Location**: `src/core/scholar/index.ts` lines 244-308

```typescript
private shouldExclude(paper: Paper, exclusionKeywords: string[]): string | null {
  const searchText = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
  
  for (const keyword of exclusionKeywords) {
    if (searchText.includes(keyword.toLowerCase())) {
      return `Contains excluded keyword: ${keyword}`;
    }
  }
  
  return null;
}
```

**Current Approach**:
- Simple substring matching
- Case-insensitive
- No semantic understanding
- No weighting or fuzzy matching
- No ML-based relevance scoring

---

## 4. Configuration Management System

### Environment Variables (`.env`)

```env
# Gemini API
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-flash-lite-latest

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# JWT Authentication
JWT_SECRET=litrevtools-secret-key-change-in-production

# Tor Configuration
TOR_SOCKS_PORT=9050
TOR_CONTROL_PORT=9051
TOR_PASSWORD=

# Database
DATABASE_PATH=./data/litrevtools.db

# Web Server
WEB_PORT=3000
WEB_HOST=localhost

# Application Settings
MAX_PARALLEL_REQUESTS=5
SCREENSHOT_ENABLED=true
OUTPUT_DIR=./data/outputs
```

### Configuration Structure

**Location**: `src/core/types/index.ts` lines 92-120

```typescript
interface AppConfig {
  database: DatabaseConfig;
  gemini: GeminiConfig;
  googleAuth: GoogleAuthConfig;
  tor: TorConfig;
  maxParallelRequests: number;
  screenshotEnabled: boolean;
  outputDir: string;
}
```

### Configuration Loading

**Location**: `src/core/index.ts` (LitRevTools class)

- Uses `dotenv` for environment variable loading
- Builds default config from environment variables
- Allows partial overrides via constructor
- Deep merge of nested config objects

**Usage**:
```typescript
const tools = new LitRevTools({
  database: { path: '/custom/path.db' },
  gemini: { apiKey: 'custom-key' }
});
```

---

## 5. API Integration Patterns

### Web Platform REST API

**Location**: `src/platforms/web/server.ts`

#### Authentication Endpoints
```typescript
POST   /api/auth/google           # Google OAuth login
GET    /api/auth/me               # Get current user (with auth)
POST   /api/auth/logout           # Logout placeholder
```

#### Session Management
```typescript
GET    /api/sessions              # List all sessions
GET    /api/sessions/:id          # Get session details
```

#### Search Control
```typescript
POST   /api/search/start          # Start new search
POST   /api/search/:id/pause      # Pause active search
POST   /api/search/:id/resume     # Resume paused search
POST   /api/search/:id/stop       # Stop and cleanup
```

#### WebSocket Events
```typescript
io.emit(`progress:${sessionId}`, progress)    # Real-time progress updates
io.emit(`paper:${sessionId}`, paper)          # New paper found
io.emit(`outputs:${sessionId}`, outputs)      # Output files ready
io.emit(`error:${sessionId}`, error)          # Error occurred
```

### Data Flow Architecture

**Web/Mobile**:
```
React Frontend → REST API + WebSocket → Express.js → Core Logic → Database
```

**Desktop**:
```
React Frontend (Renderer) → IPC → Electron (Main) → Core Logic → Database
```

**CLI**:
```
Commander.js → Direct Function Calls → Core Logic → Database
```

### Key Integration Points

1. **Search Lifecycle**:
   ```typescript
   const sessionId = await litrev.startSearch(params, {
     onProgress: (progress) => io.emit(`progress:${sessionId}`, progress),
     onPaper: (paper) => io.emit(`paper:${sessionId}`, paper),
     onError: (error) => io.emit(`error:${sessionId}`, error)
   });
   ```

2. **Active Search Tracking**:
   ```typescript
   const activeSearches = new Map<string, { 
     sessionId: string; 
     tools: LitRevTools 
   }>();
   ```

3. **Paper Callbacks**:
   - Papers are processed incrementally during extraction
   - Each paper triggers a callback for real-time UI updates
   - Database is updated immediately

---

## 6. Architecture for LLM vs Rule-Based Filtering

### Current State
- **100% Rule-Based**: Simple keyword substring matching
- **No Filtering Configuration**: All searches use the same method

### Design Recommendations for Dual Modes

#### 1. Type System Enhancement

Add to `src/core/types/index.ts`:
```typescript
export type FilteringMode = 'rule-based' | 'llm-based' | 'hybrid';

export interface FilteringStrategy {
  mode: FilteringMode;
  ruleBasedConfig?: RuleBasedConfig;
  llmConfig?: LLMConfig;
}

interface RuleBasedConfig {
  keywordMatching: 'substring' | 'fuzzy' | 'regex';
  caseSensitive: boolean;
  minSimilarity?: number; // for fuzzy matching
}

interface LLMConfig {
  provider: 'gemini' | 'openai' | 'custom';
  model: string;
  systemPrompt?: string;
  temperature?: number;
  relevanceThreshold: number; // 0-1
  batchSize: number; // process N papers at once
  cacheEnabled?: boolean;
}

export interface SearchParameters {
  // ... existing fields ...
  filteringMode?: FilteringMode; // default: 'rule-based'
  filteringStrategy?: FilteringStrategy;
}
```

#### 2. Filtering Service Abstraction

Create new files:
```
src/core/filtering/
├── index.ts                      # Main FilteringService
├── rule-based-filter.ts          # Rule-based implementation
├── llm-filter.ts                 # LLM-based implementation
├── hybrid-filter.ts              # Hybrid approach
└── types.ts                       # Filtering interfaces
```

#### 3. Filtering Service Interface

```typescript
// src/core/filtering/index.ts
export interface FilteringService {
  initialize(): Promise<void>;
  
  filterPaper(paper: Paper, params: FilteringParams): Promise<FilterDecision>;
  
  filterBatch(papers: Paper[], params: FilteringParams): Promise<FilterDecision[]>;
}

export interface FilterDecision {
  included: boolean;
  reason: string;
  confidence?: number; // 0-1 for LLM-based
  processingTime?: number; // ms
}

export interface FilteringParams {
  inclusionKeywords: string[];
  exclusionKeywords: string[];
  context?: string; // additional context for LLM
}
```

#### 4. Integration Points

**ScholarExtractor**:
- Replace `shouldExclude()` method with FilteringService
- Support async filtering for LLM mode
- Batch processing optimization

**Database**:
- Add `filtering_mode` column to sessions table
- Store filtering strategy configuration
- Track filtering confidence scores

**Frontend**:
- Add filtering mode selector to SearchForm
- Show filtering strategy details in ProgressDashboard
- Display confidence scores for LLM-based filtering

#### 5. Processing Pipelines

**Rule-Based (Fast)**:
```
Paper extracted → FilteringService.filterPaper() → Instant decision
```

**LLM-Based (Slower, More Accurate)**:
```
Papers extracted → Batch accumulation (N papers) → LLM analysis → Decisions
```

**Hybrid (Balanced)**:
```
Paper extracted → Rule-based check → If uncertain → LLM analysis
```

---

## 7. Key Files Reference

| File Path | Purpose | Lines | Key Functions |
|-----------|---------|-------|----------------|
| `src/core/types/index.ts` | Type definitions | 125 | Core interfaces |
| `src/core/index.ts` | Main orchestrator | 248 | LitRevTools class |
| `src/core/gemini/index.ts` | AI integration | 362 | generateAbstract, classifyPapers |
| `src/core/scholar/index.ts` | Extraction | 378 | startSearch, applyExclusionFilters |
| `src/core/scholar/scraper.ts` | Scraping | 376 | GoogleScholarScraper |
| `src/core/database/index.ts` | Data persistence | 500+ | LitRevDatabase |
| `src/platforms/web/server.ts` | Web API | 400+ | Express routes, Socket.IO |
| `src/core/outputs/index.ts` | Result generation | 200+ | OutputManager |

---

## 8. Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Real-time**: Socket.IO
- **Database**: SQLite (better-sqlite3)
- **Web Scraping**: Puppeteer + Puppeteer Extra
- **IP Rotation**: Tor (socks-proxy-agent)
- **AI/LLM**: Google Generative AI (Gemini)
- **Authentication**: Google OAuth 2.0 + JWT
- **Type System**: TypeScript 5.3+

### Frontend
- **Framework**: React 18
- **Build**: Vite
- **Styling**: Tailwind CSS
- **Real-time**: Socket.IO Client
- **Icons**: Lucide React
- **HTTP**: Axios

### Deployment
- **Web**: PM2 + Nginx (reverse proxy)
- **Desktop**: Electron + electron-builder
- **Mobile**: Capacitor
- **CLI**: Commander.js

---

## 9. Critical Observations for Implementation

### Strengths
1. ✅ Clean separation of concerns (core vs platforms)
2. ✅ Callback-based progress streaming (ready for filtering updates)
3. ✅ Async/await throughout (supports batched LLM calls)
4. ✅ Database abstraction layer (easy to extend with filtering data)
5. ✅ Gemini integration already in place (can enhance for filtering)

### Gaps for LLM Filtering
1. ❌ No filtering abstraction (hardcoded keyword matching)
2. ❌ No LLM cost tracking or rate limiting
3. ❌ No caching mechanism for similar papers
4. ❌ No filtering confidence/quality metrics
5. ❌ No user feedback loop for training

### Performance Considerations
- **Rule-based**: Instant (< 1ms per paper)
- **LLM-based**: Slow (~2-5s per batch of 10 papers with Gemini)
- **Hybrid**: Balanced (~100ms for rules, LLM for uncertain cases)

---

## 10. Next Steps for Implementation

1. **Design Phase**:
   - Define FilteringService interface
   - Plan LLM prompts for relevance assessment
   - Design database schema changes

2. **Implementation Phase**:
   - Create filtering service abstraction
   - Implement rule-based filter (extract current logic)
   - Implement LLM-based filter (new)
   - Add filtering mode to SearchParameters

3. **Integration Phase**:
   - Wire FilteringService into ScholarExtractor
   - Add configuration UI for filtering mode
   - Update progress dashboard with filtering stats

4. **Testing Phase**:
   - Compare accuracy (LLM vs rule-based)
   - Measure performance/cost
   - Test on various research domains

5. **Optimization Phase**:
   - Implement batching for LLM calls
   - Add caching layer
   - Cost optimization for API calls
   - Quality metrics and feedback loop

