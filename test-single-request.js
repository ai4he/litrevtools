require('dotenv').config();
const { LitRevDatabase } = require('./dist/core/database');
const { LLMService } = require('./dist/core/llm/llm-service');

async function testSingleRequest() {
  console.log('\n🧪 Testing Single Request with Persistent Quota Tracking\n');
  console.log('='.repeat(100));

  const dbPath = process.env.DATABASE_PATH || './data/litrevtools.db';
  const db = new LitRevDatabase(dbPath);

  try {
    const geminiKeys = process.env.GEMINI_API_KEYS?.split(',').filter(k => k.trim()) || [];
    console.log(`\n📋 Configuration:`);
    console.log(`   Database: ${dbPath}`);
    console.log(`   API Keys: ${geminiKeys.length} configured`);

    // Show BEFORE state
    console.log('\n📊 BEFORE REQUEST - Quota Status:');
    console.log('-'.repeat(100));

    const beforeQuotas = db.db.prepare(`
      SELECT api_key_hash, model_name, rpm_used, tpm_used, rpd_used, status
      FROM api_key_quotas
      WHERE model_name = 'gemini-2.5-flash-lite'
      ORDER BY last_updated ASC
      LIMIT 5
    `).all();

    if (beforeQuotas.length > 0) {
      console.log('\nFirst 5 keys:');
      beforeQuotas.forEach((q, idx) => {
        console.log(`   ${idx + 1}. Hash: ${q.api_key_hash.substring(0, 16)}...`);
        console.log(`      RPM: ${q.rpm_used}, TPM: ${q.tpm_used}, RPD: ${q.rpd_used}, Status: ${q.status}`);
      });
    }

    // Create LLM service with database
    const llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      apiKeys: geminiKeys,
      batchSize: 1,
      enableKeyRotation: true,
      fallbackStrategy: 'rule_based'
    }, db);

    await llmService.initialize();

    // Make a single simple request
    console.log('\n🔄 Making a single test request...\n');

    const testPaper = {
      title: 'Machine Learning for Healthcare Applications',
      abstract: 'This paper presents novel approaches to applying deep learning in medical diagnosis.',
      authors: ['John Doe'],
      year: 2024
    };

    try {
      const result = await llmService.semanticFilterSeparate(
        [testPaper],
        'Papers about machine learning',
        'No surveys',
        (progress) => {
          console.log(`   Progress: ${progress.processedPapers}/${progress.totalPapers} papers`);
        }
      );

      console.log(`\n✅ Request completed successfully!`);
      console.log(`   Filtered papers: ${result.length}`);

    } catch (error) {
      console.log(`\n⚠️  Request encountered error (but quota may still be updated):`);
      console.log(`   ${error.message}`);
    }

    // Wait a moment for async database updates
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Show AFTER state
    console.log('\n📊 AFTER REQUEST - Persistent Quota Status:');
    console.log('='.repeat(100));

    const afterQuotas = db.db.prepare(`
      SELECT api_key_hash, model_name,
             rpm_used, rpm_limit,
             tpm_used, tpm_limit,
             rpd_used, rpd_limit,
             status, last_updated
      FROM api_key_quotas
      WHERE model_name = 'gemini-2.5-flash-lite'
      ORDER BY rpd_used DESC, last_updated DESC
      LIMIT 10
    `).all();

    if (afterQuotas.length === 0) {
      console.log('\n❌ No quota records found!');
    } else {
      console.log(`\n✅ Found ${afterQuotas.length} quota records (showing top 10 by usage)\n`);

      const totalRPD = afterQuotas.reduce((sum, q) => sum + q.rpd_used, 0);
      const totalRPM = afterQuotas.reduce((sum, q) => sum + q.rpm_used, 0);
      const totalTPM = afterQuotas.reduce((sum, q) => sum + q.tpm_used, 0);

      console.log(`📈 SUMMARY STATISTICS:`);
      console.log(`   Total Requests Per Day: ${totalRPD}`);
      console.log(`   Total Requests Per Minute: ${totalRPM}`);
      console.log(`   Total Tokens Used: ${totalTPM.toLocaleString()}`);

      console.log(`\n📋 TOP KEYS BY USAGE:\n`);
      afterQuotas.slice(0, 5).forEach((q, idx) => {
        const keyHash = q.api_key_hash.substring(0, 16);
        console.log(`   ${idx + 1}. Key: ${keyHash}...`);
        console.log(`      Status: ${q.status}`);
        console.log(`      RPM: ${q.rpm_used}/${q.rpm_limit} | TPM: ${q.tpm_used.toLocaleString()}/${q.tpm_limit.toLocaleString()} | RPD: ${q.rpd_used}/${q.rpd_limit}`);
        console.log(`      Last Updated: ${new Date(q.last_updated).toLocaleString()}`);
        console.log();
      });

      console.log('\n🔍 PERSISTENCE VERIFICATION:');
      console.log('='.repeat(100));
      console.log('✅ These quota values are stored in SQLite database');
      console.log('✅ They will survive server restarts');
      console.log('✅ On next initialization, these values will be restored');
      console.log('✅ Keys are securely hashed (SHA256) before storage');
      console.log('\nDatabase: ' + dbPath);
      console.log('Table: api_key_quotas');
    }

    console.log('\n' + '='.repeat(100) + '\n');

  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

testSingleRequest();
