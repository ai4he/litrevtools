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
import { LitRevTools, SearchParameters, SearchProgress, Paper, validateParameters, mergeWithDefaults } from '../../core';
import * as path from 'path';
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
app.use(express.json());

// Serve static files from shared React frontend (if built)
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

// Fallback to old public directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize LitRevTools instance
const litrev = new LitRevTools();

// Active searches map (now just tracks sessionIds)
const activeSearches: Set<string> = new Set();

// Event buffer to store events until client subscribes
const eventBuffer: Map<string, Array<{ event: string; data: any }>> = new Map();

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

// Get current user
app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res) => {
  res.json({ success: true, user: req.user });
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

    // Start generation with progress callbacks
    const generateMethod = dataSource
      ? litrev.generateOutputsWithDataSource(sessionId, dataSource || 'current', (progress) => {
          emitOrBuffer(sessionId, 'output-progress', progress);

          // When completed, emit the outputs
          if (progress.status === 'completed') {
            const updatedSession = litrev.getSession(sessionId);
            emitOrBuffer(sessionId, 'outputs', updatedSession?.outputs);
          }
        })
      : litrev.generateOutputs(sessionId, (progress) => {
          emitOrBuffer(sessionId, 'output-progress', progress);

          // When completed, emit the outputs
          if (progress.status === 'completed') {
            const updatedSession = litrev.getSession(sessionId);
            emitOrBuffer(sessionId, 'outputs', updatedSession?.outputs);
          }
        });

    generateMethod.catch((error: any) => {
      console.error('[Server] Output generation failed:', error);
      emitOrBuffer(sessionId, 'output-progress', {
        status: 'error',
        stage: 'completed',
        currentTask: 'Output generation failed',
        totalStages: 5,
        completedStages: 0,
        error: error.message,
        progress: 0
      });
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
        emitOrBuffer(tempSessionId, 'semantic-filter-progress', {
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

// Helper function to parse CSV content to papers
async function parseCsvToPapers(csvContent: string): Promise<Paper[]> {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const papers: Paper[] = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCsvLine(lines[i]);
      const paper: any = {};

      headers.forEach((header, index) => {
        if (values[index] !== undefined) {
          paper[header] = values[index];
        }
      });

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
        included: paper.Included === 'Yes' || paper.Included === '1' || paper.Included === 'true',
        exclusionReason: paper['Exclusion Reason'] || paper.exclusionReason,
        excluded_by_keyword: paper['Excluded by Keyword'] === 'Yes' || paper['Excluded by Keyword'] === '1',
        extractedAt: new Date()
      });
    } catch (error) {
      console.error(`Error parsing line ${i}:`, error);
    }
  }

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

        emitOrBuffer(sessionId, 'semantic-filter-progress', {
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
