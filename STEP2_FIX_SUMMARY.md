# Step 2 Filtering Fix Summary

## Problem
Step 2 (Systematic Filtering with LLM) was not populating the following fields:
- `Systematic Filtering Inclusion`
- `Systematic Filtering Inclusion Reasoning`
- `Systematic Filtering Exclusion`
- `Systematic Filtering Exclusion Reasoning`

Instead, all rows showed: "Evaluation incomplete - API rate limits reached. Manual review required."

## Root Causes

### 1. Outdated Gemini Model Names
**File**: `src/core/llm/gemini-provider.ts`

The default and fallback model names were outdated and returning 404 errors:
- ✗ `gemini-2.0-flash-exp` (404 - not found)
- ✗ `gemini-1.5-flash` (404 - not found)
- ✗ `gemini-1.5-pro` (404 - not found)

**Fix**: Updated to working models (tested 2025-11-18):
- ✓ `gemini-2.5-flash` (Primary)
- ✓ `gemini-2.5-flash-lite` (Fallback - faster, lighter)

### 2. Missing Database Schema Columns
**File**: `src/core/database/index.ts`

The database schema was missing the systematic filtering columns, so even when the LLM returned results, they couldn't be saved.

**Fix**: Added new columns to the papers table:
- `systematic_filtering_inclusion` (INTEGER)
- `systematic_filtering_inclusion_reasoning` (TEXT)
- `systematic_filtering_exclusion` (INTEGER)
- `systematic_filtering_exclusion_reasoning` (TEXT)

Also added automatic migration for existing databases using `ALTER TABLE` statements.

## Changes Made

### 1. Updated Gemini Provider (`src/core/llm/gemini-provider.ts`)
- Changed default model from `gemini-2.0-flash-exp` to `gemini-2.5-flash`
- Updated fallback models to only working models
- Added comments indicating test date (2025-11-18)

### 2. Updated Database Schema (`src/core/database/index.ts`)
- Added 4 new columns to `papers` table schema
- Added migration logic to update existing databases
- Updated `addPaper()` method to save new fields
- Updated `rowToPaper()` method to read new fields

### 3. Updated Documentation (`CLAUDE.md`)
- Updated default model recommendation to `gemini-2.5-flash-lite`
- Added note about alternative model `gemini-2.5-flash`

## Testing

Created three comprehensive test scripts:

### 1. `test-available-models.js`
Tests which Gemini models are currently available and working.

**Usage**:
```bash
./run-model-test.sh
```

**Results**:
- ✓ `gemini-2.5-flash` works
- ✓ `gemini-2.5-flash-lite` works (faster: 9.8s vs 27s for 5 papers)

### 2. `test-step2-filtering.js`
Tests Step 2 filtering with a small batch (3 papers) without database.

**Usage**:
```bash
node test-step2-filtering.js
```

**Results**: ✓ All papers properly evaluated with all 4 fields populated

### 3. `test-step2-comprehensive.js`
Tests both working models with a larger batch (5 papers).

**Usage**:
```bash
node test-step2-comprehensive.js
```

**Results**: Both models pass all tests

### 4. `test-step2-integration.js`
Full integration test with database read/write operations.

**Usage**:
```bash
node test-step2-integration.js
```

**Results**: ✓ All fields saved to and retrieved from database correctly

## Deployment

The fixes have been deployed to production:
```bash
npm run build
npm run deploy:restart
```

Server status: ✓ Online and running

## Verification

To verify the fix is working in your application:

1. **Start a new search** with Step 2 enabled
2. **Check the CSV export** - it should now have these columns populated:
   - Systematic Filtering Inclusion (true/false)
   - Systematic Filtering Inclusion Reasoning (detailed text)
   - Systematic Filtering Exclusion (true/false)
   - Systematic Filtering Exclusion Reasoning (detailed text)

3. **For existing sessions**: If you have sessions that failed with "API rate limits reached", you may need to re-run Step 2 for those sessions

## Performance

Model performance comparison (tested with 5 papers):
- `gemini-2.5-flash`: 27 seconds (more capable)
- `gemini-2.5-flash-lite`: 9.8 seconds (faster, recommended for most use cases)

With 12 API keys configured, the system can handle batches efficiently with automatic key rotation.

## Notes

- The database migration is automatic - existing databases will have the new columns added on next server start
- Old sessions may still show the error message in their existing data, but new filtering operations will work correctly
- All test scripts are available in the root directory for future verification
- The `.env` file has the correct model configured (`GEMINI_MODEL=gemini-2.5-flash-lite`)
