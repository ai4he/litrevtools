/**
 * Database module using SQLite for portable, efficient storage
 */

import Database from 'better-sqlite3';
import { Paper, SearchSession, SearchProgress, SearchParameters, PRISMAData, OutputFiles } from '../types';
import * as path from 'path';
import * as fs from 'fs';

export class LitRevDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT,
        inclusion_keywords TEXT NOT NULL,
        exclusion_keywords TEXT NOT NULL,
        max_results INTEGER,
        start_year INTEGER,
        end_year INTEGER,
        status TEXT NOT NULL,
        current_task TEXT,
        next_task TEXT,
        total_papers INTEGER DEFAULT 0,
        processed_papers INTEGER DEFAULT 0,
        included_papers INTEGER DEFAULT 0,
        excluded_papers INTEGER DEFAULT 0,
        time_elapsed INTEGER DEFAULT 0,
        estimated_time_remaining INTEGER,
        progress INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Papers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        authors TEXT NOT NULL,
        year INTEGER NOT NULL,
        abstract TEXT,
        url TEXT NOT NULL,
        citations INTEGER,
        source TEXT NOT NULL,
        pdf_url TEXT,
        venue TEXT,
        doi TEXT,
        keywords TEXT,
        extracted_at TEXT NOT NULL,
        included INTEGER NOT NULL DEFAULT 1,
        exclusion_reason TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // PRISMA data table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prisma_data (
        session_id TEXT PRIMARY KEY,
        records_identified INTEGER DEFAULT 0,
        records_removed INTEGER DEFAULT 0,
        records_screened INTEGER DEFAULT 0,
        records_excluded INTEGER DEFAULT 0,
        reasons_for_exclusion TEXT,
        studies_included INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // Output files table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS output_files (
        session_id TEXT PRIMARY KEY,
        csv_path TEXT,
        bibtex_path TEXT,
        latex_path TEXT,
        prisma_diagram_path TEXT,
        prisma_table_path TEXT,
        zip_path TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // Screenshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS screenshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        screenshot_data TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // Create indices for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_papers_session ON papers(session_id);
      CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
      CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
    `);
  }

  // Session operations
  createSession(parameters: SearchParameters): string {
    const id = this.generateId();
    const now = new Date().toISOString();

    const name = parameters.name || this.generateSearchName(parameters);

    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, name, inclusion_keywords, exclusion_keywords, max_results,
        start_year, end_year, status, current_task, next_task,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      name,
      JSON.stringify(parameters.inclusionKeywords),
      JSON.stringify(parameters.exclusionKeywords),
      parameters.maxResults || null,
      parameters.startYear || null,
      parameters.endYear || null,
      'idle',
      'Initializing search',
      'Starting Google Scholar extraction',
      now,
      now
    );

    // Initialize PRISMA data
    this.db.prepare(`
      INSERT INTO prisma_data (session_id, reasons_for_exclusion)
      VALUES (?, ?)
    `).run(id, JSON.stringify({}));

    // Initialize output files
    this.db.prepare(`
      INSERT INTO output_files (session_id) VALUES (?)
    `).run(id);

    return id;
  }

  updateProgress(sessionId: string, progress: Partial<SearchProgress>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (progress.status) {
      fields.push('status = ?');
      values.push(progress.status);
    }
    if (progress.currentTask) {
      fields.push('current_task = ?');
      values.push(progress.currentTask);
    }
    if (progress.nextTask) {
      fields.push('next_task = ?');
      values.push(progress.nextTask);
    }
    if (progress.totalPapers !== undefined) {
      fields.push('total_papers = ?');
      values.push(progress.totalPapers);
    }
    if (progress.processedPapers !== undefined) {
      fields.push('processed_papers = ?');
      values.push(progress.processedPapers);
    }
    if (progress.includedPapers !== undefined) {
      fields.push('included_papers = ?');
      values.push(progress.includedPapers);
    }
    if (progress.excludedPapers !== undefined) {
      fields.push('excluded_papers = ?');
      values.push(progress.excludedPapers);
    }
    if (progress.timeElapsed !== undefined) {
      fields.push('time_elapsed = ?');
      values.push(progress.timeElapsed);
    }
    if (progress.estimatedTimeRemaining !== undefined) {
      fields.push('estimated_time_remaining = ?');
      values.push(progress.estimatedTimeRemaining);
    }
    if (progress.progress !== undefined) {
      fields.push('progress = ?');
      values.push(progress.progress);
    }
    if (progress.error) {
      fields.push('error = ?');
      values.push(progress.error);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(sessionId);

    const sql = `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);

    // Store screenshot if provided
    if (progress.screenshot) {
      this.addScreenshot(sessionId, progress.screenshot);
    }
  }

  addPaper(sessionId: string, paper: Paper): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO papers (
        id, session_id, title, authors, year, abstract, url, citations,
        source, pdf_url, venue, doi, keywords, extracted_at, included,
        exclusion_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      paper.id,
      sessionId,
      paper.title,
      JSON.stringify(paper.authors),
      paper.year,
      paper.abstract || null,
      paper.url,
      paper.citations || null,
      paper.source,
      paper.pdfUrl || null,
      paper.venue || null,
      paper.doi || null,
      paper.keywords ? JSON.stringify(paper.keywords) : null,
      paper.extractedAt.toISOString(),
      paper.included ? 1 : 0,
      paper.exclusionReason || null
    );

    // Update session counts
    this.db.prepare(`
      UPDATE sessions SET
        total_papers = (SELECT COUNT(*) FROM papers WHERE session_id = ?),
        included_papers = (SELECT COUNT(*) FROM papers WHERE session_id = ? AND included = 1),
        excluded_papers = (SELECT COUNT(*) FROM papers WHERE session_id = ? AND included = 0),
        updated_at = ?
      WHERE id = ?
    `).run(sessionId, sessionId, sessionId, new Date().toISOString(), sessionId);
  }

  getPapers(sessionId: string): Paper[] {
    const rows = this.db.prepare(`
      SELECT * FROM papers WHERE session_id = ? ORDER BY year DESC, title ASC
    `).all(sessionId) as any[];

    return rows.map(row => this.rowToPaper(row));
  }

  getSession(sessionId: string): SearchSession | null {
    const sessionRow = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(sessionId) as any;

    if (!sessionRow) return null;

    const papers = this.getPapers(sessionId);
    const prismaData = this.getPRISMAData(sessionId);
    const outputs = this.getOutputFiles(sessionId);
    const latestScreenshot = this.getLatestScreenshot(sessionId);

    return {
      id: sessionRow.id,
      parameters: {
        name: sessionRow.name,
        inclusionKeywords: JSON.parse(sessionRow.inclusion_keywords),
        exclusionKeywords: JSON.parse(sessionRow.exclusion_keywords),
        maxResults: sessionRow.max_results,
        startYear: sessionRow.start_year,
        endYear: sessionRow.end_year
      },
      progress: {
        status: sessionRow.status,
        currentTask: sessionRow.current_task,
        nextTask: sessionRow.next_task,
        totalPapers: sessionRow.total_papers,
        processedPapers: sessionRow.processed_papers,
        includedPapers: sessionRow.included_papers,
        excludedPapers: sessionRow.excluded_papers,
        timeElapsed: sessionRow.time_elapsed,
        estimatedTimeRemaining: sessionRow.estimated_time_remaining,
        progress: sessionRow.progress,
        error: sessionRow.error,
        screenshot: latestScreenshot
      },
      papers,
      prismaData,
      outputs,
      createdAt: new Date(sessionRow.created_at),
      updatedAt: new Date(sessionRow.updated_at)
    };
  }

  getAllSessions(): SearchSession[] {
    const rows = this.db.prepare(`
      SELECT id FROM sessions ORDER BY created_at DESC
    `).all() as any[];

    return rows.map(row => this.getSession(row.id)).filter(s => s !== null) as SearchSession[];
  }

  updatePRISMAData(sessionId: string, data: Partial<PRISMAData>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.identification) {
      if (data.identification.recordsIdentified !== undefined) {
        fields.push('records_identified = ?');
        values.push(data.identification.recordsIdentified);
      }
      if (data.identification.recordsRemoved !== undefined) {
        fields.push('records_removed = ?');
        values.push(data.identification.recordsRemoved);
      }
    }

    if (data.screening) {
      if (data.screening.recordsScreened !== undefined) {
        fields.push('records_screened = ?');
        values.push(data.screening.recordsScreened);
      }
      if (data.screening.recordsExcluded !== undefined) {
        fields.push('records_excluded = ?');
        values.push(data.screening.recordsExcluded);
      }
      if (data.screening.reasonsForExclusion) {
        fields.push('reasons_for_exclusion = ?');
        values.push(JSON.stringify(data.screening.reasonsForExclusion));
      }
    }

    if (data.included) {
      if (data.included.studiesIncluded !== undefined) {
        fields.push('studies_included = ?');
        values.push(data.included.studiesIncluded);
      }
    }

    if (fields.length === 0) return;

    values.push(sessionId);
    const sql = `UPDATE prisma_data SET ${fields.join(', ')} WHERE session_id = ?`;
    this.db.prepare(sql).run(...values);
  }

  updateOutputFiles(sessionId: string, outputs: Partial<OutputFiles>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (outputs.csv) {
      fields.push('csv_path = ?');
      values.push(outputs.csv);
    }
    if (outputs.bibtex) {
      fields.push('bibtex_path = ?');
      values.push(outputs.bibtex);
    }
    if (outputs.latex) {
      fields.push('latex_path = ?');
      values.push(outputs.latex);
    }
    if (outputs.prismaDiagram) {
      fields.push('prisma_diagram_path = ?');
      values.push(outputs.prismaDiagram);
    }
    if (outputs.prismaTable) {
      fields.push('prisma_table_path = ?');
      values.push(outputs.prismaTable);
    }
    if (outputs.zip) {
      fields.push('zip_path = ?');
      values.push(outputs.zip);
    }

    if (fields.length === 0) return;

    values.push(sessionId);
    const sql = `UPDATE output_files SET ${fields.join(', ')} WHERE session_id = ?`;
    this.db.prepare(sql).run(...values);
  }

  private getPRISMAData(sessionId: string): PRISMAData {
    const row = this.db.prepare(`
      SELECT * FROM prisma_data WHERE session_id = ?
    `).get(sessionId) as any;

    if (!row) {
      return {
        identification: { recordsIdentified: 0, recordsRemoved: 0 },
        screening: { recordsScreened: 0, recordsExcluded: 0, reasonsForExclusion: {} },
        included: { studiesIncluded: 0 }
      };
    }

    return {
      identification: {
        recordsIdentified: row.records_identified,
        recordsRemoved: row.records_removed
      },
      screening: {
        recordsScreened: row.records_screened,
        recordsExcluded: row.records_excluded,
        reasonsForExclusion: JSON.parse(row.reasons_for_exclusion || '{}')
      },
      included: {
        studiesIncluded: row.studies_included
      }
    };
  }

  private getOutputFiles(sessionId: string): OutputFiles {
    const row = this.db.prepare(`
      SELECT * FROM output_files WHERE session_id = ?
    `).get(sessionId) as any;

    if (!row) return {};

    return {
      csv: row.csv_path,
      bibtex: row.bibtex_path,
      latex: row.latex_path,
      prismaDiagram: row.prisma_diagram_path,
      prismaTable: row.prisma_table_path,
      zip: row.zip_path
    };
  }

  private addScreenshot(sessionId: string, screenshot: string): void {
    // Keep only the latest 10 screenshots per session
    this.db.prepare(`
      DELETE FROM screenshots
      WHERE session_id = ? AND id NOT IN (
        SELECT id FROM screenshots
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT 10
      )
    `).run(sessionId, sessionId);

    this.db.prepare(`
      INSERT INTO screenshots (session_id, screenshot_data, timestamp)
      VALUES (?, ?, ?)
    `).run(sessionId, screenshot, new Date().toISOString());
  }

  private getLatestScreenshot(sessionId: string): string | undefined {
    const row = this.db.prepare(`
      SELECT screenshot_data FROM screenshots
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(sessionId) as any;

    return row?.screenshot_data;
  }

  private rowToPaper(row: any): Paper {
    return {
      id: row.id,
      title: row.title,
      authors: JSON.parse(row.authors),
      year: row.year,
      abstract: row.abstract,
      url: row.url,
      citations: row.citations,
      source: row.source,
      pdfUrl: row.pdf_url,
      venue: row.venue,
      doi: row.doi,
      keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
      extractedAt: new Date(row.extracted_at),
      included: row.included === 1,
      exclusionReason: row.exclusion_reason
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSearchName(parameters: SearchParameters): string {
    const keywords = parameters.inclusionKeywords.slice(0, 3).join(', ');
    const date = new Date().toISOString().split('T')[0];
    return `${keywords} (${date})`;
  }

  close(): void {
    this.db.close();
  }
}
