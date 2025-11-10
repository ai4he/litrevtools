/**
 * Electron Desktop Application for LitRevTools
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { LitRevTools, SearchParameters, SearchProgress, Paper } from '../../core';

let mainWindow: BrowserWindow | null = null;
let litrev: LitRevTools | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'LitRevTools - Systematic Literature Review',
    backgroundColor: '#667eea'
  });

  // Load the shared React frontend
  // In production, load the built React app
  // In development, point to the dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'));
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize app
app.whenReady().then(() => {
  litrev = new LitRevTools();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (litrev) {
    litrev.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Get all sessions
ipcMain.handle('get-sessions', async () => {
  if (!litrev) return [];
  return litrev.getAllSessions();
});

// Get session by ID
ipcMain.handle('get-session', async (event, sessionId: string) => {
  if (!litrev) return null;
  return litrev.getSession(sessionId);
});

// Start search
ipcMain.handle('start-search', async (event, params: SearchParameters) => {
  if (!litrev) throw new Error('LitRevTools not initialized');

  const sessionId = await litrev.startSearch(params, {
    onProgress: (progress: SearchProgress) => {
      if (mainWindow) {
        mainWindow.webContents.send('search-progress', progress);
      }
    },
    onPaper: (paper: Paper) => {
      if (mainWindow) {
        mainWindow.webContents.send('paper-found', paper);
      }
    },
    onError: (error: Error) => {
      if (mainWindow) {
        mainWindow.webContents.send('search-error', error.message);
      }
    }
  });

  // Generate outputs when complete
  const session = litrev.getSession(sessionId);
  if (session?.progress.status === 'completed') {
    await litrev.generateOutputs(sessionId);
    const updatedSession = litrev.getSession(sessionId);
    if (mainWindow && updatedSession) {
      mainWindow.webContents.send('outputs-ready', updatedSession.outputs);
    }
  }

  return sessionId;
});

// Pause search
ipcMain.handle('pause-search', async () => {
  if (!litrev) return;
  litrev.pauseSearch();
});

// Resume search
ipcMain.handle('resume-search', async () => {
  if (!litrev) return;
  litrev.resumeSearch();
});

// Stop search
ipcMain.handle('stop-search', async () => {
  if (!litrev) return;
  litrev.stopSearch();
});

// Generate outputs
ipcMain.handle('generate-outputs', async (event, sessionId: string) => {
  if (!litrev) throw new Error('LitRevTools not initialized');
  await litrev.generateOutputs(sessionId);
  const session = litrev.getSession(sessionId);
  return session?.outputs;
});

// Generate PRISMA paper
ipcMain.handle('generate-prisma-paper', async (event, sessionId: string) => {
  if (!litrev) throw new Error('LitRevTools not initialized');
  return await litrev.generatePRISMAPaper(sessionId);
});

// Open output file in system viewer
ipcMain.handle('open-output', async (event, filePath: string) => {
  const { shell } = require('electron');
  await shell.openPath(filePath);
});
