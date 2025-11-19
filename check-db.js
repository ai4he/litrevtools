const Database = require('better-sqlite3');
const db = new Database('./data/litrevtools.db');

const papers = db.prepare(`
  SELECT id, systematic_filtering_inclusion, systematic_filtering_inclusion_reasoning, 
         systematic_filtering_exclusion, systematic_filtering_exclusion_reasoning
  FROM papers 
  WHERE id IN ('diagnosisofautisminc-2024', 'neuralnetworksunveil-2024')
  ORDER BY id
`).all();

console.log(JSON.stringify(papers, null, 2));
db.close();
