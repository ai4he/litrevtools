/**
 * Mobile Platform (Capacitor) for LitRevTools
 * This provides a bridge between the mobile app and the core functionality
 */

import { Capacitor } from '@capacitor/core';

/**
 * Mobile API wrapper
 * This connects to a backend server running the core LitRevTools logic
 */
export class LitRevToolsMobile {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if running on native platform
   */
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Get platform name
   */
  getPlatform(): string {
    return Capacitor.getPlatform();
  }

  /**
   * API methods that communicate with the backend server
   */

  async getSessions() {
    const response = await fetch(`${this.baseUrl}/api/sessions`);
    const data = await response.json();
    return data.sessions;
  }

  async getSession(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`);
    const data = await response.json();
    return data.session;
  }

  async startSearch(params: any) {
    const response = await fetch(`${this.baseUrl}/api/search/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    const data = await response.json();
    return data.sessionId;
  }

  async pauseSearch(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/api/search/${sessionId}/pause`, {
      method: 'POST'
    });
    return await response.json();
  }

  async resumeSearch(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/api/search/${sessionId}/resume`, {
      method: 'POST'
    });
    return await response.json();
  }

  async stopSearch(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/api/search/${sessionId}/stop`, {
      method: 'POST'
    });
    return await response.json();
  }

  async generateOutputs(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/generate`, {
      method: 'POST'
    });
    const data = await response.json();
    return data.outputs;
  }

  async downloadFile(sessionId: string, type: string) {
    const url = `${this.baseUrl}/api/sessions/${sessionId}/download/${type}`;
    // On mobile, you might want to use the Filesystem or Share plugins
    window.open(url, '_blank');
  }
}

// Export for use in mobile apps
export default LitRevToolsMobile;
