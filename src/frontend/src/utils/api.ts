import axios from 'axios';
import { SearchParameters, SearchSession } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add auth token or guest mode header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    const guestMode = localStorage.getItem('guestMode');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (guestMode === 'true') {
      config.headers['X-Guest-Mode'] = 'true';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid auth token (but preserve guest mode)
      const guestMode = localStorage.getItem('guestMode');
      localStorage.removeItem('authToken');

      // If we get 401 in guest mode, it might be a real auth issue, clear guest mode too
      if (!guestMode) {
        // Only log if not in guest mode
        console.warn('Authentication failed, token cleared');
      }
    }
    return Promise.reject(error);
  }
);

export const searchAPI = {
  start: async (params: SearchParameters) => {
    const response = await api.post('/search/start', params);
    return response.data;
  },

  pause: async (sessionId: string) => {
    const response = await api.post(`/search/${sessionId}/pause`);
    return response.data;
  },

  resume: async (sessionId: string) => {
    const response = await api.post(`/search/${sessionId}/resume`);
    return response.data;
  },

  stop: async (sessionId: string) => {
    const response = await api.post(`/search/${sessionId}/stop`);
    return response.data;
  },
};

export interface StepStatus {
  step: 1 | 2 | 3;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  progress?: number;
  currentTask?: string;
  lastUpdate: number;
  error?: string;
}

export interface StepStatusResponse {
  success: boolean;
  stepStatus: StepStatus | null;
  isSearching: boolean;
  sessionProgress: any;
  sessionStatus: string;
}

export const sessionAPI = {
  getAll: async () => {
    const response = await api.get('/sessions');
    return response.data as SearchSession[];
  },

  getById: async (sessionId: string): Promise<{ success: boolean; session: SearchSession }> => {
    const response = await api.get(`/sessions/${sessionId}`);
    return response.data;
  },

  // Get current step status for a session (for reconnection sync)
  getStepStatus: async (sessionId: string): Promise<StepStatusResponse> => {
    const response = await api.get(`/sessions/${sessionId}/step-status`);
    return response.data;
  },

  generate: async (sessionId: string, dataSource?: 'step1' | 'step2' | 'current', options?: {
    model?: string;
    batchSize?: number;
    latexPrompt?: string;
  }) => {
    const response = await api.post(`/sessions/${sessionId}/generate`, {
      dataSource,
      ...options
    });
    return response.data;
  },

  generatePaper: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/prisma-paper`);
    return response.data;
  },

  download: async (sessionId: string, type: 'csv' | 'bibtex' | 'latex' | 'zip') => {
    const response = await api.get(`/sessions/${sessionId}/download/${type}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Step 2 (Semantic Filtering) controls
  pauseSemanticFilter: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/semantic-filter/pause`);
    return response.data;
  },

  resumeSemanticFilter: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/semantic-filter/resume`);
    return response.data;
  },

  stopSemanticFilter: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/semantic-filter/stop`);
    return response.data;
  },

  // Step 3 (Output Generation) controls
  pauseGenerate: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/generate/pause`);
    return response.data;
  },

  resumeGenerate: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/generate/resume`);
    return response.data;
  },

  stopGenerate: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/generate/stop`);
    return response.data;
  },

  // Download progress ZIP files
  downloadProgressZipStep1: async (sessionId: string, lastOffset: number) => {
    const response = await api.get(`/sessions/${sessionId}/download/progress-zip/step1?lastOffset=${lastOffset}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  downloadProgressZipStep2: async (
    sessionId: string,
    parameters: {
      inclusionPrompt?: string;
      exclusionPrompt?: string;
      batchSize: number;
      model: string;
    },
    progress: {
      totalPapers: number;
      processedPapers: number;
      currentBatch: number;
      totalBatches: number;
    }
  ) => {
    const response = await api.post(`/sessions/${sessionId}/download/progress-zip/step2`, {
      inclusionPrompt: parameters.inclusionPrompt,
      exclusionPrompt: parameters.exclusionPrompt,
      batchSize: parameters.batchSize,
      model: parameters.model,
      progress
    }, {
      responseType: 'blob',
    });
    return response.data;
  },

  downloadProgressZipStep3: async (
    sessionId: string,
    parameters: any,
    progress: any,
    completedOutputs: any
  ) => {
    const response = await api.post(`/sessions/${sessionId}/download/progress-zip/step3`, {
      parameters,
      progress,
      completedOutputs
    }, {
      responseType: 'blob',
    });
    return response.data;
  },
};

// Resume API
export const resumeAPI = {
  /**
   * Resume from ZIP file
   */
  resumeFromZip: async (zipFile: File, stepNumber: number) => {
    const formData = new FormData();
    formData.append('zipFile', zipFile);
    formData.append('step', stepNumber.toString());

    const response = await api.post('/resume-from-zip', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

// Project API
export const projectAPI = {
  /**
   * Get all projects
   */
  getAll: async () => {
    const response = await api.get('/projects');
    return response.data;
  },

  /**
   * Get a single project by ID
   */
  getById: async (projectId: string) => {
    const response = await api.get(`/projects/${projectId}`);
    return response.data;
  },

  /**
   * Get a project with populated step data
   */
  getWithSteps: async (projectId: string) => {
    const response = await api.get(`/projects/${projectId}/with-steps`);
    return response.data;
  },

  /**
   * Get project progress
   */
  getProgress: async (projectId: string) => {
    const response = await api.get(`/projects/${projectId}/progress`);
    return response.data;
  },

  /**
   * Create a new project
   */
  create: async (params: { name: string; description?: string }) => {
    const response = await api.post('/projects', params);
    return response.data;
  },

  /**
   * Update a project
   */
  update: async (projectId: string, params: { name?: string; description?: string; status?: string }) => {
    const response = await api.put(`/projects/${projectId}`, params);
    return response.data;
  },

  /**
   * Delete a project
   */
  delete: async (projectId: string) => {
    const response = await api.delete(`/projects/${projectId}`);
    return response.data;
  },

  /**
   * Pause a project
   */
  pause: async (projectId: string) => {
    const response = await api.post(`/projects/${projectId}/pause`);
    return response.data;
  },

  /**
   * Resume a project
   */
  resume: async (projectId: string) => {
    const response = await api.post(`/projects/${projectId}/resume`);
    return response.data;
  },

  /**
   * Stop a project
   */
  stop: async (projectId: string) => {
    const response = await api.post(`/projects/${projectId}/stop`);
    return response.data;
  },

  /**
   * Start Step 1 for a project
   */
  startStep1: async (projectId: string, parameters: any) => {
    const response = await api.post(`/projects/${projectId}/start-step1`, parameters);
    return response.data;
  },

  /**
   * Start Step 2 for a project
   */
  startStep2: async (projectId: string, parameters: {
    inclusionPrompt?: string;
    exclusionPrompt?: string;
    batchSize?: number;
    model?: string;
  }) => {
    const response = await api.post(`/projects/${projectId}/start-step2`, parameters);
    return response.data;
  },

  /**
   * Start Step 3 for a project
   */
  startStep3: async (projectId: string, parameters: {
    dataSource?: 'step1' | 'step2';
    model?: string;
    batchSize?: number;
    latexPrompt?: string;
  }) => {
    const response = await api.post(`/projects/${projectId}/start-step3`, parameters);
    return response.data;
  },

  /**
   * Mark a step as complete
   */
  completeStep: async (projectId: string, step: 1 | 2 | 3, sessionId?: string) => {
    const response = await api.post(`/projects/${projectId}/complete-step/${step}`, { sessionId });
    return response.data;
  },
};

export const authAPI = {
  googleLogin: async (credential: string) => {
    const response = await api.post('/auth/google', { credential });
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    localStorage.removeItem('authToken');
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export default api;
