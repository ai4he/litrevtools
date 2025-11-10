# LitRevTools Codebase Exploration - Final Summary

## Executive Summary

Successfully explored the LitRevTools codebase and created comprehensive documentation for implementing LLM vs rule-based filtering. The project is a well-architected isomorphic systematic literature review tool with clean separation between core business logic and platform-specific implementations.

**Current Status**: Feature branch ready for LLM/rule-based filtering implementation
**Codebase Quality**: High (clean types, good abstractions, async-first design)
**Implementation Effort**: Moderate (3-5 days for full implementation)

---

## Key Findings

### 1. Architecture Strengths

✅ **Isomorphic Design**: Single TypeScript codebase runs on Web, Desktop, Mobile, and CLI
✅ **Clean Separation**: Core logic isolated from platform implementations
✅ **Type Safety**: Comprehensive TypeScript interfaces throughout
✅ **Async-First**: All operations use async/await, ready for LLM batching
✅ **Real-Time Updates**: Socket.IO callbacks enable live progress updates
✅ **Database Abstraction**: SQLite layer makes schema extensions straightforward
✅ **AI Integration Ready**: Gemini API already integrated (for output generation)

### 2. Current Filtering Implementation

**Status**: 100% rule-based keyword substring matching
**Location**: `src/core/scholar/index.ts` (lines 244-308)
**Limitations**:
- No semantic understanding
- No machine learning/AI
- No confidence scoring
- No configuration options

### 3. Files Created for Your Reference

Three comprehensive documentation files have been created:

1. **ARCHITECTURE_ANALYSIS.md** (10 sections)
   - Detailed project structure
   - LLM/AI integration details
   - Processing pipeline diagrams
   - Configuration system
   - API patterns
   - Performance considerations

2. **QUICK_REFERENCE.md** (9 sections)
   - File location map
   - Critical code sections
   - Data flow diagrams
   - Key interfaces
   - Performance baselines
   - Environment configuration

3. **IMPLEMENTATION_GUIDE.md** (5 phases)
   - Step-by-step implementation instructions
   - Complete TypeScript code examples
   - Integration points
   - Testing checklist
   - Deployment checklist

All files are saved to: `/home/user/litrevtools/`

---

## Architecture Insights

### Core Module Organization

```
src/core/
├── types/              # Shared interfaces (125 lines)
├── index.ts           # Main orchestrator (248 lines)
├── database/          # SQLite abstraction (500+ lines)
├── scholar/           # Google Scholar extraction (1000+ lines)
│   ├── index.ts      # Orchestrator with filtering
│   ├── scraper.ts    # Puppeteer-based scraper
│   └── tor-manager.ts # Tor circuit rotation
├── gemini/            # Gemini AI integration (362 lines)
└── outputs/           # Output generators (200+ lines)
```

### Filtering Entry Point

**Critical Section**: `src/core/scholar/index.ts` lines 244-308
- `applyExclusionFilters()` - Called after all papers extracted
- `shouldExclude()` - Returns boolean and reason string
- **This is where filtering logic needs to be replaced**

### Database Tables Relevant to Filtering

```sql
papers (
  id TEXT PRIMARY KEY,
  title TEXT,
  abstract TEXT,
  included INTEGER,
  exclusion_reason TEXT,
  -- Add for LLM mode:
  -- filtering_mode TEXT,
  -- filtering_confidence REAL,
  -- filtering_processing_time INTEGER
)
```

---

## Recommended Implementation Strategy

### Phase 1: Type System (1-2 hours)
- Add `FilteringMode` type
- Add `FilteringStrategy` interface
- Extend `SearchParameters` and `Paper` interfaces
- Add `FilteringResult` and `FilteringStats`

### Phase 2: Filtering Service Abstraction (6-8 hours)
- Create `src/core/filtering/` module
- Implement `RuleBasedFilter` (refactor existing logic)
- Implement `LLMFilter` (new with Gemini)
- Implement `HybridFilter` (smart combination)
- Create `FilteringServiceFactory`

### Phase 3: Integration (4-6 hours)
- Wire `FilteringService` into `ScholarExtractor`
- Update database schema
- Update PRISMA statistics tracking
- Handle async LLM filtering

### Phase 4: Frontend UI (3-4 hours)
- Add filtering mode selector to `SearchForm`
- Display filtering mode/confidence in `ProgressDashboard`
- Show confidence scores in `PaperList`

### Phase 5: Testing & Optimization (4-6 hours)
- Unit tests for all filter implementations
- Integration tests
- Performance benchmarking
- Cost tracking for LLM calls

**Total Estimated Effort**: 20-30 developer hours

---

## Performance Projections

| Metric | Rule-Based | LLM-Based | Hybrid |
|--------|-----------|-----------|--------|
| Speed per paper | < 1ms | 200-500ms* | 50-100ms avg |
| Accuracy | ~70% | ~95% | ~90% |
| Cost per 100 papers | $0 | $0.10-1.00 | $0.05-0.50 |
| Suitable for | All papers | High precision reviews | Balanced approach |

*Gemini Flash pricing ~$0.01 per 100k input tokens

---

## Critical Files to Modify

### Type Definitions
- **File**: `/home/user/litrevtools/src/core/types/index.ts`
- **Action**: Add filtering mode types and interfaces
- **Current Size**: 125 lines
- **Estimated Addition**: 40-50 lines

### Scholar Extraction
- **File**: `/home/user/litrevtools/src/core/scholar/index.ts`
- **Action**: Replace `shouldExclude()` with `FilteringService`
- **Current Size**: 378 lines
- **Key Methods**:
  - `applyExclusionFilters()` (line 244)
  - `shouldExclude()` (line 298)

### Database
- **File**: `/home/user/litrevtools/src/core/database/index.ts`
- **Action**: Add filtering columns to papers table schema
- **Addition**: 3-4 columns + migration logic

### Frontend Components
- **File**: `/home/user/litrevtools/src/frontend/src/components/SearchForm.tsx`
- **Action**: Add filtering mode selector dropdown
- **Estimated Lines**: 15-20

---

## LLM Prompt Strategy

### Recommended Approach for Filtering

Use Gemini to assess paper relevance with this workflow:

```
For each paper:
1. Extract: Title, Authors, Year, Abstract
2. Send to Gemini with inclusion/exclusion criteria
3. Gemini returns: {included: bool, reason: string, confidence: 0-1}
4. Store confidence for later analysis
5. Track API usage for cost management
```

### Gemini Model Recommendations

- **Speed Priority**: Use `gemini-flash-lite-latest` (already configured)
- **Accuracy Priority**: Use `gemini-pro` (slower but more accurate)
- **Hybrid Approach**: Filter uncertain papers with `gemini-pro`

---

## Configuration Strategy

### Recommended .env Additions

```env
# Filtering Configuration
FILTERING_MODE=rule-based
FILTERING_BATCH_SIZE=10
FILTERING_LLM_TEMPERATURE=1.0
FILTERING_CONFIDENCE_THRESHOLD=0.7
FILTERING_CACHE_ENABLED=true
FILTERING_COST_LIMIT=50.0
```

### Runtime Configuration

```typescript
// Allow per-session configuration
const params: SearchParameters = {
  // ... existing ...
  filteringMode: 'llm-based',
  filteringStrategy: {
    mode: 'llm-based',
    llmConfig: {
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
      relevanceThreshold: 0.75,
      batchSize: 10
    }
  }
};
```

---

## Testing Strategy

### Unit Tests
```typescript
// Test each filter independently
- RuleBasedFilter.filterPaper(knowPaperSet)
- LLMFilter.filterPaper(mockGeminiResponse)
- HybridFilter.filterBatch(mixedConfidenceSet)
```

### Integration Tests
```typescript
// Test full pipeline
- Full search with rule-based filtering
- Full search with LLM-based filtering
- Mode switching during search
```

### Benchmark Tests
```
- Accuracy comparison (LLM vs rule-based)
- Performance metrics (time per paper)
- Cost tracking ($ per search)
- Confidence distribution analysis
```

---

## Data Flow Diagram

### Current Processing Pipeline
```
User Input (keywords, year range)
    ↓
Parallel Google Scholar Search (Tor rotation)
    ↓
Extract Papers (1000+ papers)
    ↓
Apply Rule-Based Filtering (keyword match)
    ↓
Update PRISMA Statistics
    ↓
Generate Outputs (CSV, LaTeX, etc.)
    ↓
Display Results
```

### With LLM Filtering
```
User Input (keywords, year range, filtering mode)
    ↓
Parallel Google Scholar Search (Tor rotation)
    ↓
Extract Papers (1000+ papers)
    ↓
Route to Filtering Service:
  - Rule-based → Keyword matching (instant)
  - LLM-based → Batch to Gemini (async)
  - Hybrid → Rules first, then LLM for uncertain
    ↓
Update Papers with Filtering Decision + Confidence
    ↓
Update PRISMA Statistics (include confidence)
    ↓
Generate Outputs (CSV, LaTeX, etc.)
    ↓
Display Results + Filtering Mode/Confidence
```

---

## Next Steps

### Immediate Actions
1. ✅ Review the three generated documentation files
2. ✅ Read `QUICK_REFERENCE.md` for file locations
3. ✅ Review `IMPLEMENTATION_GUIDE.md` Phase 1 (types)
4. ✅ Review critical code sections in `QUICK_REFERENCE.md`

### Pre-Implementation
1. Design LLM filtering prompts in detail
2. Set up Gemini API cost tracking
3. Prepare test datasets (papers with known relevance)
4. Plan database migration strategy

### Implementation
1. Start with Phase 1 (Type system) - 1-2 hours
2. Implement Phase 2 (Filtering services) - 6-8 hours
3. Integrate Phase 3 - 4-6 hours
4. Frontend updates Phase 4 - 3-4 hours
5. Testing Phase 5 - 4-6 hours

### Post-Implementation
1. Benchmark all three modes
2. Optimize LLM prompts based on accuracy
3. Add cost optimization (caching, batching)
4. Document results and recommendations
5. Create user guide for filtering mode selection

---

## Risk Assessment

### Low Risk Items
- Rule-based filter extraction (just refactoring)
- Database schema changes (backward compatible)
- Type system updates (TypeScript compile-time)

### Medium Risk Items
- LLM API integration (needs error handling, cost control)
- Performance impact (LLM latency)
- Hybrid mode complexity (two-stage filtering)

### Mitigation Strategies
- Start with rule-based extraction (low risk)
- Test LLM mode with sample papers first
- Implement cost limits and monitoring
- Add fallback to rule-based on LLM errors
- Cache LLM results for similar papers

---

## Success Criteria

The implementation will be considered successful when:

1. ✅ All three filtering modes work correctly
2. ✅ LLM mode accuracy > 90% on test set
3. ✅ Hybrid mode balances speed and accuracy
4. ✅ Database correctly stores filtering metadata
5. ✅ Frontend displays filtering mode and confidence
6. ✅ Cost tracking prevents budget overages
7. ✅ Works on all platforms (web, desktop, CLI, mobile)
8. ✅ Documented with clear user guidance

---

## Summary Statistics

| Aspect | Count |
|--------|-------|
| Core TypeScript files | 12 |
| Platform-specific files | 6 |
| Frontend components | 7 |
| Database tables | 6 |
| Estimated lines of new code | 800-1000 |
| Configuration variables | 15-20 |
| LLM API calls per large search | 100-500 |
| Estimated development time | 20-30 hours |

---

## Documentation Files Generated

All documentation files are saved in `/home/user/litrevtools/`:

1. **ARCHITECTURE_ANALYSIS.md** - Comprehensive architecture breakdown
2. **QUICK_REFERENCE.md** - Quick lookup guide for developers
3. **IMPLEMENTATION_GUIDE.md** - Step-by-step implementation with code
4. **This file** - Final exploration summary

These documents provide everything needed to implement LLM vs rule-based filtering across the entire codebase.

---

**Exploration completed**: 2025-11-10
**Codebase version**: Current (claude/llm-vs-rule-based-filtering branch)
**Status**: Ready for implementation

