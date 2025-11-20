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

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      // Clear invalid auth token
      // Don't redirect - let the component handle the auth state
      localStorage.removeItem('authToken');
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

export const sessionAPI = {
  getAll: async () => {
    const response = await api.get('/sessions');
    return response.data as SearchSession[];
  },

  getById: async (sessionId: string) => {
    const response = await api.get(`/sessions/${sessionId}`);
    return response.data as SearchSession;
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
