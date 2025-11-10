const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'litrevtools.db');
const db = new Database(dbPath);

try {
  console.log('Adding duplicate_count column to sessions table...');
  db.exec('ALTER TABLE sessions ADD COLUMN duplicate_count INTEGER DEFAULT 0;');
  console.log('✅ Column added successfully!');
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('✅ Column already exists');
  } else {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
} finally {
  db.close();
}
