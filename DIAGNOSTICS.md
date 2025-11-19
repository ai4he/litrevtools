# LitRevTools Diagnostics Guide

## Quick Health Check

To run a comprehensive diagnostic test of your LitRevTools installation:

```bash
npm run cli diagnose
# or
node dist/platforms/cli/index.js diagnose
```

## What the Diagnostic Tests

The `diagnose` command runs four comprehensive checks:

### 1. **Configuration Check** 📋
- Verifies API keys are configured
- Shows number of Gemini API keys available
- Displays masked key prefixes for verification
- Shows database path and model settings
- Shows batch size configuration

### 2. **LLM Service Health Check** 🤖
- Creates a test session with 3 sample papers
- Runs actual batch processing with inclusion/exclusion criteria
- Tests API key health and rotation
- Validates batch processing logic
- Shows processing time and efficiency
- Verifies results match expected outcomes

**Expected Result:**
- 2 papers included (novel ML healthcare papers)
- 1 paper excluded (survey paper)
- Detailed reasoning provided for each decision

### 3. **Database Check** 💾
- Verifies database is accessible
- Shows total sessions and papers
- Lists recent sessions

### 4. **System Summary** 📊
- Overall health status
- Recommendations if issues detected

## Command Options

```bash
# Full diagnostic (recommended)
npm run cli diagnose

# Skip API test (configuration check only)
npm run cli diagnose --skip-api-test

# Short alias
npm run cli test
```

## Example Output

```
🔬 LitRevTools System Diagnostics
================================================================================

📋 1. Configuration Check
  Gemini API Keys: 22 configured
  ✓ API keys found
  Database Path: ./data/litrevtools.db
  Default Model: gemini-2.5-flash-lite
  Batch Size: 15 papers per batch

🤖 2. LLM Service Health Check
  Creating test session...
  Inserting 3 test papers...
  ✓ Test papers inserted
  Running batch processing test...
  ✓ Batch processing completed
    Time: 54.3s

  Results:
    Total papers: 3
    Included: 2
    Excluded: 1

  ✓ Test PASSED: Results match expected outcome

💾 3. Database Check
  Total Sessions: 124
  Total Papers: 2888
  ✓ Database accessible

📊 4. System Summary
  ✓ All systems operational
  System is ready for literature review tasks
```

## Troubleshooting

### No API Keys Configured
```
✗ No API keys configured
Set GEMINI_API_KEYS environment variable
```

**Solution:** Add API keys to your `.env` file:
```bash
GEMINI_API_KEYS=key1,key2,key3
```

### Test Failed with Unexpected Results
```
⚠ Test WARNING: Expected 2 included, got 1
(This may indicate LLM reasoning variations)
```

**Solution:** This is usually not critical - LLM reasoning can vary slightly. Run the diagnostic again to verify consistency. If it consistently fails, check:
- API keys are valid
- Network connectivity is stable
- Gemini API quotas are available

### Database Issues
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**Solution:** Ensure the database directory exists:
```bash
mkdir -p ./data
```

## When to Run Diagnostics

Run the diagnostic command:
- **After installation** - Verify everything is set up correctly
- **Before large reviews** - Ensure API keys are healthy
- **After configuration changes** - Validate new settings
- **When debugging issues** - Identify problems quickly
- **After updates** - Verify system integrity

## Integration with CI/CD

You can use the diagnostic command in automated tests:

```bash
# Exit code 0 = success, non-zero = failure
npm run cli diagnose
if [ $? -eq 0 ]; then
  echo "System healthy"
else
  echo "System has issues"
  exit 1
fi
```

## Quick Configuration Check

For a fast configuration check without running API tests:

```bash
npm run cli diagnose --skip-api-test
```

This is useful when you just want to verify:
- Environment variables are set
- Database is accessible
- Configuration looks correct

Without making actual API calls.

## Additional CLI Commands

After verifying health with `diagnose`, you can:

```bash
# View all available parameters
npm run cli params

# List existing sessions
npm run cli list

# View session details
npm run cli view <sessionId>

# Start a new search
npm run cli search -i "machine learning" -e "survey"

# Apply semantic filtering to existing session
npm run cli filter <sessionId>
```

## Support

If diagnostics reveal issues you can't resolve:
1. Check the logs in `.pm2/logs/` (for web server)
2. Review error messages carefully
3. Verify API keys have available quota
4. Check network connectivity
5. Report issues at https://github.com/anthropics/claude-code/issues
