const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'litrevtools.db');
const db = new Database(dbPath);

try {
  // Get the most recent session
  const session = db.prepare(`
    SELECT * FROM sessions
    ORDER BY created_at DESC
    LIMIT 1
  `).get();

  console.log('Most recent session:');
  console.log(JSON.stringify(session, null, 2));

  if (session) {
    // Get papers for this session
    const papers = db.prepare(`
      SELECT COUNT(*) as count FROM papers
      WHERE session_id = ?
    `).get(session.id);

    console.log('\nPapers count:', papers.count);

    // Get a sample of papers
    const samplePapers = db.prepare(`
      SELECT * FROM papers
      WHERE session_id = ?
      LIMIT 5
    `).all(session.id);

    console.log('\nSample papers:');
    console.log(JSON.stringify(samplePapers, null, 2));
  }
} catch (error) {
  console.error('Error:', error.message);
} finally {
  db.close();
}
