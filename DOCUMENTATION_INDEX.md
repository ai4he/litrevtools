# LitRevTools Codebase Documentation Index

## Overview

This index provides a guide to all the documentation created during the codebase exploration for implementing LLM vs rule-based filtering.

---

## Documentation Files

### 1. EXPLORATION_SUMMARY.md (12 KB)
**Quick read**: 10 minutes
**Purpose**: High-level overview and executive summary
**Contains**:
- Key findings and architecture strengths
- Current filtering implementation details
- Recommended implementation strategy (5 phases)
- Performance projections
- Risk assessment
- Success criteria

**Best for**: Getting a quick overview before diving deep
**Start here if**: You need to understand the scope and effort

---

### 2. ARCHITECTURE_ANALYSIS.md (15 KB)
**Quick read**: 20 minutes
**Purpose**: Detailed architecture breakdown
**Contains**:
- Project structure and main components
- Existing LLM/AI integration details
- Literature review processing pipeline
- Configuration management system
- API integration patterns
- Architecture recommendations for dual modes
- Key files reference table
- Technology stack
- Critical observations

**Best for**: Understanding the system design
**Start here if**: You need to understand how the system works

---

### 3. QUICK_REFERENCE.md (9.8 KB)
**Quick read**: 15 minutes
**Purpose**: Quick lookup guide for developers
**Contains**:
- File location map (organized by module)
- Critical code sections with line numbers
- Data flow diagrams
- Key interfaces to implement
- Performance baselines table
- Environment configuration examples
- Testing strategy outline

**Best for**: Finding specific files and code sections quickly
**Start here if**: You're developing and need to find code fast

---

### 4. IMPLEMENTATION_GUIDE.md (24 KB)
**Quick read**: 30 minutes for overview, 2-3 hours for detailed study
**Purpose**: Step-by-step implementation instructions
**Contains**:
- Phase 1: Type system updates (with code)
- Phase 2: Filtering service abstraction (complete code examples)
- Phase 3: Integration into ScholarExtractor (code snippets)
- Phase 4: Frontend UI updates (code examples)
- Phase 5: Database schema updates
- Testing checklist
- Deployment checklist

**Best for**: Actually implementing the feature
**Start here if**: You're ready to start coding

---

### 5. PLATFORM_ARCHITECTURE.md (12 KB) [EXISTING]
**Quick read**: 15 minutes
**Purpose**: Overall platform architecture (isomorphic design)
**Contains**:
- Architecture overview
- Platform-specific details
- Build process
- Code sharing benefits
- Future enhancements

**Best for**: Understanding how web, desktop, mobile, and CLI work together
**Note**: This was created in an earlier phase; included for context

---

## Reading Recommendations

### By Role

#### Product Manager
1. Read: EXPLORATION_SUMMARY.md (5 min)
2. Read: Performance Projections section in ARCHITECTURE_ANALYSIS.md
3. Review: Success Criteria in EXPLORATION_SUMMARY.md
**Time needed**: 15 minutes

#### Architect/Tech Lead
1. Read: EXPLORATION_SUMMARY.md (full)
2. Read: ARCHITECTURE_ANALYSIS.md (full)
3. Review: Phase 1 in IMPLEMENTATION_GUIDE.md
**Time needed**: 1 hour

#### Backend Developer
1. Read: QUICK_REFERENCE.md (full)
2. Read: IMPLEMENTATION_GUIDE.md (Phases 1-3)
3. Keep QUICK_REFERENCE.md open while coding
**Time needed**: 2-3 hours preparation, then active development

#### Frontend Developer
1. Read: EXPLORATION_SUMMARY.md (quick overview)
2. Read: IMPLEMENTATION_GUIDE.md Phase 4
3. Reference ARCHITECTURE_ANALYSIS.md section 5 (API patterns)
**Time needed**: 1 hour preparation

#### QA/Tester
1. Read: Testing Strategy sections in all docs
2. Review: Testing Checklist in IMPLEMENTATION_GUIDE.md
3. Review: Success Criteria in EXPLORATION_SUMMARY.md
**Time needed**: 30 minutes

---

## Quick Navigation

### I need to understand...

**...how the current system works**
→ Read: ARCHITECTURE_ANALYSIS.md sections 1-5

**...what the current filtering does**
→ Read: ARCHITECTURE_ANALYSIS.md section 3 + QUICK_REFERENCE.md "Critical Code Sections" section 1

**...where to find specific code**
→ Use: QUICK_REFERENCE.md "File Location Map"

**...how to implement the feature**
→ Read: IMPLEMENTATION_GUIDE.md (all 5 phases)

**...the performance impact**
→ Read: EXPLORATION_SUMMARY.md "Performance Projections" + ARCHITECTURE_ANALYSIS.md section 9

**...what needs to be tested**
→ Read: Testing Checklist in IMPLEMENTATION_GUIDE.md

**...how to deploy this feature**
→ Read: Deployment Checklist in IMPLEMENTATION_GUIDE.md

**...the risks and mitigations**
→ Read: Risk Assessment in EXPLORATION_SUMMARY.md

---

## File Cross-References

### Critical Implementation Locations

| What | File | Lines | Documentation |
|------|------|-------|---|
| Current filtering logic | `src/core/scholar/index.ts` | 244-308 | QUICK_REFERENCE.md §2.1 |
| Paper interface | `src/core/types/index.ts` | 15-31 | QUICK_REFERENCE.md §2.2 |
| SearchParameters | `src/core/types/index.ts` | 6-13 | QUICK_REFERENCE.md §2.3 |
| Database schema | `src/core/database/index.ts` | 52-72 | QUICK_REFERENCE.md §2.4 |
| Gemini integration | `src/core/gemini/index.ts` | 1-362 | ARCHITECTURE_ANALYSIS.md §2 |

### Phase Implementation Files

| Phase | Primary Files | Documentation |
|-------|---------------|---|
| 1: Types | `src/core/types/index.ts` | IMPLEMENTATION_GUIDE.md §1 |
| 2: Filtering | `src/core/filtering/*` (NEW) | IMPLEMENTATION_GUIDE.md §2 |
| 3: Integration | `src/core/scholar/index.ts` | IMPLEMENTATION_GUIDE.md §3 |
| 4: Frontend | `src/frontend/src/components/*` | IMPLEMENTATION_GUIDE.md §4 |
| 5: Database | `src/core/database/index.ts` | IMPLEMENTATION_GUIDE.md §5 |

---

## Key Statistics

### Codebase
- **Total TypeScript files**: 24
- **Core module files**: 12
- **Platform-specific files**: 6
- **Frontend components**: 7
- **Database tables**: 6

### Implementation
- **Estimated effort**: 20-30 developer hours
- **Estimated new code**: 800-1000 lines
- **Number of phases**: 5
- **Configuration variables**: 15-20

### Performance
- **Rule-based speed**: < 1ms per paper
- **LLM-based speed**: 200-500ms per paper
- **Hybrid speed**: 50-100ms avg per paper
- **LLM cost**: $0.10-1.00 per 100 papers

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review EXPLORATION_SUMMARY.md
- [ ] Review ARCHITECTURE_ANALYSIS.md
- [ ] Review IMPLEMENTATION_GUIDE.md Phase 1
- [ ] Set up development environment
- [ ] Create feature branch

### Phase 1: Type System (1-2 hours)
- [ ] Update SearchParameters interface
- [ ] Update Paper interface
- [ ] Add filtering types and interfaces
- [ ] Add FilteringResult and FilteringStats
- [ ] Compile and verify types

### Phase 2: Filtering Service (6-8 hours)
- [ ] Create filtering module directory
- [ ] Implement RuleBasedFilter
- [ ] Implement LLMFilter
- [ ] Implement HybridFilter
- [ ] Implement FilteringServiceFactory
- [ ] Unit test all filters

### Phase 3: Integration (4-6 hours)
- [ ] Update ScholarExtractor
- [ ] Replace shouldExclude() with FilteringService
- [ ] Update database schema
- [ ] Update PRISMA statistics tracking
- [ ] Integration test searches

### Phase 4: Frontend (3-4 hours)
- [ ] Add filtering mode selector to SearchForm
- [ ] Update ProgressDashboard
- [ ] Update PaperList component
- [ ] UI testing

### Phase 5: Testing & Optimization (4-6 hours)
- [ ] Performance benchmarking
- [ ] Accuracy comparison
- [ ] Cost tracking
- [ ] Error handling tests
- [ ] Deployment testing

---

## Common Questions

### Q: Which file has the current filtering logic?
A: `src/core/scholar/index.ts`, lines 244-308 in the `applyExclusionFilters()` method

### Q: Where do I add new types?
A: `src/core/types/index.ts` (Phase 1 of IMPLEMENTATION_GUIDE.md)

### Q: What's the main entry point for searches?
A: `src/core/index.ts` - LitRevTools class, startSearch() method

### Q: How does the frontend talk to the backend?
A: REST API + WebSocket (Socket.IO) - see ARCHITECTURE_ANALYSIS.md section 5

### Q: Where's the Gemini API integration?
A: `src/core/gemini/index.ts` (362 lines)

### Q: How do I test locally?
A: Run `npm run web:dev` for backend and `npm run frontend:dev` for frontend

### Q: What are the main filtering modes?
A: rule-based, llm-based, and hybrid - see EXPLORATION_SUMMARY.md

### Q: How much does LLM filtering cost?
A: ~$0.10-1.00 per 100 papers with Gemini Flash - see Performance Projections

---

## Glossary

- **Rule-Based Filtering**: Keyword substring matching (fast, free, ~70% accurate)
- **LLM-Based Filtering**: AI analysis using Gemini (slow, costs money, ~95% accurate)
- **Hybrid Filtering**: Uses rules first, then LLM for uncertain papers (balanced approach)
- **PRISMA**: Preferred Reporting Items for Systematic Reviews and Meta-Analyses
- **Tor Circuit Rotation**: Changing IP address using Tor to avoid blocking
- **SearchParameters**: Configuration for a literature review search
- **FilteringService**: Interface for filtering papers
- **FilteringResult**: Result of filtering a paper (included/excluded + reason)

---

## Troubleshooting

### I can't find a file mentioned in the docs
→ Check QUICK_REFERENCE.md "File Location Map" for correct paths

### I'm confused about the filtering logic
→ Read QUICK_REFERENCE.md "Critical Code Sections" §2.1 for current implementation

### I need to understand the data flow
→ See "Data Flow Diagrams" in QUICK_REFERENCE.md

### I don't know where to start implementing
→ Start with IMPLEMENTATION_GUIDE.md Phase 1 (Type System)

### I need to know about performance impacts
→ See "Performance Baselines" in QUICK_REFERENCE.md

### I have questions about architecture
→ See ARCHITECTURE_ANALYSIS.md sections 1-6

---

## Support

For specific questions:
1. Search all documentation files (Ctrl+F)
2. Check the Glossary above
3. Review QUICK_REFERENCE.md
4. Check IMPLEMENTATION_GUIDE.md for specific code help

---

## Documentation Metadata

- **Created**: 2025-11-10
- **Exploration scope**: Complete codebase analysis
- **Files analyzed**: 24 TypeScript files + configuration files
- **Documentation version**: 1.0
- **Status**: Ready for implementation

---

**Last updated**: 2025-11-10
**Next step**: Start Phase 1 of IMPLEMENTATION_GUIDE.md
