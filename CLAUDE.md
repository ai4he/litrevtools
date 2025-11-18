# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LitRevTools is an isomorphic systematic literature review tool using PRISMA methodology. It extracts research papers from Semantic Scholar API, filters them using AI or rule-based methods, and generates publication-ready research papers. The single codebase runs on CLI, Web, Desktop (Electron), and Mobile (Capacitor) platforms.

## Common Development Commands

### Build & Development

```bash
# Build all TypeScript
npm run build

# CLI Development
npm run dev                    # Run CLI in dev mode with ts-node
npm run cli                    # Run built CLI

# Web Development
npm run web:dev               # Start backend dev server (port 3000)
npm run frontend:dev          # Start frontend dev server (port 5173)
npm run frontend:build        # Build React frontend
npm run web:build             # Build backend + frontend
npm run web:start             # Start production server

# Desktop Development
npm run desktop:dev           # Run Electron in dev mode
npm run desktop:build         # Create platform installers

# Mobile Development
npm run mobile:sync           # Sync web assets to native projects
npm run mobile:run:android    # Run on Android
npm run mobile:run:ios        # Run on iOS (macOS only)
```

### Production Deployment (PM2)

```bash
npm run deploy:setup          # Build and start with PM2
npm run deploy:restart        # Restart PM2 service
npm run deploy:logs           # View PM2 logs
npm run deploy:stop           # Stop PM2 service
npm run deploy:status         # Check PM2 status
```

### Testing & Linting

```bash
npm test                      # Run Jest tests
npm run lint                  # Run ESLint
```

## Architecture

### Isomorphic Structure

The codebase is divided into three layers:

1. **Core Logic** (`src/core/`) - Platform-agnostic business logic shared across all platforms
2. **Frontend** (`src/frontend/`) - Single React app shared by Web, Desktop, and Mobile
3. **Platform Wrappers** (`src/platforms/`) - Thin adapters for each platform

### Core Modules (`src/core/`)

- **database/** - SQLite database layer (sessions, papers, PRISMA data, outputs)
- **scholar/** - Paper extraction from Semantic Scholar API
  - `index.ts` - Main search orchestrator with LLM filtering
  - `semantic-scholar.ts` - Semantic Scholar API client with rate limiting and pagination
- **llm/** - LLM service for semantic filtering, categorization, and paper generation
  - `llm-service.ts` - Main service orchestrating LLM operations
  - `api-key-manager.ts` - Automatic API key rotation when hitting rate limits
  - `gemini-provider.ts` - Google Gemini API implementation
  - `base-provider.ts` - Abstract provider interface for future LLM providers
- **gemini/** - Legacy AI paper generation (being migrated to llm/)
- **outputs/** - Multi-format output generators
  - `csv-generator.ts` - Spreadsheet export
  - `bibtex-generator.ts` - Reference manager export
  - `latex-generator.ts` - Research paper generation with iterative batch processing
  - `prisma-diagram.ts` - TikZ flow diagram generation
- **types/** - Shared TypeScript interfaces

### Platform Implementations (`src/platforms/`)

- **cli/** - Commander.js CLI with progress bars
- **web/** - Express.js + Socket.IO server
  - `server.ts` - HTTP/WebSocket server, REST API endpoints
  - `auth.ts` - Google OAuth 2.0 + JWT authentication
- **desktop/** - Electron main process and IPC bridge
- **mobile/** - Capacitor mobile API bridge

### Frontend (`src/frontend/`)

React + TypeScript + Tailwind CSS application built with Vite. Uses Socket.IO client for real-time progress updates during searches.

## Key Features & Implementation Details

### 1. Semantic Scholar API Integration

- **Rate Limiting**: Automatic rate limit handling (1 RPS for authenticated, 1000 RPS shared for unauthenticated)
- **Pagination**: Handles result sets up to 1000 papers per query (API hard limit)
- **Retry Logic**: Automatic retry with exponential backoff on failures
- **Rich Metadata**: Extracts title, authors, abstract, citations, venue, DOI, PDF links, etc.
- **Real-time Progress**: Emits events via callbacks/WebSocket during extraction

### 2. LLM-Powered vs Rule-Based Filtering

**LLM Mode (default):**
- Semantic understanding of inclusion/exclusion criteria
- Batch processing with configurable concurrency
- Automatic API key rotation when hitting rate limits
- Provides reasoning and confidence scores
- ~95% accuracy

**Rule-Based Mode (fallback):**
- Simple keyword substring matching
- No API costs, instant processing
- ~70% accuracy
- Automatically used when LLM fails or is disabled

**API Key Rotation:**
- Automatically switches between multiple API keys
- Detects rate limits, quota exceeded, invalid keys
- Configurable fallback strategies: rule-based, prompt user, or fail
- See `docs/API_KEY_ROTATION.md` for details

### 3. Iterative Paper Generation

LaTeX paper generation processes papers in configurable batches (default: 15 papers, configurable via `PAPER_BATCH_SIZE` env var):
- Each batch triggers complete paper regeneration
- Papers organized into thematic subsections
- Full abstracts and BibTeX sent to AI for context
- Proper citations using `\cite{}` commands

### 4. Database Schema

SQLite database with tables:
- `sessions` - Search configurations and progress
- `papers` - Extracted paper metadata
- `prisma_data` - PRISMA flow statistics (identification, screening, included)
- `output_files` - Generated output file paths
- `screenshots` - Browser screenshots during extraction
- `api_keys` - API key rotation status tracking

### 5. Web Interface

- **Real-time Updates**: Socket.IO for live progress, paper list, screenshots
- **Authentication**: Google OAuth 2.0 with JWT tokens
- **Responsive**: Works on desktop and mobile browsers
- **Interactive**: Live keyword selection, filtering controls

## Environment Variables

```bash
# AI/LLM Configuration
GEMINI_API_KEY=your_gemini_api_key              # Single key
GEMINI_API_KEYS=key1,key2,key3                  # Multiple keys (comma-separated)
GEMINI_MODEL=gemini-2.5-flash-lite              # Default model (tested 2025-11-18)
                                                 # Alternative: gemini-2.5-flash (slower but more capable)
PAPER_BATCH_SIZE=15                             # Papers per batch for iterative generation

# Google OAuth (for web platform)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Semantic Scholar API (optional - increases rate limits)
SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_key

# Database & Storage
DATABASE_PATH=./data/litrevtools.db
OUTPUT_DIR=./data/outputs

# Web Server
WEB_PORT=3000
WEB_HOST=localhost

# Application Settings
MAX_PARALLEL_REQUESTS=3
SCREENSHOT_ENABLED=true
```

## Build Process

### Development Workflow

For web development, run two terminals:
```bash
# Terminal 1: Backend
npm run web:dev

# Terminal 2: Frontend
cd src/frontend && npm run dev
```

Backend runs on port 3000, frontend dev server on port 5173 (proxies to backend).

### Production Build Order

1. Build frontend: `npm run frontend:build` → `src/frontend/dist/`
2. Build backend: `tsc` → `dist/`
3. Copy frontend to dist: `npm run web:copy-frontend` → `dist/frontend/dist/`
4. Copy static files: `npm run web:copy-static` → `dist/platforms/web/public/`

Or use: `npm run web:build` (does all steps)

### TypeScript Configuration

- Main `tsconfig.json` excludes `src/frontend`, `src/platforms/mobile`, `src/platforms/desktop`
- Frontend has its own `src/frontend/tsconfig.json` with React settings
- Output: `dist/` directory mirrors `src/` structure

## Testing Strategy

- **Core Logic**: Unit tests with Jest, mock platform-specific code
- **API Integration**: Test with real/mocked Google Scholar and Gemini API
- **Database**: Integration tests with in-memory SQLite
- **Web**: E2E tests with Playwright (planned)

## Common Development Patterns

### Adding a New Feature

1. **Core Logic** (`src/core/`): Implement platform-agnostic business logic
2. **Types** (`src/core/types/`): Define TypeScript interfaces
3. **Frontend** (`src/frontend/src/`): Add React components/pages
4. **Platform Integration**:
   - Web: Add REST endpoint in `src/platforms/web/server.ts`
   - CLI: Add command in `src/platforms/cli/index.ts`
   - Desktop: Add IPC handler in `src/platforms/desktop/main.ts`

### Working with the Database

```typescript
import { LitRevDatabase } from './database';

const db = new LitRevDatabase('./data/litrevtools.db');
const session = db.getSession(sessionId);
const papers = db.getSessionPapers(sessionId);
```

### Starting a Search

```typescript
import { LitRevTools } from './core';

const tools = new LitRevTools();
const sessionId = await tools.startSearch({
  inclusionKeywords: ['machine learning', 'healthcare'],
  exclusionKeywords: ['survey', 'review'],
  maxResults: 100,
  startYear: 2020,
  endYear: 2024,
  llmConfig: {
    enabled: true,
    provider: 'gemini',
    apiKeys: [process.env.GEMINI_API_KEY],
    batchSize: 10
  }
}, {
  onProgress: (progress) => console.log(progress),
  onPaper: (paper) => console.log(paper)
});
```

### Generating Outputs

```typescript
import { OutputManager } from './outputs';

const outputManager = new OutputManager(database, gemini, outputDir);
await outputManager.generateAll(sessionId); // Generate all formats
await outputManager.generateIncremental(sessionId); // Incremental LaTeX
```

## Deployment

### Web Application (PM2)

1. Build: `npm run web:build`
2. Configure `.env` with production values
3. Start: `npm run deploy:setup` or `pm2 start ecosystem.config.js`
4. Configure nginx reverse proxy (see `nginx.conf.template`)
5. Setup SSL with Let's Encrypt

See `docs/DEPLOYMENT.md` for detailed instructions.

### Desktop Application

1. Build: `npm run desktop:build`
2. Installers created in `build/` directory:
   - macOS: `.dmg`
   - Windows: `.exe`
   - Linux: `.AppImage`

### Mobile Application

1. Build web assets: `npm run mobile:build`
2. Open in native IDE (Xcode for iOS, Android Studio for Android)
3. Build and sign native apps
4. Publish to app stores

## Important Notes

- **API Rate Limits**:
  - Semantic Scholar:
    - Unauthenticated: 1,000 requests/second (shared across all users)
    - Authenticated (with API key): 1 request/second (dedicated, per key)
    - **Result limit**: Maximum 1,000 results per query (offset + limit ≤ 1000)
    - For larger datasets, use bulk search endpoint or Datasets API
  - Gemini free tier: 60 req/min, 1,500 req/day - use multiple API keys for large reviews
- **Database Migrations**: No migration system yet - schema changes require manual SQL or fresh database
- **Frontend Proxy**: In dev mode, Vite proxy (port 5173) forwards to Express (port 3000)
- **Real-time Communication**: Web platform uses Socket.IO for progress updates, not polling
- **Session Management**: Searches return sessionId immediately and run in background
- **Year Filtering**: Semantic Scholar API supports year ranges for focused literature searches

## Documentation

Additional documentation in `docs/`:
- `PLATFORM_ARCHITECTURE.md` - Detailed isomorphic architecture explanation
- `API_KEY_ROTATION.md` - API key rotation configuration and troubleshooting
- `LLM_FILTERING.md` - LLM vs rule-based filtering comparison
- `DEPLOYMENT.md` - Production deployment guide with nginx, PM2, SSL
- `QUICK_REFERENCE.md` - Quick reference for common tasks
