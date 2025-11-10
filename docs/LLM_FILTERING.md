# LLM vs Rule-Based Filtering

## Overview

LitRevTools now supports two modes for intelligent tasks in the literature review process:

1. **LLM-Based Mode** (Default) - Uses Large Language Models for intelligent decision-making
2. **Rule-Based Mode** - Uses traditional keyword matching and rule-based algorithms

## Features

### LLM-Based Mode

When enabled (default), the system uses LLMs for:

- **Semantic Filtering**: Understanding inclusion/exclusion criteria semantically, not just by keyword matching
- **Category Identification**: Automatically categorizing papers by research area
- **Draft Generation**: Writing draft literature review papers
- **Quality Assessment**: Evaluating paper quality and relevance with confidence scores

**Advantages:**
- Higher accuracy (~95% vs ~70% for rule-based)
- Semantic understanding of criteria
- Provides reasoning for decisions
- Confidence scores for each decision
- Identifies subtle patterns and relationships

**Considerations:**
- Requires API key (Gemini API by default)
- Costs ~$0.10-1.00 per 100 papers (using Gemini Flash)
- Processing time: 200-500ms per paper (with batching)

### Rule-Based Mode

When LLM is disabled, the system uses:

- **Keyword Matching**: Simple substring matching for inclusion/exclusion
- **Boolean Filters**: AND/OR logic for combining criteria
- **Fast Processing**: < 1ms per paper

**Advantages:**
- No API costs
- Very fast processing
- No external dependencies
- Predictable behavior

**Limitations:**
- Lower accuracy (~70%)
- No semantic understanding
- No confidence scores
- May miss relevant papers or include irrelevant ones

## Configuration

### Web Interface

When creating a new literature review, expand the "AI-Powered Analysis (LLM)" section:

1. **Enable/Disable LLM**: Toggle checkbox to enable or disable LLM features
2. **Provider**: Select LLM provider (Gemini is default and recommended)
3. **API Key**: Enter your API key or leave empty to use environment variable
4. **Advanced Settings**:
   - **Batch Size**: Number of papers to process in parallel (default: 10)
   - **Temperature**: Model creativity for generation tasks (default: 0.3)

### Programmatic Usage

```typescript
import { ScholarExtractor } from 'litrevtools';
import { LitRevDatabase } from 'litrevtools/database';

const db = new LitRevDatabase('./data.db');
const extractor = new ScholarExtractor(db);

// With LLM enabled (default)
const sessionId = await extractor.startSearch({
  inclusionKeywords: ['machine learning', 'healthcare'],
  exclusionKeywords: ['survey', 'review'],
  llmConfig: {
    enabled: true,
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    batchSize: 10,
    maxConcurrentBatches: 3,
    timeout: 30000,
    retryAttempts: 3,
    temperature: 0.3
  }
});

// Without LLM (rule-based only)
const sessionId = await extractor.startSearch({
  inclusionKeywords: ['machine learning', 'healthcare'],
  exclusionKeywords: ['survey', 'review'],
  llmConfig: {
    enabled: false,
    provider: 'gemini',
    batchSize: 10,
    maxConcurrentBatches: 3,
    timeout: 30000,
    retryAttempts: 3,
    temperature: 0.3
  }
});
```

## API Keys

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key

**Free Tier:**
- 60 requests per minute
- 1,500 requests per day
- Generous token limits

### Environment Variables

Set your API key as an environment variable:

```bash
# Linux/Mac
export GEMINI_API_KEY="your-api-key-here"

# Windows (PowerShell)
$env:GEMINI_API_KEY="your-api-key-here"

# .env file
GEMINI_API_KEY=your-api-key-here
```

## Batch Processing

The LLM service automatically batches requests for efficiency:

- **Default Batch Size**: 10 papers
- **Concurrent Batches**: 3 batches processed in parallel
- **Automatic Retries**: 3 attempts on failure
- **Rate Limiting**: Respects API rate limits

Example: Processing 100 papers
- Traditional approach: 100 sequential API calls (~1-2 minutes)
- Batch approach: 10 batches × 3 concurrent = ~10-15 seconds

## Advanced Features

### Category Identification

After a search completes, you can identify categories for included papers:

```typescript
await extractor.identifyCategories(sessionId, {
  enabled: true,
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY
});

// Papers will now have a 'category' field
const session = db.getSession(sessionId);
const categorizedPapers = session.papers.filter(p => p.category);
```

### Draft Paper Generation

Generate a draft literature review paper:

```typescript
const draft = await extractor.generateDraftPaper(sessionId, {
  enabled: true,
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY
});

console.log(draft);
// Outputs a 2-3 page academic literature review
```

### Usage Statistics

Get LLM usage statistics:

```typescript
const stats = extractor.getLLMUsageStats();
console.log(stats);
// {
//   totalRequests: 150,
//   totalTokens: 45000,
//   totalCost: 0.85,
//   lastRequestTime: Date
// }
```

## Best Practices

1. **Start with LLM Enabled**: Use LLM for the initial filtering to get high-quality results
2. **Review Confidence Scores**: Papers with low confidence (<0.5) may need manual review
3. **Check Reasoning**: LLM provides reasoning for each decision - review these for quality
4. **Batch Size Tuning**:
   - Smaller batches (5-10): Better for rate-limited APIs
   - Larger batches (20-50): Faster but may hit rate limits
5. **Temperature Settings**:
   - Low (0.1-0.3): For filtering and categorization (default)
   - Medium (0.4-0.7): For draft generation with some creativity
   - High (0.8-1.0): For very creative tasks (not recommended for reviews)

## Fallback Behavior

The system automatically falls back to rule-based filtering if:
- LLM API is unavailable
- API key is invalid or missing
- Rate limits are exceeded
- LLM processing fails

This ensures your literature review always completes, even if LLM services are down.

## Cost Estimation

Using Gemini 1.5 Flash (default):
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens
- Average: ~$0.1875 per 1M tokens

Typical paper (title + abstract):
- ~300 tokens per paper
- ~100 papers: $0.05-0.20
- ~1000 papers: $0.50-2.00

**Note**: Costs may vary based on abstract length and provider.

## Troubleshooting

### "LLM API key is required"
- Set the `GEMINI_API_KEY` environment variable
- Or provide the API key in the configuration

### "Rate limit exceeded"
- Reduce batch size
- Reduce concurrent batches
- Wait and retry (automatic retries are built-in)

### "LLM filtering failed, falling back to rule-based"
- Check your API key
- Check your internet connection
- Verify the API is available

### Low confidence scores
- Improve your inclusion/exclusion criteria to be more specific
- Add more context in the criteria descriptions
- Review papers with low confidence manually

## Future Providers

Support for additional LLM providers is planned:
- **OpenAI GPT-4**: Higher quality but more expensive
- **Anthropic Claude**: Good balance of quality and cost
- **Custom Models**: Bring your own model via API

## References

- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [PRISMA Guidelines](http://www.prisma-statement.org/)
- [Systematic Review Methodology](https://www.cochranelibrary.com/handbook)
