# API Key Rotation & Management

## Overview

LitRevTools supports automatic API key rotation to handle rate limits and ensure uninterrupted literature review processing. When one API key hits its rate limit or quota, the system automatically switches to the next available key.

## Features

### Automatic Key Rotation
- **Smart Detection**: Automatically detects rate limits (429), quota exceeded, and invalid API keys
- **Seamless Switching**: Rotates to the next available key without interrupting the review
- **Status Tracking**: Monitors each key's status, error count, and usage statistics
- **Recovery**: Keys that were rate-limited become available again after the reset period

### Fallback Strategies
When all API keys are exhausted, you can choose what happens:

1. **Rule-Based Fallback** (Default) - Automatically fall back to traditional keyword matching
2. **Prompt User** - Ask the user to provide a new API key
3. **Fail** - Stop the operation and report an error

## Configuration

### Web Interface

1. **Expand AI-Powered Analysis Section**
2. **Add Multiple API Keys**:
   - Paste each API key and press Enter (or click the + button)
   - Keys are masked for security (shows first 8 and last 4 characters)
   - Remove keys by clicking the X button

3. **Choose Fallback Strategy**:
   - Select from dropdown: "Rule-based", "Prompt for new key", or "Fail"

4. **Enable/Disable Rotation**:
   - Checkbox is automatically enabled when you have 2+ keys
   - Disable to always use the first key

### Programmatic Usage

```typescript
import { ScholarExtractor } from 'litrevtools';
import { LitRevDatabase } from 'litrevtools/database';

const db = new LitRevDatabase('./data.db');
const extractor = new ScholarExtractor(db);

// Configure with multiple API keys
const sessionId = await extractor.startSearch({
  inclusionKeywords: ['machine learning', 'healthcare'],
  exclusionKeywords: ['survey', 'review'],
  llmConfig: {
    enabled: true,
    provider: 'gemini',
    apiKeys: [
      'AIza...key1',
      'AIza...key2',
      'AIza...key3'
    ],
    enableKeyRotation: true,
    fallbackStrategy: 'rule_based', // or 'prompt_user' or 'fail'
    batchSize: 10,
    maxConcurrentBatches: 3,
    timeout: 30000,
    retryAttempts: 3,
    temperature: 0.3
  }
});
```

### Environment Variables

You can also use environment variables for API keys:

```bash
# Single key
export GEMINI_API_KEY="your-key-here"

# Multiple keys (comma-separated)
export GEMINI_API_KEYS="key1,key2,key3"
```

## How It Works

### 1. Key Selection
- System starts with the first active key
- Each request marks the key as used and increments request count

### 2. Error Detection
When a request fails, the system identifies the error type:

| Error Type | Detection | Action |
|------------|-----------|--------|
| **Rate Limit** | "429" or "rate limit" in error | Mark as rate-limited, set 60s recovery timer, rotate immediately |
| **Quota Exceeded** | "quota" or "exceeded" in error | Mark as quota exceeded, rotate immediately |
| **Invalid Key** | "401", "invalid", "unauthorized" | Mark as invalid, rotate immediately |
| **Other Errors** | Generic errors | Increment error count, rotate after 3 consecutive errors |

### 3. Rotation Logic
```
1. Find next key in rotation pool
2. Skip invalid and quota-exceeded keys
3. Check if rate-limited keys have recovered (60s passed)
4. If all keys exhausted → apply fallback strategy
5. If key available → retry the request
```

### 4. Fallback Strategies

**Rule-Based (Default):**
```typescript
// Automatically switches to keyword matching
// No API calls, instant processing
// ~70% accuracy vs ~95% with LLM
```

**Prompt User:**
```typescript
// Calls a user-provided callback function
llmService.setOnKeyExhausted(async () => {
  const newKey = await promptUserForKey();
  return newKey; // Return new key or null to give up
});
```

**Fail:**
```typescript
// Throws an error immediately
// User must handle the error and retry manually
```

## Examples

### Example 1: Basic Rotation with 3 Keys

```typescript
const sessionId = await extractor.startSearch({
  inclusionKeywords: ['deep learning'],
  exclusionKeywords: [],
  llmConfig: {
    enabled: true,
    provider: 'gemini',
    apiKeys: [
      process.env.GEMINI_KEY_1,
      process.env.GEMINI_KEY_2,
      process.env.GEMINI_KEY_3
    ],
    enableKeyRotation: true,
    fallbackStrategy: 'rule_based'
  }
});

// System will:
// 1. Start with key 1
// 2. If key 1 hits rate limit → switch to key 2
// 3. If key 2 hits rate limit → switch to key 3
// 4. If key 3 hits rate limit → fall back to rule-based filtering
```

### Example 2: Dynamic Key Addition

```typescript
import { LLMService } from 'litrevtools/llm';

const llmService = new LLMService({
  enabled: true,
  provider: 'gemini',
  apiKeys: ['initial-key'],
  enableKeyRotation: true,
  fallbackStrategy: 'prompt_user'
});

// Set callback for when keys are exhausted
llmService.setOnKeyExhausted(async () => {
  console.log('All API keys exhausted!');
  const newKey = await getUserInput('Enter a new Gemini API key:');
  return newKey;
});

await llmService.initialize();

// Later: Add more keys dynamically
llmService.addApiKey('new-api-key-here', 'My Additional Key');

// Or remove a key
llmService.removeApiKey('old-key-to-remove');
```

### Example 3: Monitoring Key Status

```typescript
// Get statistics for all keys
const keyStats = llmService.getKeyStatistics();

keyStats.forEach(key => {
  console.log(`Key: ${key.key}`); // Masked: AIza****xyz1
  console.log(`Status: ${key.status}`); // active, rate_limited, invalid, etc.
  console.log(`Requests: ${key.requestCount}`);
  console.log(`Errors: ${key.errorCount}`);
  console.log(`Last Used: ${key.lastUsed}`);

  if (key.rateLimitResetAt) {
    console.log(`Rate Limit Reset: ${key.rateLimitResetAt}`);
  }
});

// Check active key count
const activeCount = llmService.getActiveKeyCount();
console.log(`${activeCount} active keys available`);
```

### Example 4: Manual Recovery

```typescript
// Manually reset all rate-limited keys
// Useful if you know the rate limit period has passed
llmService.resetRateLimitedKeys();

// All keys with status 'rate_limited' will be set to 'active'
```

## Best Practices

### 1. Number of Keys
- **Small Projects (<100 papers)**: 1 key is usually sufficient
- **Medium Projects (100-500 papers)**: 2-3 keys recommended
- **Large Projects (500+ papers)**: 3-5 keys for smooth operation
- **Enterprise**: 5+ keys with staggered quotas

### 2. Key Organization
```typescript
// Label your keys for easier tracking
const llmConfig = {
  apiKeys: [
    { key: 'key1', label: 'Primary - High Quota' },
    { key: 'key2', label: 'Secondary - Backup' },
    { key: 'key3', label: 'Tertiary - Emergency' }
  ]
};
```

### 3. Fallback Strategy Selection

Choose based on your use case:

| Use Case | Recommended Strategy | Reason |
|----------|---------------------|--------|
| **Automated Batch Processing** | `rule_based` | No human intervention needed |
| **Interactive Research** | `prompt_user` | Maintain high accuracy with user input |
| **CI/CD Pipelines** | `fail` | Fail fast and alert on issues |
| **Cost-Sensitive** | `rule_based` | Free fallback option |

### 4. Rate Limit Management

Gemini API Free Tier Limits:
- 60 requests per minute
- 1,500 requests per day

With 100 papers and batch size 10:
- 10 batches needed
- ~20-30 requests total (with retries)
- Completes in <1 minute per key

Strategy:
```typescript
// For large reviews, distribute across multiple keys
const totalPapers = 1000;
const batchSize = 10;
const keysNeeded = Math.ceil(totalPapers / 600); // ~600 papers per key
console.log(`Recommended keys: ${keysNeeded}`);
```

### 5. Error Handling

```typescript
try {
  const sessionId = await extractor.startSearch(params);
  console.log('Search completed successfully');
} catch (error) {
  if (error.message.includes('all keys exhausted')) {
    // All API keys failed
    console.error('All API keys are exhausted or invalid');

    // Option 1: Retry with rule-based
    params.llmConfig.enabled = false;
    const fallbackSession = await extractor.startSearch(params);

    // Option 2: Alert user and wait
    await alertUser('Please add more API keys');
  }
}
```

## Troubleshooting

### All Keys Showing as Rate-Limited

**Cause**: Multiple keys from same Google account hitting combined quota

**Solution**:
1. Use keys from different Google accounts
2. Wait for rate limit reset (usually 60 seconds)
3. Manually reset: `llmService.resetRateLimitedKeys()`

### Keys Not Rotating

**Check**:
```typescript
// 1. Is rotation enabled?
const config = llmService.getConfig();
console.log('Rotation enabled:', config.enableKeyRotation);

// 2. Do you have multiple keys?
const count = llmService.getActiveKeyCount();
console.log('Active keys:', count); // Should be > 1

// 3. Check key status
const stats = llmService.getKeyStatistics();
stats.forEach(k => console.log(k.status));
```

### Rotation Too Aggressive

**Problem**: Switching keys too frequently

**Solution**:
```typescript
// Increase retry attempts before rotation
llmConfig.retryAttempts = 5; // Default is 3

// Or disable rotation for specific task
llmConfig.enableKeyRotation = false;
```

### Want to Force Specific Key

```typescript
// Disable rotation
llmConfig.enableKeyRotation = false;

// Use only first key
llmConfig.apiKey = 'specific-key';
llmConfig.apiKeys = undefined;
```

## Database Storage

API keys and their status are stored in the database:

```sql
-- API Keys table
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  label TEXT,
  status TEXT DEFAULT 'active',
  error_count INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 0,
  last_used TEXT,
  rate_limit_reset_at TEXT,
  created_at TEXT NOT NULL
);
```

Keys are NOT encrypted in the database. **Best Practice**:
- Use environment variables for sensitive keys
- Or implement encryption layer for production use
- Restrict database file permissions

## Security Considerations

1. **Never commit API keys to git**
   ```bash
   # Add to .gitignore
   echo "*.env" >> .gitignore
   echo ".env.local" >> .gitignore
   ```

2. **Use environment variables**
   ```bash
   export GEMINI_API_KEY="your-key"
   # Not: hardcoding in source files
   ```

3. **Rotate keys periodically**
   - Generate new keys monthly
   - Remove old keys from Google Cloud Console

4. **Monitor usage**
   ```typescript
   const stats = llmService.getUsageStats();
   if (stats.totalCost > BUDGET_THRESHOLD) {
     alertAdmin('LLM costs exceeding budget');
   }
   ```

## Advanced: Custom Rotation Logic

For advanced use cases, you can extend the `APIKeyManager`:

```typescript
import { APIKeyManager } from 'litrevtools/llm';

class CustomKeyManager extends APIKeyManager {
  // Override rotation strategy
  async rotateToNextKey(): Promise<void> {
    // Your custom logic
    // E.g., prefer keys with lowest usage
    const sortedKeys = this.keys.sort((a, b) =>
      a.requestCount - b.requestCount
    );

    this.currentKeyIndex = this.keys.indexOf(sortedKeys[0]);
  }
}

// Use custom manager
const customManager = new CustomKeyManager(apiKeys, 'rule_based', true);
// Pass to LLM service...
```

## References

- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Rate Limits and Quotas](https://ai.google.dev/docs/rate_limits)
- [Best Practices for API Keys](https://cloud.google.com/docs/authentication/api-keys)
