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

  generate: async (sessionId: string) => {
    const response = await api.post(`/sessions/${sessionId}/generate`);
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
