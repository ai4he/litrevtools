const Database = require('better-sqlite3');
const db = new Database('./data/litrevtools.db');

// Check papers from most recent session
const mostRecent = '1763524203043-yr09u0xo5';
const papers = db.prepare(`
  SELECT id, included, systematic_filtering_inclusion, 
         systematic_filtering_exclusion, systematic_filtering_inclusion_reasoning,
         systematic_filtering_exclusion_reasoning, llm_reasoning
  FROM papers 
  WHERE session_id = ?
`).all(mostRecent);

console.log('Papers from session:', mostRecent);
console.log(JSON.stringify(papers, null, 2));

db.close();
