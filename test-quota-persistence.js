require('dotenv').config();
const { LitRevDatabase } = require('./dist/core/database');
const { LLMService } = require('./dist/core/llm/llm-service');

async function testQuotaPersistence() {
  console.log('\n🧪 Testing Persistent Quota Tracking\n');
  console.log('='.repeat(100));

  const dbPath = process.env.DATABASE_PATH || './data/litrevtools.db';
  const db = new LitRevDatabase(dbPath);

  try {
    // Get API keys from environment
    const geminiKeys = process.env.GEMINI_API_KEYS?.split(',').filter(k => k.trim()) || [];
    console.log(`\n📋 Test Configuration:`);
    console.log(`   Database: ${dbPath}`);
    console.log(`   API Keys: ${geminiKeys.length} configured`);

    // Find a session with papers to test
    const sessions = db.getAllSessions();
    let testSession = null;

    for (const session of sessions) {
      const papers = db.getPapers(session.id);
      if (papers.length >= 5) {
        testSession = session;
        break;
      }
    }

    if (!testSession) {
      console.log('\n❌ No sessions with papers found. Please run Step 1 first.');
      return;
    }

    const testPapers = db.getPapers(testSession.id).slice(0, 5);
    console.log(`\n   Test Session: ${testSession.id}`);
    console.log(`   Test Papers: ${testPapers.length} papers (small test)`);

    // Create LLM service with database
    console.log('\n📊 BEFORE TEST - Quota Status:');
    console.log('-'.repeat(100));
    const beforeQuotas = db.db.prepare(`
      SELECT api_key_hash, model_name, rpm_used, tpm_used, rpd_used,
             rpm_limit, tpm_limit, rpd_limit, status, last_updated
      FROM api_key_quotas
      ORDER BY last_updated DESC
      LIMIT 10
    `).all();

    if (beforeQuotas.length === 0) {
      console.log('   No quota records yet (clean state)');
    } else {
      beforeQuotas.forEach(q => {
        console.log(`   Hash: ${q.api_key_hash.substring(0, 16)}... Model: ${q.model_name}`);
        console.log(`   RPM: ${q.rpm_used}/${q.rpm_limit}, TPM: ${q.tpm_used}/${q.tpm_limit}, RPD: ${q.rpd_used}/${q.rpd_limit}`);
        console.log(`   Status: ${q.status}, Updated: ${q.last_updated}`);
        console.log();
      });
    }

    // Run semantic filtering test
    console.log('🔄 Running Semantic Filtering Test...\n');
    const llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      apiKeys: geminiKeys,
      batchSize: 5, // Small batch for testing
      enableKeyRotation: true,
      fallbackStrategy: 'rule_based'
    }, db);

    await llmService.initialize();

    const filteredPapers = await llmService.semanticFilterSeparate(
      testPapers,
      'Papers must focus on machine learning or AI',
      'Review papers are excluded',
      (progress) => {
        console.log(`   Progress: ${progress.processedPapers}/${progress.totalPapers} papers, Batch ${progress.currentBatch}/${progress.totalBatches}`);
      }
    );

    console.log(`\n✅ Test Complete: Processed ${filteredPapers.length} papers\n`);

    // Show AFTER quota status
    console.log('📊 AFTER TEST - Persistent Quota Status:');
    console.log('='.repeat(100));

    const afterQuotas = db.db.prepare(`
      SELECT api_key_hash, model_name,
             rpm_used, rpm_limit, rpm_reset_at,
             tpm_used, tpm_limit, tpm_reset_at,
             rpd_used, rpd_limit, rpd_reset_at,
             status, last_updated
      FROM api_key_quotas
      ORDER BY rpd_used DESC
    `).all();

    if (afterQuotas.length === 0) {
      console.log('❌ No quota records found in database!');
    } else {
      console.log(`\n✅ Found ${afterQuotas.length} quota records in database\n`);

      // Group by model
      const byModel = {};
      afterQuotas.forEach(q => {
        if (!byModel[q.model_name]) byModel[q.model_name] = [];
        byModel[q.model_name].push(q);
      });

      Object.keys(byModel).forEach(model => {
        const quotas = byModel[model];
        console.log(`\n📦 MODEL: ${model}`);
        console.log('-'.repeat(100));
        console.log(`   Keys tracked: ${quotas.length}`);

        // Summary stats
        const totalRPD = quotas.reduce((sum, q) => sum + q.rpd_used, 0);
        const totalRPM = quotas.reduce((sum, q) => sum + q.rpm_used, 0);
        const totalTPM = quotas.reduce((sum, q) => sum + q.tpm_used, 0);
        const activeKeys = quotas.filter(q => q.status === 'active').length;
        const rateLimited = quotas.filter(q => q.status === 'rate_limited').length;

        console.log(`\n   SUMMARY:`);
        console.log(`   ├─ Active Keys: ${activeKeys}`);
        console.log(`   ├─ Rate Limited: ${rateLimited}`);
        console.log(`   ├─ Total RPD Used: ${totalRPD}`);
        console.log(`   ├─ Total RPM Used: ${totalRPM}`);
        console.log(`   └─ Total TPM Used: ${totalTPM}`);

        // Show top 10 most used keys
        console.log(`\n   TOP 10 KEYS BY USAGE:`);
        quotas.slice(0, 10).forEach((q, idx) => {
          const keyHash = q.api_key_hash.substring(0, 16);
          const rpmPct = Math.round((q.rpm_used / q.rpm_limit) * 100);
          const rpdPct = Math.round((q.rpd_used / q.rpd_limit) * 100);

          console.log(`\n   ${idx + 1}. Key: ${keyHash}...`);
          console.log(`      Status: ${q.status}`);
          console.log(`      RPM: ${q.rpm_used}/${q.rpm_limit} (${rpmPct}%) - Resets: ${new Date(q.rpm_reset_at).toLocaleTimeString()}`);
          console.log(`      TPM: ${q.tpm_used.toLocaleString()}/${q.tpm_limit.toLocaleString()}`);
          console.log(`      RPD: ${q.rpd_used}/${q.rpd_limit} (${rpdPct}%) - Resets: ${new Date(q.rpd_reset_at).toLocaleDateString()} ${new Date(q.rpd_reset_at).toLocaleTimeString()}`);
          console.log(`      Last Updated: ${new Date(q.last_updated).toLocaleString()}`);
        });
      });

      // Show persistence verification
      console.log('\n\n🔍 PERSISTENCE VERIFICATION:');
      console.log('='.repeat(100));
      console.log('If you restart the server now, these quota values will be restored from the database.');
      console.log('Keys that have reached their daily limit (RPD) will remain limited until midnight PT.');
      console.log('\nDatabase File: ' + dbPath);
      console.log('Table: api_key_quotas');
      console.log(`Records: ${afterQuotas.length}`);
    }

    console.log('\n' + '='.repeat(100) + '\n');

  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

testQuotaPersistence();
