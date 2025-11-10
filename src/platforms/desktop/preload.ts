/**
 * Electron Preload Script
 * Provides secure bridge between renderer and main process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('litrev', {
  // Session management
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  getSession: (sessionId: string) => ipcRenderer.invoke('get-session', sessionId),

  // Search operations
  startSearch: (params: any) => ipcRenderer.invoke('start-search', params),
  pauseSearch: () => ipcRenderer.invoke('pause-search'),
  resumeSearch: () => ipcRenderer.invoke('resume-search'),
  stopSearch: () => ipcRenderer.invoke('stop-search'),

  // Output operations
  generateOutputs: (sessionId: string) => ipcRenderer.invoke('generate-outputs', sessionId),
  generatePRISMAPaper: (sessionId: string) => ipcRenderer.invoke('generate-prisma-paper', sessionId),
  openOutput: (filePath: string) => ipcRenderer.invoke('open-output', filePath),

  // Event listeners
  onProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('search-progress', (event, progress) => callback(progress));
  },
  onPaperFound: (callback: (paper: any) => void) => {
    ipcRenderer.on('paper-found', (event, paper) => callback(paper));
  },
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('search-error', (event, error) => callback(error));
  },
  onOutputsReady: (callback: (outputs: any) => void) => {
    ipcRenderer.on('outputs-ready', (event, outputs) => callback(outputs));
  }
});
