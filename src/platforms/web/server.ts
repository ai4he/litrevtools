/**
 * Web Server Platform for LitRevTools
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { LitRevTools, SearchParameters, SearchProgress, Paper, validateParameters, mergeWithDefaults } from '../../core';
import * as path from 'path';
import * as fs from 'fs';
import { verifyGoogleToken, generateJWT, authMiddleware, optionalAuthMiddleware, AuthRequest } from './auth';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.WEB_PORT || 3000;
const HOST = process.env.WEB_HOST || 'localhost';

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for development
}));
app.use(cors());
// Increase body size limit to 50MB for large CSV uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from shared React frontend (if built)
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

// Fallback to old public directory
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.zip') || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP and CSV files are allowed'));
    }
  }
});

// Initialize LitRevTools instance
const litrev = new LitRevTools();

// Active searches map (now just tracks sessionIds)
const activeSearches: Set<string> = new Set();

// Event buffer to store events until client subscribes
const eventBuffer: Map<string, Array<{ event: string; data: any }>> = new Map();

// Track current step status for each session (for reconnection sync)
interface StepStatus {
  step: 1 | 2 | 3;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  progress?: number;
  currentTask?: string;
  lastUpdate: number;
  error?: string;
}
const sessionStepStatus: Map<string, StepStatus> = new Map();

// Helper to update and get step status
const updateStepStatus = (sessionId: string, step: 1 | 2 | 3, status: Partial<StepStatus>) => {
  const current = sessionStepStatus.get(sessionId) || { step, status: 'idle', lastUpdate: Date.now() };
  sessionStepStatus.set(sessionId, {
    ...current,
    step,
    ...status,
    lastUpdate: Date.now(),
  });
};

// REST API Routes

// Authentication Routes

// Google OAuth login
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({ success: false, error: 'Google credential is required' });
      return;
    }

    // Verify Google token
    const user = await verifyGoogleToken(credential);

    // Generate JWT token
    const token = generateJWT(user);

    res.json({
      success: true,
      user,
      token,
    });
  } catch (error: any) {
    console.error('Google login error:', error);
    res.status(401).json({ success: false, error: error.message });
  }
});

// Get current user (supports guest mode)
app.get('/api/auth/me', optionalAuthMiddleware, (req: AuthRequest, res) => {
  // If authenticated via JWT, return the user
  if (req.user) {
    res.json({ success: true, user: req.user });
    return;
  }

  // Check if guest mode header is present (frontend sends this)
  const guestMode = req.headers['x-guest-mode'];
  if (guestMode === 'true') {
    res.json({
      success: true,
      user: {
        id: 'guest',
        email: 'guest@local',
        name: 'Guest User'
      }
    });
    return;
  }

  // Not authenticated and not guest mode
  res.status(401).json({ success: false, error: 'Not authenticated' });
});

// Logout (client-side only, just a placeholder)
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Session Routes (with optional authentication)

// Get all sessions
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = litrev.getAllSessions();
    res.json({ success: true, sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get session by ID
app.get('/api/sessions/:id', (req, res) => {
  try {
    const session = litrev.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }
    res.json({ success: true, session });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current step status for a session (for reconnection sync)
app.get('/api/sessions/:id/step-status', (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = litrev.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Get the tracked step status
    const stepStatus = sessionStepStatus.get(sessionId);

    // Also check if there's an active search
    const isSearching = activeSearches.has(sessionId);

    res.json({
      success: true,
      stepStatus: stepStatus || null,
      isSearching,
      // Include session progress for additional context
      sessionProgress: session.progress,
      sessionStatus: session.progress.status,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Project Routes
// ============================================================================

// Get all projects
app.get('/api/projects', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const projects = projectManager.getAllProjects();
    res.json({ success: true, projects });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get project by ID
app.get('/api/projects/:id', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const project = projectManager.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, project });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get project with steps populated
app.get('/api/projects/:id/with-steps', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const project = projectManager.getProjectWithSteps(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, project });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get project progress
app.get('/api/projects/:id/progress', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const progress = projectManager.getProjectProgress(req.params.id);
    if (!progress) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, progress });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new project
app.post('/api/projects', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: 'Project name is required' });
      return;
    }

    const projectManager = litrev.getProjectManager();
    const projectId = projectManager.createProject({ name, description });
    const project = projectManager.getProject(projectId);

    res.json({ success: true, project });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update project
app.put('/api/projects/:id', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const { name, description, status } = req.body;

    projectManager.updateProject(req.params.id, { name, description, status });
    const project = projectManager.getProject(req.params.id);

    res.json({ success: true, project });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    projectManager.deleteProject(req.params.id);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pause project
app.post('/api/projects/:id/pause', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    projectManager.pauseProject(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resume project
app.post('/api/projects/:id/resume', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    projectManager.resumeProject(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop project
app.post('/api/projects/:id/stop', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    projectManager.stopProject(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Step 1 for a project
app.post('/api/projects/:id/start-step1', async (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const parameters = req.body;

    // Validate parameters (reuse existing validation)
    const validation = validateParameters(mergeWithDefaults(parameters));
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        errors: validation.errors
      });
      return;
    }

    const sessionId = await projectManager.startStep1(req.params.id, parameters);
    res.json({ success: true, sessionId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Step 2 for a project
app.post('/api/projects/:id/start-step2', async (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const { inclusionPrompt, exclusionPrompt, batchSize, model } = req.body;

    const sessionId = await projectManager.startStep2(
      req.params.id,
      { inclusionPrompt, exclusionPrompt, batchSize, model }
    );

    res.json({ success: true, sessionId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Step 3 for a project
app.post('/api/projects/:id/start-step3', async (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const { dataSource, model, batchSize, latexPrompt } = req.body;

    const sessionId = await projectManager.startStep3(
      req.params.id,
      { dataSource, model, batchSize, latexPrompt }
    );

    res.json({ success: true, sessionId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark a step as complete
app.post('/api/projects/:id/complete-step/:step', (req, res) => {
  try {
    const projectManager = litrev.getProjectManager();
    const projectId = req.params.id;
    const step = parseInt(req.params.step);
    const { sessionId } = req.body;

    if (![1, 2, 3].includes(step)) {
      res.status(400).json({ success: false, error: 'Invalid step number' });
      return;
    }

    // Mark step complete (and link sessionId if provided)
    projectManager.markStepComplete(projectId, step as 1 | 2 | 3, sessionId);

    console.log(`[Server] Marked Step ${step} as complete for project: ${projectId}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start a new search
app.post('/api/search/start', optionalAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    // Merge with defaults and validate using centralized schema
    const params = mergeWithDefaults(req.body);
    const validation = validateParameters(params);

    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        errors: validation.errors
      });
      return;
    }

    // Helper function to emit or buffer events
    const emitOrBuffer = (sid: string, event: string, data: any) => {
      const eventName = `${event}:${sid}`;
      const room = io.sockets.adapter.rooms.get(`session:${sid}`);

      if (room && room.size > 0) {
        // Client is subscribed, emit to room
        console.log(`[Server] Emitting ${eventName} to ${room.size} subscribed clients`);
        io.to(`session:${sid}`).emit(eventName, data);
      } else {
        // Client not subscribed yet, buffer the event
        console.log(`[Server] Buffering ${eventName} (no subscribers yet)`);
        if (!eventBuffer.has(sid)) {
          eventBuffer.set(sid, []);
        }
        eventBuffer.get(sid)!.push({ event: eventName, data });
      }
    };

    // Start search with WebSocket callbacks that receive sessionId as parameter
    // This returns the sessionId immediately and runs the search in the background
    const sessionId = await litrev.startSearch(params, {
      onProgress: (progress: SearchProgress, sid: string) => {
        emitOrBuffer(sid, 'progress', progress);

        // Update step status for reconnection sync
        updateStepStatus(sid, 1, {
          status: progress.status as any,
          progress: progress.progress,
          currentTask: progress.currentTask || `Step 1: ${progress.status}`,
        });

        if (progress.status === 'completed' || progress.status === 'error') {
          // Clean up
          activeSearches.delete(sid);
          // Note: Do not auto-generate outputs - user must explicitly trigger Step 3
        }
      },
      onPaper: (paper: Paper, sid: string) => {
        emitOrBuffer(sid, 'paper', paper);
      },
      onError: (error: Error, sid: string) => {
        emitOrBuffer(sid, 'error', { message: error.message });
        updateStepStatus(sid, 1, { status: 'error', error: error.message });
      }
    });

    activeSearches.add(sessionId);

    // Return immediately with the sessionId (search continues in background)
    res.json({ success: true, sessionId });
  } catch (error: any) {
    console.error('Error starting search:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pause search
app.post('/api/search/:id/pause', (req, res) => {
  if (!activeSearches.has(req.params.id)) {
    res.status(404).json({ success: false, error: 'Search not found or already completed' });
    return;
  }

  litrev.pauseSearch();
  res.json({ success: true });
});

// Resume search
app.post('/api/search/:id/resume', (req, res) => {
  if (!activeSearches.has(req.params.id)) {
    res.status(404).json({ success: false, error: 'Search not found or already completed' });
    return;
  }

  litrev.resumeSearch();
  res.json({ success: true });
});

// Stop search
app.post('/api/search/:id/stop', (req, res) => {
  if (!activeSearches.has(req.params.id)) {
    res.status(404).json({ success: false, error: 'Search not found or already completed' });
    return;
  }

  litrev.stopSearch();
  activeSearches.delete(req.params.id);
  res.json({ success: true });
});

// Pause semantic filtering (Step 2)
app.post('/api/sessions/:id/semantic-filter/pause', (req, res) => {
  litrev.pauseSemanticFiltering();
  res.json({ success: true });
});

// Resume semantic filtering (Step 2)
app.post('/api/sessions/:id/semantic-filter/resume', (req, res) => {
  litrev.resumeSemanticFiltering();
  res.json({ success: true });
});

// Stop semantic filtering (Step 2)
app.post('/api/sessions/:id/semantic-filter/stop', (req, res) => {
  litrev.stopSemanticFiltering();
  res.json({ success: true });
});

// Pause output generation (Step 3)
app.post('/api/sessions/:id/generate/pause', (req, res) => {
  litrev.pauseOutputGeneration();
  res.json({ success: true });
});

// Resume output generation (Step 3)
app.post('/api/sessions/:id/generate/resume', (req, res) => {
  litrev.resumeOutputGeneration();
  res.json({ success: true });
});

// Stop output generation (Step 3)
app.post('/api/sessions/:id/generate/stop', (req, res) => {
  litrev.stopOutputGeneration();
  res.json({ success: true });
});

// Generate outputs (async with WebSocket progress)
app.post('/api/sessions/:id/generate', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { dataSource, model, batchSize, latexPrompt } = req.body; // Extract new parameters
    const session = litrev.getSession(sessionId);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Validate data source
    const validDataSources = ['step1', 'step2', 'current', undefined];
    if (dataSource && !validDataSources.includes(dataSource)) {
      res.status(400).json({ success: false, error: 'Invalid data source. Must be "step1", "step2", or omitted for current.' });
      return;
    }

    // Helper function to emit or buffer events
    const emitOrBuffer = (sid: string, event: string, data: any) => {
      const eventName = `${event}:${sid}`;
      const room = io.sockets.adapter.rooms.get(`session:${sid}`);

      if (room && room.size > 0) {
        // Client is subscribed, emit to room
        console.log(`[Server] Emitting ${eventName} to ${room.size} subscribed clients`);
        io.to(`session:${sid}`).emit(eventName, data);
      } else {
        // Client not subscribed yet, buffer the event
        console.log(`[Server] Buffering ${eventName} (no subscribers yet)`);
        if (!eventBuffer.has(sid)) {
          eventBuffer.set(sid, []);
        }
        eventBuffer.get(sid)!.push({ event: eventName, data });
      }
    };

    // Return immediately - generation happens in background
    res.json({ success: true, message: 'Output generation started' });

    // Helper to update Step 3 status
    const updateStep3Status = (progress: any) => {
      updateStepStatus(sessionId, 3, {
        status: progress.status === 'completed' ? 'completed' : progress.status === 'error' ? 'error' : 'running',
        progress: progress.progress,
        currentTask: progress.currentTask,
        error: progress.error,
      });
    };

    // Start generation with progress callbacks
    const generateMethod = dataSource
      ? litrev.generateOutputsWithDataSource(sessionId, dataSource || 'current', (progress) => {
          emitOrBuffer(sessionId, 'output-progress', progress);
          updateStep3Status(progress);

          // When completed, emit the outputs
          if (progress.status === 'completed') {
            const updatedSession = litrev.getSession(sessionId);
            emitOrBuffer(sessionId, 'outputs', updatedSession?.outputs);
          }
        })
      : litrev.generateOutputs(sessionId, (progress) => {
          emitOrBuffer(sessionId, 'output-progress', progress);
          updateStep3Status(progress);

          // When completed, emit the outputs
          if (progress.status === 'completed') {
            const updatedSession = litrev.getSession(sessionId);
            emitOrBuffer(sessionId, 'outputs', updatedSession?.outputs);
          }
        });

    generateMethod.catch((error: any) => {
      console.error('[Server] Output generation failed:', error);
      const errorProgress = {
        status: 'error',
        stage: 'completed',
        currentTask: 'Output generation failed',
        totalStages: 5,
        completedStages: 0,
        error: error.message,
        progress: 0
      };
      emitOrBuffer(sessionId, 'output-progress', errorProgress);
      updateStep3Status(errorProgress);
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Apply semantic filtering with CSV upload
app.post('/api/semantic-filter/csv', async (req, res) => {
  try {
    const { csvContent, inclusionPrompt, exclusionPrompt, batchSize, model } = req.body;

    if (!csvContent || !csvContent.trim()) {
      res.status(400).json({ success: false, error: 'CSV content is required' });
      return;
    }

    // Parse CSV content to create papers
    const papers = await parseCsvToPapers(csvContent);

    if (papers.length === 0) {
      res.status(400).json({ success: false, error: 'No valid papers found in CSV' });
      return;
    }

    // Create a temporary session ID for this upload
    const tempSessionId = `csv-upload-${Date.now()}`;

    // Helper function to emit or buffer events
    const emitOrBuffer = (sid: string, event: string, data: any) => {
      const eventName = `${event}:${sid}`;
      const room = io.sockets.adapter.rooms.get(`session:${sid}`);

      if (room && room.size > 0) {
        io.emit(eventName, data);
      } else {
        if (!eventBuffer.has(sid)) {
          eventBuffer.set(sid, []);
        }
        eventBuffer.get(sid)!.push({ event: eventName, data });
      }
    };

    // Return immediately with temp session ID
    res.json({ success: true, sessionId: tempSessionId, message: 'Semantic filtering started' });

    // Create LLM service and apply filtering
    const { LLMService } = await import('../../core/llm/llm-service');
    const llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite', // Use specified model, env var, or working default
      batchSize: batchSize || 20, // Use configurable batch size, default to 20
      maxConcurrentBatches: 5,
      timeout: 30000,
      retryAttempts: 3,
      temperature: 0.3,
      fallbackStrategy: 'rule_based',
      enableKeyRotation: true
    });

    await llmService.initialize();

    // Apply semantic filtering with progress
    llmService.semanticFilterSeparate(
      papers,
      inclusionPrompt,
      exclusionPrompt,
      (progress) => {
        const overallProgress = (progress.processedPapers / progress.totalPapers) * 100;

        // Build detailed task message with current action
        let taskMessage = progress.currentAction || `Processing ${progress.phase} criteria - Batch ${progress.currentBatch}/${progress.totalBatches}`;

        // Add model info if available
        if (progress.currentModel) {
          taskMessage += ` [${progress.currentModel}]`;
        }

        emitOrBuffer(tempSessionId, 'semantic-filter-progress', {
          status: 'running',
          currentTask: taskMessage,
          progress: overallProgress,
          phase: progress.phase,
          totalPapers: progress.totalPapers,
          processedPapers: progress.processedPapers,
          currentBatch: progress.currentBatch,
          totalBatches: progress.totalBatches,
          timeElapsed: progress.timeElapsed,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          // New detailed status fields
          currentAction: progress.currentAction,
          currentModel: progress.currentModel,
          healthyKeysCount: progress.healthyKeysCount,
          retryCount: progress.retryCount,
          keyRotations: progress.keyRotations,
          modelFallbacks: progress.modelFallbacks
        });
      }
    ).then((filteredPapers) => {
      // Filtering completed
      emitOrBuffer(tempSessionId, 'semantic-filter-progress', {
        status: 'completed',
        currentTask: 'Semantic filtering completed!',
        progress: 100,
        phase: 'finalizing',
        totalPapers: filteredPapers.length,
        processedPapers: filteredPapers.length,
        currentBatch: 0,
        totalBatches: 0
      });

      emitOrBuffer(tempSessionId, 'semantic-filter-complete', {
        sessionId: tempSessionId,
        papers: filteredPapers
      });
    }).catch((error: any) => {
      console.error('[Server] CSV semantic filtering failed:', error);
      emitOrBuffer(tempSessionId, 'semantic-filter-progress', {
        status: 'error',
        currentTask: 'Semantic filtering failed',
        progress: 0,
        phase: 'finalizing',
        error: error.message,
        totalPapers: papers.length,
        processedPapers: 0,
        currentBatch: 0,
        totalBatches: 0
      });
    });

  } catch (error: any) {
    console.error('[Server] CSV upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate outputs from CSV upload
app.post('/api/generate/csv', async (req, res) => {
  try {
    console.log('[CSV Upload] ========== NEW CSV UPLOAD REQUEST ==========');
    const { csvContent, model, batchSize, latexPrompt } = req.body;
    console.log('[CSV Upload] Request params:', {
      csvLength: csvContent?.length,
      model,
      batchSize,
      hasLatexPrompt: !!latexPrompt
    });

    if (!csvContent || !csvContent.trim()) {
      console.log('[CSV Upload] ERROR: No CSV content provided');
      res.status(400).json({ success: false, error: 'CSV content is required' });
      return;
    }

    // Parse CSV content to create papers
    console.log('[CSV Upload] Step 1: Parsing CSV content...');
    const papers = await parseCsvToPapers(csvContent);
    console.log('[CSV Upload] Step 1 Complete: Parsed', papers.length, 'papers from CSV');

    if (papers.length === 0) {
      console.log('[CSV Upload] ERROR: No valid papers found in CSV');
      res.status(400).json({ success: false, error: 'No valid papers found in CSV' });
      return;
    }

    // Create a temporary session ID for this upload
    const tempSessionId = `csv-upload-${Date.now()}`;
    console.log('[CSV Upload] Step 2: Created temp session ID:', tempSessionId);

    // Helper function to emit or buffer events
    const emitOrBuffer = (sid: string, event: string, data: any) => {
      const eventName = `${event}:${sid}`;
      const room = io.sockets.adapter.rooms.get(`session:${sid}`);

      if (room && room.size > 0) {
        console.log(`[CSV Upload] Emitting ${eventName} to ${room.size} connected clients`);
        io.to(`session:${sid}`).emit(eventName, data);
      } else {
        console.log(`[CSV Upload] Buffering ${eventName} (no clients subscribed yet)`);
        if (!eventBuffer.has(sid)) {
          eventBuffer.set(sid, []);
        }
        eventBuffer.get(sid)!.push({ event: eventName, data });
      }
    };

    // Return immediately with temp session ID
    console.log('[CSV Upload] Step 3: Returning temp session ID to client');
    res.json({ success: true, sessionId: tempSessionId, message: 'Output generation started' });

    // Create a session in the database with the papers
    console.log('[CSV Upload] Step 4: Creating session in database...');
    const sessionParams = {
      name: `CSV Upload - ${new Date().toLocaleString()}`,
      inclusionKeywords: ['csv', 'upload'],
      exclusionKeywords: [],
      maxResults: papers.length,
      startYear: Math.min(...papers.map(p => p.year)),
      endYear: Math.max(...papers.map(p => p.year)),
      llmConfig: {
        enabled: true,
        provider: 'gemini' as const,
        model: model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
        batchSize: batchSize || 15,
        maxConcurrentBatches: 5,
        timeout: 30000,
        retryAttempts: 3,
        temperature: 0.3,
        fallbackStrategy: 'rule_based' as const,
        enableKeyRotation: true
      }
    };

    // Create the session using the database directly
    const { LitRevDatabase } = await import('../../core/database');
    const dbPath = process.env.DATABASE_PATH || './data/litrevtools.db';
    const db = new LitRevDatabase(dbPath);

    // Create session
    const actualSessionId = db.createSession(sessionParams);
    console.log('[CSV Upload] Step 4 Complete: Created session', actualSessionId);

    // Copy session ID from temp to actual
    console.log(`[CSV Upload] Mapping: temp ID ${tempSessionId} -> actual ID ${actualSessionId}`);

    // Add all papers to the session
    console.log('[CSV Upload] Step 5: Adding papers to session...');
    for (const paper of papers) {
      db.addPaper(actualSessionId, paper);
    }
    console.log(`[CSV Upload] Step 5 Complete: Added ${papers.length} papers to session`);

    // Use the actual session ID for generation
    const sessionIdToUse = actualSessionId;

    // Update session status to completed so generateOutputs uses generateAll instead of generateIncremental
    console.log('[CSV Upload] Step 6: Setting session status to completed...');
    const session = db.getSession(sessionIdToUse);
    if (session) {
      db.updateProgress(sessionIdToUse, {
        ...session.progress,
        status: 'completed',
        progress: 100
      });
      console.log('[CSV Upload] Step 6 Complete: Session status set to completed');
    }

    // Start output generation with progress
    console.log('[CSV Upload] Step 7: Starting output generation...');
    litrev.generateOutputs(sessionIdToUse, (progress) => {
      console.log('[CSV Upload] Progress callback received:', {
        status: progress.status,
        stage: progress.stage,
        progress: progress.progress,
        currentTask: progress.currentTask?.substring(0, 50)
      });

      // Emit to both temp and actual session ID (for client compatibility)
      emitOrBuffer(tempSessionId, 'output-progress', progress);
      emitOrBuffer(sessionIdToUse, 'output-progress', progress);

      // When completed, emit the outputs
      if (progress.status === 'completed') {
        console.log('[CSV Upload] Generation completed! Sending outputs to client.');
        const updatedSession = litrev.getSession(sessionIdToUse);
        emitOrBuffer(tempSessionId, 'outputs', updatedSession?.outputs);
        emitOrBuffer(sessionIdToUse, 'outputs', updatedSession?.outputs);
      }
    }).catch((error: any) => {
      console.error('[CSV Upload] ERROR during output generation:', error);
      emitOrBuffer(tempSessionId, 'output-progress', {
        status: 'error',
        stage: 'error',
        currentTask: 'Output generation failed',
        progress: 0,
        error: error.message
      });
      emitOrBuffer(sessionIdToUse, 'output-progress', {
        status: 'error',
        stage: 'error',
        currentTask: 'Output generation failed',
        progress: 0,
        error: error.message
      });
    });

  } catch (error: any) {
    console.error('[Server] CSV output generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to parse CSV content to papers
async function parseCsvToPapers(csvContent: string): Promise<Paper[]> {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // Use parseCsvLine for headers too, to handle quoted headers properly
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  console.log('[CSV Parser] Headers found:', headers);
  console.log('[CSV Parser] Has "Included" column:', headers.includes('Included'));

  const papers: Paper[] = [];
  let includedCount = 0;
  let excludedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCsvLine(lines[i]);
      const paper: any = {};

      headers.forEach((header, index) => {
        if (values[index] !== undefined) {
          paper[header] = values[index];
        }
      });

      // Determine inclusion status - check multiple possible values
      const includedValue = paper.Included || paper.included || '';
      const isIncluded = includedValue === 'Yes' || includedValue === '1' || includedValue === 'true' || includedValue === 'True' || includedValue === 'TRUE';

      if (isIncluded) {
        includedCount++;
      } else {
        excludedCount++;
      }

      // Log first few papers for debugging
      if (i <= 3) {
        console.log(`[CSV Parser] Paper ${i}: Included raw value = "${includedValue}", parsed as: ${isIncluded}`);
      }

      // Map CSV columns to Paper interface
      papers.push({
        id: paper.ID || paper.id || `paper-${i}`,
        title: paper.Title || paper.title || 'Untitled',
        authors: paper.Authors ? paper.Authors.split(';').map((a: string) => a.trim()) : [],
        year: parseInt(paper.Year || paper.year) || new Date().getFullYear(),
        abstract: paper.Abstract || paper.abstract || '',
        url: paper.URL || paper.url || '',
        citations: parseInt(paper.Citations || paper.citations) || 0,
        doi: paper.DOI || paper.doi,
        venue: paper.Venue || paper.venue,
        source: (paper.Source || paper.source || 'other') as 'semantic-scholar' | 'other',
        included: isIncluded,
        exclusionReason: paper['Exclusion Reason'] || paper.exclusionReason,
        excluded_by_keyword: paper['Excluded by Keyword'] === 'Yes' || paper['Excluded by Keyword'] === '1',
        extractedAt: new Date()
      });
    } catch (error) {
      console.error(`Error parsing line ${i}:`, error);
    }
  }

  console.log(`[CSV Parser] Parsing complete: ${papers.length} total papers, ${includedCount} included, ${excludedCount} excluded`);

  return papers;
}

// Helper to parse a CSV line handling quoted values
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  values.push(currentValue.trim());
  return values;
}

// Apply semantic filtering to a session
app.post('/api/sessions/:id/semantic-filter', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { inclusionPrompt, exclusionPrompt, batchSize, model } = req.body;

    const session = litrev.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Helper function to emit or buffer events
    const emitOrBuffer = (sid: string, event: string, data: any) => {
      const eventName = `${event}:${sid}`;
      const room = io.sockets.adapter.rooms.get(`session:${sid}`);

      if (room && room.size > 0) {
        // Client is subscribed, emit to room
        console.log(`[Server] Emitting ${eventName} to ${room.size} subscribed clients`);
        io.to(`session:${sid}`).emit(eventName, data);
      } else {
        // Client not subscribed yet, buffer the event
        console.log(`[Server] Buffering ${eventName} (no subscribers yet)`);
        if (!eventBuffer.has(sid)) {
          eventBuffer.set(sid, []);
        }
        eventBuffer.get(sid)!.push({ event: eventName, data });
      }
    };

    // Return immediately - filtering happens in background
    res.json({ success: true, message: 'Semantic filtering started' });

    // Start semantic filtering with progress callbacks
    litrev.applySemanticFiltering(
      sessionId,
      inclusionPrompt,
      exclusionPrompt,
      (progress) => {
        // Transform LLM progress to frontend format
        const totalStages = 2; // inclusion + exclusion (or just 1 if only one is provided)
        const completedStages = progress.phase === 'inclusion' ? 0 : progress.phase === 'exclusion' ? 1 : 2;
        const overallProgress = (progress.processedPapers / progress.totalPapers) * 100;

        const progressData = {
          status: 'running',
          currentTask: `Processing ${progress.phase} criteria - Batch ${progress.currentBatch}/${progress.totalBatches}`,
          progress: overallProgress,
          phase: progress.phase,
          totalPapers: progress.totalPapers,
          processedPapers: progress.processedPapers,
          currentBatch: progress.currentBatch,
          totalBatches: progress.totalBatches,
          timeElapsed: progress.timeElapsed,
          estimatedTimeRemaining: progress.estimatedTimeRemaining
        };

        emitOrBuffer(sessionId, 'semantic-filter-progress', progressData);

        // Update step status for reconnection sync
        updateStepStatus(sessionId, 2, {
          status: 'running',
          progress: overallProgress,
          currentTask: progressData.currentTask,
        });
      },
      batchSize, // Pass the configurable batch size
      model // Pass the model selection
    ).then(async () => {
      // Filtering completed successfully
      emitOrBuffer(sessionId, 'semantic-filter-progress', {
        status: 'completed',
        currentTask: 'Semantic filtering completed!',
        progress: 100,
        phase: 'finalizing',
        totalPapers: session.papers.length,
        processedPapers: session.papers.length,
        currentBatch: 0,
        totalBatches: 0
      });

      // Update step status for reconnection sync
      updateStepStatus(sessionId, 2, {
        status: 'completed',
        progress: 100,
        currentTask: 'Semantic filtering completed!',
      });

      // Emit completion event immediately so download button appears
      // Note: CSV download works from the papers data, no file regeneration needed
      const updatedSession = litrev.getSession(sessionId);
      console.log(`[Server] Emitting semantic-filter-complete for session ${sessionId} with ${updatedSession?.papers.length} papers`);
      emitOrBuffer(sessionId, 'semantic-filter-complete', {
        sessionId,
        papers: updatedSession?.papers
      });
      console.log(`[Server] semantic-filter-complete event emitted - download button should appear immediately`);
    }).catch((error: any) => {
      console.error('[Server] Semantic filtering failed:', error);
      emitOrBuffer(sessionId, 'semantic-filter-progress', {
        status: 'error',
        currentTask: 'Semantic filtering failed',
        progress: 0,
        phase: 'finalizing',
        error: error.message,
        totalPapers: session.papers.length,
        processedPapers: 0,
        currentBatch: 0,
        totalBatches: 0
      });

      // Update step status for reconnection sync
      updateStepStatus(sessionId, 2, {
        status: 'error',
        progress: 0,
        currentTask: 'Semantic filtering failed',
        error: error.message,
      });
    });

  } catch (error: any) {
    console.error('[Server] Semantic filtering error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate PRISMA paper
app.post('/api/sessions/:id/prisma-paper', async (req, res) => {
  try {
    const content = await litrev.generatePRISMAPaper(req.params.id);
    res.json({ success: true, content });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download output file
app.get('/api/sessions/:id/download/:type', (req, res) => {
  try {
    const session = litrev.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const { type } = req.params;
    let filePath: string | undefined;

    switch (type) {
      case 'csv':
        filePath = session.outputs.csv;
        break;
      case 'bibtex':
        filePath = session.outputs.bibtex;
        break;
      case 'latex':
        filePath = session.outputs.latex;
        break;
      case 'zip':
        filePath = session.outputs.zip;
        break;
      default:
        res.status(400).json({ success: false, error: 'Invalid file type' });
        return;
    }

    if (!filePath) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    res.download(filePath);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download progress ZIP for Step 1
app.get('/api/sessions/:id/download/progress-zip/step1', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = litrev.getSession(sessionId);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Generate progress ZIP (lastOffset should be tracked in session or passed as query param)
    const lastOffset = parseInt(req.query.lastOffset as string) || 0;
    const zipPath = await litrev.generateStep1ProgressZip(sessionId, lastOffset);

    res.download(zipPath, `step1-progress-${sessionId}.zip`);
  } catch (error: any) {
    console.error('[Server] Error generating Step 1 progress ZIP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download progress ZIP for Step 2
app.post('/api/sessions/:id/download/progress-zip/step2', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { inclusionPrompt, exclusionPrompt, batchSize, model, progress } = req.body;

    const session = litrev.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const zipPath = await litrev.generateStep2ProgressZip(
      sessionId,
      { inclusionPrompt, exclusionPrompt, batchSize, model },
      progress
    );

    res.download(zipPath, `step2-progress-${sessionId}.zip`);
  } catch (error: any) {
    console.error('[Server] Error generating Step 2 progress ZIP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download progress ZIP for Step 3
app.post('/api/sessions/:id/download/progress-zip/step3', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { parameters, progress, completedOutputs } = req.body;

    const session = litrev.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const zipPath = await litrev.generateStep3ProgressZip(
      sessionId,
      parameters,
      progress,
      completedOutputs
    );

    res.download(zipPath, `step3-progress-${sessionId}.zip`);
  } catch (error: any) {
    console.error('[Server] Error generating Step 3 progress ZIP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resume from ZIP file (multipart upload)
app.post('/api/resume-from-zip', upload.single('zipFile'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No ZIP file provided' });
      return;
    }

    const zipPath = req.file.path;
    const stepNumber = parseInt(req.body.step) || 0;

    console.log(`[Server] Resume request for Step ${stepNumber} from ZIP: ${zipPath}`);

    let newSessionId: string;

    switch (stepNumber) {
      case 1:
        newSessionId = await litrev.resumeStep1FromZip(zipPath);
        break;
      case 2:
        newSessionId = await litrev.resumeStep2FromZip(zipPath);
        break;
      case 3:
        newSessionId = await litrev.resumeStep3FromZip(zipPath);
        break;
      default:
        res.status(400).json({ success: false, error: 'Invalid step number' });
        return;
    }

    res.json({ success: true, sessionId: newSessionId });
  } catch (error: any) {
    console.error('[Server] Error resuming from ZIP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebSocket connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Subscribe to session updates
  socket.on('subscribe', (sessionId: string) => {
    console.log(`Client ${socket.id} subscribing to session: ${sessionId}`);
    socket.join(`session:${sessionId}`);

    // Replay buffered events if any
    if (eventBuffer.has(sessionId)) {
      const bufferedEvents = eventBuffer.get(sessionId)!;
      console.log(`Replaying ${bufferedEvents.length} buffered events for session ${sessionId}`);

      // Send each buffered event to the client
      bufferedEvents.forEach(({ event, data }, index) => {
        console.log(`Replay event ${index}: ${event}`, JSON.stringify(data).substring(0, 200));
        socket.emit(event, data);
      });

      // Clear the buffer after replay
      eventBuffer.delete(sessionId);
    }
  });

  // Unsubscribe from session updates
  socket.on('unsubscribe', (sessionId: string) => {
    socket.leave(`session:${sessionId}`);
  });
});

// Get application configuration (for frontend)
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    config: {
      debugMode: process.env.DEBUG_MODE === 'true'
    }
  });
});

// Usage statistics endpoint
app.get('/api/usage-stats', (req, res) => {
  try {
    const { UsageTracker } = require('../../core/llm/usage-tracker');

    const allStats = UsageTracker.getAllUsageStats();
    const dailySummary = UsageTracker.getDailySummary();
    const historicalData = UsageTracker.getHistoricalData();

    res.json({
      success: true,
      data: {
        currentDay: dailySummary.date,
        totalRequests: dailySummary.totalRequests,
        totalTokens: dailySummary.totalTokens,
        byModel: dailySummary.byModel,
        byKey: dailySummary.byKey,
        detailedStats: allStats,
        historical: historicalData
      }
    });
  } catch (error: any) {
    console.error('Failed to get usage stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard monitoring endpoint - comprehensive overview
app.get('/api/monitoring/dashboard', (req, res) => {
  try {
    const { UsageTracker } = require('../../core/llm/usage-tracker');
    const projectManager = litrev.getProjectManager();

    // Get usage data
    const dailySummary = UsageTracker.getDailySummary();
    const historicalData = UsageTracker.getHistoricalData();
    const allUsageStats = UsageTracker.getAllUsageStats();

    // Get all projects and find active ones
    const allProjects = projectManager.getAllProjects();

    // Collect active sessions (steps currently running)
    const activeSteps: Array<{
      projectId: string;
      projectName: string;
      sessionId: string;
      step: 1 | 2 | 3;
      status: string;
      progress: number;
      currentTask: string;
      startedAt: number;
    }> = [];

    // Check each project for active steps
    for (const project of allProjects) {
      // Check step status for each session
      for (const [sessionId, stepStatus] of sessionStepStatus.entries()) {
        // Find which project this session belongs to
        if (
          project.step1_session_id === sessionId ||
          project.step2_session_id === sessionId ||
          project.step3_session_id === sessionId
        ) {
          if (stepStatus.status === 'running') {
            activeSteps.push({
              projectId: project.id,
              projectName: project.name,
              sessionId,
              step: stepStatus.step,
              status: stepStatus.status,
              progress: stepStatus.progress || 0,
              currentTask: stepStatus.currentTask || '',
              startedAt: stepStatus.lastUpdate
            });
          }
        }
      }

      // Also check activeSearches for Step 1
      if (project.step1_session_id && activeSearches.has(project.step1_session_id)) {
        const existingActive = activeSteps.find(s => s.sessionId === project.step1_session_id);
        if (!existingActive) {
          const session = litrev.getSession(project.step1_session_id);
          if (session && session.progress.status === 'running') {
            activeSteps.push({
              projectId: project.id,
              projectName: project.name,
              sessionId: project.step1_session_id,
              step: 1,
              status: 'running',
              progress: session.progress.progress || 0,
              currentTask: session.progress.currentTask || 'Searching...',
              startedAt: Date.now()
            });
          }
        }
      }
    }

    // Calculate summary stats
    const totalProjectsActive = allProjects.filter(p => p.status === 'active').length;
    const totalProjectsCompleted = allProjects.filter(p => p.status === 'completed').length;

    res.json({
      success: true,
      data: {
        // Active operations
        activeSteps,
        activeStepsCount: activeSteps.length,

        // Project summary
        projects: {
          total: allProjects.length,
          active: totalProjectsActive,
          completed: totalProjectsCompleted,
          paused: allProjects.filter(p => p.status === 'paused').length,
          error: allProjects.filter(p => p.status === 'error').length
        },

        // Current usage
        currentUsage: {
          date: dailySummary.date,
          totalRequests: dailySummary.totalRequests,
          totalTokens: dailySummary.totalTokens,
          byModel: dailySummary.byModel,
          byKey: dailySummary.byKey
        },

        // Historical usage (7 days)
        historicalUsage: historicalData,

        // Detailed usage stats (for model breakdown)
        detailedStats: allUsageStats.map((stat: any) => ({
          keyLabel: stat.keyLabel,
          apiKeyMasked: stat.apiKeyMasked,
          model: stat.model,
          requestCount: stat.requestCount,
          tokenCount: stat.tokenCount,
          lastUsed: stat.lastUsed
        })),

        // Server uptime
        serverInfo: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error: any) {
    console.error('Failed to get monitoring dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Serve React app for all non-API routes (SPA fallback) - MUST BE LAST
app.get('*', (req, res) => {
  // Shared React app (used by web, desktop, mobile)
  const reactIndexPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
  const publicIndexPath = path.join(__dirname, 'public', 'index.html');

  // Check if React app exists, otherwise fallback to old public HTML
  const fs = require('fs');
  if (fs.existsSync(reactIndexPath)) {
    res.sendFile(reactIndexPath);
  } else if (fs.existsSync(publicIndexPath)) {
    res.sendFile(publicIndexPath);
  } else {
    res.status(404).send('Frontend not found');
  }
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🌐 LitRevTools Web Server running at http://${HOST}:${PORT}`);
  console.log(`📊 API available at http://${HOST}:${PORT}/api`);
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  litrev.close();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
