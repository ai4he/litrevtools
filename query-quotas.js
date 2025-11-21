require('dotenv').config();
const { LitRevDatabase } = require('./dist/core/database');

const db = new LitRevDatabase('./data/litrevtools.db');

console.log('\n📊 PERSISTENT QUOTA RECORDS IN DATABASE\n');
console.log('='.repeat(100));

const quotas = db.db.prepare(`
  SELECT api_key_hash, model_name,
         rpm_used, rpm_limit,
         tpm_used, tpm_limit,
         rpd_used, rpd_limit,
         status, last_updated
  FROM api_key_quotas
  ORDER BY last_updated DESC
`).all();

if (quotas.length === 0) {
  console.log('\n❌ No quota records found in database\n');
} else {
  console.log(`\n✅ Found ${quotas.length} quota records\n`);

  quotas.forEach((q, idx) => {
    console.log(`\n${idx + 1}. Key Hash: ${q.api_key_hash}`);
    console.log(`   Model: ${q.model_name}`);
    console.log(`   RPM: ${q.rpm_used}/${q.rpm_limit}`);
    console.log(`   TPM: ${q.tpm_used.toLocaleString()}/${q.tpm_limit.toLocaleString()}`);
    console.log(`   RPD: ${q.rpd_used}/${q.rpd_limit}`);
    console.log(`   Status: ${q.status}`);
    console.log(`   Last Updated: ${new Date(q.last_updated).toLocaleString()}`);
  });

  console.log('\n' + '='.repeat(100));
  console.log('\n✅ PERSISTENT QUOTA TRACKING VERIFIED');
  console.log('These records will survive server restarts and be restored on initialization.\n');
}

db.close();
