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
    // Projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        step1_session_id TEXT,
        step2_session_id TEXT,
        step3_session_id TEXT,
        step1_complete INTEGER NOT NULL DEFAULT 0,
        step2_complete INTEGER NOT NULL DEFAULT 0,
        step3_complete INTEGER NOT NULL DEFAULT 0,
        current_step INTEGER,
        error_message TEXT,
        FOREIGN KEY (step1_session_id) REFERENCES sessions (id) ON DELETE SET NULL,
        FOREIGN KEY (step2_session_id) REFERENCES sessions (id) ON DELETE SET NULL,
        FOREIGN KEY (step3_session_id) REFERENCES sessions (id) ON DELETE SET NULL
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT,
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
        duplicate_count INTEGER DEFAULT 0,
        time_elapsed INTEGER DEFAULT 0,
        estimated_time_remaining INTEGER,
        progress INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
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
        category TEXT,
        llm_confidence REAL,
        llm_reasoning TEXT,
        systematic_filtering_inclusion INTEGER,
        systematic_filtering_inclusion_reasoning TEXT,
        systematic_filtering_exclusion INTEGER,
        systematic_filtering_exclusion_reasoning TEXT,
        all_keywords_present INTEGER,
        keyword_presence_details TEXT,
        missing_keywords TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // Add systematic_filtering columns to existing databases (migration)
    try {
      this.db.exec(`ALTER TABLE papers ADD COLUMN systematic_filtering_inclusion INTEGER`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE papers ADD COLUMN systematic_filtering_inclusion_reasoning TEXT`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE papers ADD COLUMN systematic_filtering_exclusion INTEGER`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE papers ADD COLUMN systematic_filtering_exclusion_reasoning TEXT`);
    } catch (e) {
      // Column already exists
    }

    // Add keyword presence columns to existing databases (migration)
    try {
      this.db.exec(`ALTER TABLE papers ADD COLUMN all_keywords_present INTEGER`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE papers ADD COLUMN keyword_presence_details TEXT`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE papers ADD COLUMN missing_keywords TEXT`);
    } catch (e) {
      // Column already exists
    }

    // Original papers table (stores Step 1 papers before semantic filtering)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS original_papers (
        id TEXT NOT NULL,
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
        category TEXT,
        llm_confidence REAL,
        llm_reasoning TEXT,
        PRIMARY KEY (id, session_id),
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

    // LLM configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_config (
        session_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        provider TEXT NOT NULL DEFAULT 'gemini',
        model TEXT,
        batch_size INTEGER DEFAULT 10,
        max_concurrent_batches INTEGER DEFAULT 3,
        timeout INTEGER DEFAULT 30000,
        retry_attempts INTEGER DEFAULT 3,
        temperature REAL DEFAULT 0.3,
        fallback_strategy TEXT DEFAULT 'rule_based',
        enable_key_rotation INTEGER DEFAULT 1,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // API Keys table (for rotation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        api_key TEXT NOT NULL,
        label TEXT,
        status TEXT DEFAULT 'active',
        error_count INTEGER DEFAULT 0,
        request_count INTEGER DEFAULT 0,
        last_used TEXT,
        rate_limit_reset_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_session ON api_keys(session_id);
    `);

    // Global API Key Quota Tracking (persistent across sessions)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_key_quotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key_hash TEXT NOT NULL,
        model_name TEXT NOT NULL,
        rpm_used INTEGER DEFAULT 0,
        rpm_limit INTEGER DEFAULT 30,
        rpm_reset_at TEXT,
        tpm_used INTEGER DEFAULT 0,
        tpm_limit INTEGER DEFAULT 1000000,
        tpm_reset_at TEXT,
        rpd_used INTEGER DEFAULT 0,
        rpd_limit INTEGER DEFAULT 200,
        rpd_reset_at TEXT,
        status TEXT DEFAULT 'active',
        last_updated TEXT NOT NULL,
        UNIQUE(api_key_hash, model_name)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_api_key_quotas_hash_model ON api_key_quotas(api_key_hash, model_name);
    `);

    // Run migrations for existing databases
    this.runMigrations();

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
      CREATE INDEX IF NOT EXISTS idx_original_papers_session ON original_papers(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
    `);
  }

  private runMigrations(): void {
    // Check if project_id column exists in sessions table
    const sessionsTableInfo = this.db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    const hasProjectId = sessionsTableInfo.some(col => col.name === 'project_id');

    // Add project_id column to sessions table
    if (!hasProjectId) {
      console.log('Adding project_id column to sessions table...');
      this.db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE');
    }

    // Check if category column exists in papers table
    const tableInfo = this.db.prepare("PRAGMA table_info(papers)").all() as Array<{ name: string }>;
    const hasCategory = tableInfo.some(col => col.name === 'category');
    const hasLlmConfidence = tableInfo.some(col => col.name === 'llm_confidence');
    const hasLlmReasoning = tableInfo.some(col => col.name === 'llm_reasoning');

    // Add missing columns to papers table
    if (!hasCategory) {
      console.log('Adding category column to papers table...');
      this.db.exec('ALTER TABLE papers ADD COLUMN category TEXT');
    }
    if (!hasLlmConfidence) {
      console.log('Adding llm_confidence column to papers table...');
      this.db.exec('ALTER TABLE papers ADD COLUMN llm_confidence REAL');
    }
    if (!hasLlmReasoning) {
      console.log('Adding llm_reasoning column to papers table...');
      this.db.exec('ALTER TABLE papers ADD COLUMN llm_reasoning TEXT');
    }

    // Migration: Fix original_papers table primary key (from single id to composite)
    // Check if original_papers table exists and has the old schema
    try {
      const originalPapersInfo = this.db.prepare("PRAGMA table_info(original_papers)").all() as Array<{ name: string, pk: number }>;
      if (originalPapersInfo.length > 0) {
        // Check if only 'id' is the primary key (pk=1 for id, pk=0 for session_id)
        const idPk = originalPapersInfo.find(col => col.name === 'id');
        const sessionIdPk = originalPapersInfo.find(col => col.name === 'session_id');

        if (idPk && idPk.pk > 0 && sessionIdPk && sessionIdPk.pk === 0) {
          console.log('Migrating original_papers table to use composite primary key...');
          // Drop and recreate with new schema
          this.db.exec('DROP TABLE IF EXISTS original_papers');
          this.db.exec(`
            CREATE TABLE original_papers (
              id TEXT NOT NULL,
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
              category TEXT,
              llm_confidence REAL,
              llm_reasoning TEXT,
              PRIMARY KEY (id, session_id),
              FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            )
          `);
          console.log('original_papers table migration completed');
        }
      }
    } catch (error) {
      console.error('Error during original_papers migration:', error);
    }
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

    // Save LLM configuration if provided
    if (parameters.llmConfig) {
      this.saveLLMConfig(id, parameters.llmConfig);
    }

    return id;
  }

  /**
   * Save LLM configuration for a session
   */
  saveLLMConfig(sessionId: string, config: any): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO llm_config (
        session_id, enabled, provider, model, batch_size,
        max_concurrent_batches, timeout, retry_attempts, temperature,
        fallback_strategy, enable_key_rotation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      config.enabled ? 1 : 0,
      config.provider,
      config.model || null,
      config.batchSize,
      config.maxConcurrentBatches,
      config.timeout,
      config.retryAttempts,
      config.temperature,
      config.fallbackStrategy || 'rule_based',
      config.enableKeyRotation ? 1 : 0
    );

    // Save API keys if provided
    if (config.apiKeys && Array.isArray(config.apiKeys)) {
      for (const key of config.apiKeys) {
        this.addApiKey(sessionId, key);
      }
    } else if (config.apiKey) {
      this.addApiKey(sessionId, config.apiKey);
    }
  }

  /**
   * Get LLM configuration for a session
   */
  getLLMConfig(sessionId: string): any | null {
    const row = this.db.prepare(`
      SELECT * FROM llm_config WHERE session_id = ?
    `).get(sessionId) as any;

    if (!row) return null;

    // Get API keys
    const apiKeys = this.getApiKeys(sessionId);

    return {
      enabled: row.enabled === 1,
      provider: row.provider,
      model: row.model,
      batchSize: row.batch_size,
      maxConcurrentBatches: row.max_concurrent_batches,
      timeout: row.timeout,
      retryAttempts: row.retry_attempts,
      temperature: row.temperature,
      fallbackStrategy: row.fallback_strategy || 'rule_based',
      enableKeyRotation: row.enable_key_rotation === 1,
      apiKeys: apiKeys.map(k => k.api_key)
    };
  }

  /**
   * Add an API key to a session
   */
  addApiKey(sessionId: string, apiKey: string, label?: string): void {
    this.db.prepare(`
      INSERT INTO api_keys (session_id, api_key, label, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, apiKey, label || null, new Date().toISOString());
  }

  /**
   * Get all API keys for a session
   */
  getApiKeys(sessionId: string): any[] {
    return this.db.prepare(`
      SELECT * FROM api_keys WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as any[];
  }

  /**
   * Update API key status
   */
  updateApiKeyStatus(sessionId: string, apiKey: string, status: string, errorCount?: number): void {
    const fields: string[] = ['status = ?'];
    const values: any[] = [status];

    if (errorCount !== undefined) {
      fields.push('error_count = ?');
      values.push(errorCount);
    }

    fields.push('last_used = ?');
    values.push(new Date().toISOString());

    values.push(sessionId, apiKey);

    const sql = `UPDATE api_keys SET ${fields.join(', ')} WHERE session_id = ? AND api_key = ?`;
    this.db.prepare(sql).run(...values);
  }

  /**
   * Remove an API key
   */
  removeApiKey(sessionId: string, apiKey: string): void {
    this.db.prepare(`
      DELETE FROM api_keys WHERE session_id = ? AND api_key = ?
    `).run(sessionId, apiKey);
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
    if (progress.duplicateCount !== undefined) {
      fields.push('duplicate_count = ?');
      values.push(progress.duplicateCount);
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
        exclusion_reason, category, llm_confidence, llm_reasoning,
        systematic_filtering_inclusion, systematic_filtering_inclusion_reasoning,
        systematic_filtering_exclusion, systematic_filtering_exclusion_reasoning,
        all_keywords_present, keyword_presence_details, missing_keywords
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      paper.exclusionReason || null,
      paper.category || null,
      paper.llmConfidence || null,
      paper.llmReasoning || null,
      paper.systematic_filtering_inclusion !== undefined ? (paper.systematic_filtering_inclusion ? 1 : 0) : null,
      paper.systematic_filtering_inclusion_reasoning || null,
      paper.systematic_filtering_exclusion !== undefined ? (paper.systematic_filtering_exclusion ? 1 : 0) : null,
      paper.systematic_filtering_exclusion_reasoning || null,
      paper.all_keywords_present !== undefined ? (paper.all_keywords_present ? 1 : 0) : null,
      paper.keyword_presence_details ? JSON.stringify(paper.keyword_presence_details) : null,
      paper.missing_keywords ? JSON.stringify(paper.missing_keywords) : null
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

  getOriginalPapers(sessionId: string): Paper[] {
    const rows = this.db.prepare(`
      SELECT * FROM original_papers WHERE session_id = ? ORDER BY year DESC, title ASC
    `).all(sessionId) as any[];

    return rows.map(row => this.rowToPaper(row));
  }

  setOriginalPapers(sessionId: string, papers: Paper[]): void {
    // Clear existing original papers for this session
    this.db.prepare(`
      DELETE FROM original_papers WHERE session_id = ?
    `).run(sessionId);

    // Insert new original papers
    const stmt = this.db.prepare(`
      INSERT INTO original_papers (
        id, session_id, title, authors, year, abstract, url, citations,
        source, pdf_url, venue, doi, keywords, extracted_at, included,
        exclusion_reason, category, llm_confidence, llm_reasoning
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const paper of papers) {
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
        paper.exclusionReason || null,
        paper.category || null,
        paper.llmConfidence || null,
        paper.llmReasoning || null
      );
    }
  }

  getSession(sessionId: string): SearchSession | null {
    const sessionRow = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(sessionId) as any;

    if (!sessionRow) return null;

    const papers = this.getPapers(sessionId);
    const originalPapers = this.getOriginalPapers(sessionId);
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
        duplicateCount: sessionRow.duplicate_count,
        timeElapsed: sessionRow.time_elapsed,
        estimatedTimeRemaining: sessionRow.estimated_time_remaining,
        progress: sessionRow.progress,
        error: sessionRow.error,
        screenshot: latestScreenshot
      },
      papers,
      originalPapers: originalPapers.length > 0 ? originalPapers : undefined,
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

  // ============================================================================
  // Project Management Methods
  // ============================================================================

  /**
   * Create a new project
   */
  createProject(params: { name: string; description?: string }): string {
    const id = this.generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO projects (
        id, name, description, status, created_at, updated_at,
        step1_complete, step2_complete, step3_complete
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.name,
      params.description || null,
      'active',
      now,
      now,
      0, // step1_complete
      0, // step2_complete
      0  // step3_complete
    );

    return id;
  }

  /**
   * Get a single project by ID
   */
  getProject(projectId: string): any | null {
    const row = this.db.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).get(projectId) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      step1_session_id: row.step1_session_id,
      step2_session_id: row.step2_session_id,
      step3_session_id: row.step3_session_id,
      step1_complete: row.step1_complete === 1,
      step2_complete: row.step2_complete === 1,
      step3_complete: row.step3_complete === 1,
      current_step: row.current_step,
      error_message: row.error_message
    };
  }

  /**
   * Get a project with populated step sessions
   */
  getProjectWithSteps(projectId: string): any | null {
    const project = this.getProject(projectId);
    if (!project) return null;

    const result: any = { ...project };

    if (project.step1_session_id) {
      result.step1 = this.getSession(project.step1_session_id);
    }
    if (project.step2_session_id) {
      result.step2 = this.getSession(project.step2_session_id);
    }
    if (project.step3_session_id) {
      result.step3 = this.getSession(project.step3_session_id);
    }

    return result;
  }

  /**
   * Get all projects
   */
  getAllProjects(): any[] {
    const rows = this.db.prepare(`
      SELECT * FROM projects ORDER BY created_at DESC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      step1_session_id: row.step1_session_id,
      step2_session_id: row.step2_session_id,
      step3_session_id: row.step3_session_id,
      step1_complete: row.step1_complete === 1,
      step2_complete: row.step2_complete === 1,
      step3_complete: row.step3_complete === 1,
      current_step: row.current_step,
      error_message: row.error_message
    }));
  }

  /**
   * Update project metadata
   */
  updateProject(projectId: string, params: { name?: string; description?: string; status?: string }): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (params.name !== undefined) {
      fields.push('name = ?');
      values.push(params.name);
    }
    if (params.description !== undefined) {
      fields.push('description = ?');
      values.push(params.description);
    }
    if (params.status !== undefined) {
      fields.push('status = ?');
      values.push(params.status);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(projectId);

    const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  /**
   * Update project step session ID
   */
  updateProjectStepSession(projectId: string, step: 1 | 2 | 3, sessionId: string): void {
    const field = `step${step}_session_id`;
    this.db.prepare(`
      UPDATE projects SET ${field} = ?, updated_at = ? WHERE id = ?
    `).run(sessionId, new Date().toISOString(), projectId);

    // Update session's project_id
    this.db.prepare(`
      UPDATE sessions SET project_id = ? WHERE id = ?
    `).run(projectId, sessionId);
  }

  /**
   * Mark project step as complete
   */
  markProjectStepComplete(projectId: string, step: 1 | 2 | 3): void {
    const field = `step${step}_complete`;
    this.db.prepare(`
      UPDATE projects SET ${field} = 1, updated_at = ? WHERE id = ?
    `).run(new Date().toISOString(), projectId);
  }

  /**
   * Set project current step
   */
  setProjectCurrentStep(projectId: string, step: 1 | 2 | 3 | null): void {
    this.db.prepare(`
      UPDATE projects SET current_step = ?, updated_at = ? WHERE id = ?
    `).run(step, new Date().toISOString(), projectId);
  }

  /**
   * Set project error
   */
  setProjectError(projectId: string, errorMessage: string): void {
    this.db.prepare(`
      UPDATE projects SET status = 'error', error_message = ?, updated_at = ? WHERE id = ?
    `).run(errorMessage, new Date().toISOString(), projectId);
  }

  /**
   * Delete a project and its associated sessions
   */
  deleteProject(projectId: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    // CASCADE will automatically delete associated sessions
  }

  updatePRISMAData(sessionId: string, data: Partial<PRISMAData>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.identification) {
      if (data.identification.totalRecordsIdentified !== undefined) {
        fields.push('records_identified = ?');
        values.push(data.identification.totalRecordsIdentified);
      }
      if (data.identification.totalRecordsRemoved !== undefined) {
        fields.push('records_removed = ?');
        values.push(data.identification.totalRecordsRemoved);
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
        identification: {
          recordsIdentifiedPerSource: {},
          totalRecordsIdentified: 0,
          duplicatesRemoved: 0,
          recordsMarkedIneligibleByAutomation: 0,
          recordsRemovedForOtherReasons: 0,
          totalRecordsRemoved: 0
        },
        screening: { recordsScreened: 0, recordsExcluded: 0, reasonsForExclusion: {} },
        eligibility: { reportsAssessed: 0, reportsExcluded: 0, reasonsForExclusion: {} },
        included: { studiesIncluded: 0, reportsOfIncludedStudies: 0 }
      };
    }

    return {
      identification: {
        recordsIdentifiedPerSource: {},
        totalRecordsIdentified: row.records_identified || 0,
        duplicatesRemoved: 0,
        recordsMarkedIneligibleByAutomation: 0,
        recordsRemovedForOtherReasons: 0,
        totalRecordsRemoved: row.records_removed || 0
      },
      screening: {
        recordsScreened: row.records_screened,
        recordsExcluded: row.records_excluded,
        reasonsForExclusion: JSON.parse(row.reasons_for_exclusion || '{}')
      },
      eligibility: {
        reportsAssessed: 0,
        reportsExcluded: 0,
        reasonsForExclusion: {}
      },
      included: {
        studiesIncluded: row.studies_included || 0,
        reportsOfIncludedStudies: row.studies_included || 0
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
      exclusionReason: row.exclusion_reason,
      category: row.category,
      llmConfidence: row.llm_confidence,
      llmReasoning: row.llm_reasoning,
      systematic_filtering_inclusion: row.systematic_filtering_inclusion !== null ? (row.systematic_filtering_inclusion === 1) : undefined,
      systematic_filtering_inclusion_reasoning: row.systematic_filtering_inclusion_reasoning,
      systematic_filtering_exclusion: row.systematic_filtering_exclusion !== null ? (row.systematic_filtering_exclusion === 1) : undefined,
      systematic_filtering_exclusion_reasoning: row.systematic_filtering_exclusion_reasoning,
      // Keyword presence fields
      all_keywords_present: row.all_keywords_present !== null ? (row.all_keywords_present === 1) : undefined,
      keyword_presence_details: row.keyword_presence_details ? JSON.parse(row.keyword_presence_details) : undefined,
      missing_keywords: row.missing_keywords ? JSON.parse(row.missing_keywords) : undefined
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

  // ============================================================================
  // Global API Key Quota Tracking (Persistent)
  // ============================================================================

  /**
   * Get or create quota record for an API key + model combination
   */
  getOrCreateQuotaRecord(apiKeyHash: string, modelName: string, quotaLimits: { rpm: number; tpm: number; rpd: number }): any {
    const now = new Date().toISOString();
    const nextMinute = new Date(Date.now() + 60000).toISOString();
    const midnightPT = this.getNextMidnightPT().toISOString();

    // Try to get existing record
    let record = this.db.prepare(`
      SELECT * FROM api_key_quotas WHERE api_key_hash = ? AND model_name = ?
    `).get(apiKeyHash, modelName);

    if (!record) {
      // Create new record
      this.db.prepare(`
        INSERT INTO api_key_quotas (
          api_key_hash, model_name,
          rpm_used, rpm_limit, rpm_reset_at,
          tpm_used, tpm_limit, tpm_reset_at,
          rpd_used, rpd_limit, rpd_reset_at,
          status, last_updated
        ) VALUES (?, ?, 0, ?, ?, 0, ?, ?, 0, ?, ?, 'active', ?)
      `).run(
        apiKeyHash, modelName,
        quotaLimits.rpm, nextMinute,
        quotaLimits.tpm, nextMinute,
        quotaLimits.rpd, midnightPT,
        now
      );

      record = this.db.prepare(`
        SELECT * FROM api_key_quotas WHERE api_key_hash = ? AND model_name = ?
      `).get(apiKeyHash, modelName);
    }

    return record;
  }

  /**
   * Update quota usage for an API key + model combination
   */
  updateQuotaUsage(apiKeyHash: string, modelName: string, tokensUsed: number): void {
    const now = new Date();
    const record = this.db.prepare(`
      SELECT * FROM api_key_quotas WHERE api_key_hash = ? AND model_name = ?
    `).get(apiKeyHash, modelName) as any;

    if (!record) return;

    let rpmUsed = record.rpm_used;
    let tpmUsed = record.tpm_used;
    let rpdUsed = record.rpd_used;
    let rpmResetAt = record.rpm_reset_at;
    let tpmResetAt = record.tpm_reset_at;
    let rpdResetAt = record.rpd_reset_at;

    // Check if RPM/TPM should reset (every minute)
    if (new Date(rpmResetAt) <= now) {
      rpmUsed = 0;
      tpmUsed = 0;
      rpmResetAt = new Date(now.getTime() + 60000).toISOString();
      tpmResetAt = rpmResetAt;
    }

    // Check if RPD should reset (daily at midnight PT)
    if (new Date(rpdResetAt) <= now) {
      rpdUsed = 0;
      rpdResetAt = this.getNextMidnightPT().toISOString();
    }

    // Increment usage
    rpmUsed += 1;
    tpmUsed += tokensUsed;
    rpdUsed += 1;

    this.db.prepare(`
      UPDATE api_key_quotas SET
        rpm_used = ?,
        rpm_reset_at = ?,
        tpm_used = ?,
        tpm_reset_at = ?,
        rpd_used = ?,
        rpd_reset_at = ?,
        last_updated = ?
      WHERE api_key_hash = ? AND model_name = ?
    `).run(rpmUsed, rpmResetAt, tpmUsed, tpmResetAt, rpdUsed, rpdResetAt, now.toISOString(), apiKeyHash, modelName);
  }

  /**
   * Update API key status in quota table
   */
  updateQuotaStatus(apiKeyHash: string, modelName: string, status: string): void {
    this.db.prepare(`
      UPDATE api_key_quotas SET status = ?, last_updated = ?
      WHERE api_key_hash = ? AND model_name = ?
    `).run(status, new Date().toISOString(), apiKeyHash, modelName);
  }

  /**
   * Get next midnight Pacific Time
   */
  private getNextMidnightPT(): Date {
    const now = new Date();
    const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const midnight = new Date(pt);
    midnight.setHours(24, 0, 0, 0);
    const offset = midnight.getTime() - pt.getTime();
    return new Date(now.getTime() + offset);
  }
}
