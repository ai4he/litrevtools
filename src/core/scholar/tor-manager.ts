/**
 * Tor Circuit Manager for rotating IP addresses to avoid blocking
 */

import { SocksProxyAgent } from 'socks-proxy-agent';
import * as net from 'net';

export interface TorCircuitInfo {
  ip: string;
  country: string;
  rotatedAt: Date;
}

export class TorManager {
  private socksPort: number;
  private controlPort: number;
  private password?: string;
  private currentCircuit?: TorCircuitInfo;
  private rotationCount: number = 0;

  constructor(socksPort: number = 9050, controlPort: number = 9051, password?: string) {
    this.socksPort = socksPort;
    this.controlPort = controlPort;
    this.password = password;
  }

  /**
   * Get a SOCKS proxy agent for use with Puppeteer or HTTP clients
   */
  getProxyAgent(): any {
    return new SocksProxyAgent(`socks5://127.0.0.1:${this.socksPort}`);
  }

  /**
   * Get proxy configuration for Puppeteer
   */
  getProxyConfig(): string {
    return `socks5://127.0.0.1:${this.socksPort}`;
  }

  /**
   * Rotate to a new Tor circuit
   */
  async rotateCircuit(): Promise<TorCircuitInfo> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.controlPort, '127.0.0.1', () => {
        let authenticated = false;

        socket.on('data', (data) => {
          const response = data.toString();

          if (!authenticated) {
            if (response.includes('250')) {
              // Authentication successful, send NEWNYM command
              authenticated = true;
              socket.write('SIGNAL NEWNYM\r\n');
            } else {
              socket.destroy();
              reject(new Error('Tor authentication failed'));
            }
          } else {
            if (response.includes('250')) {
              // Circuit rotation successful
              this.rotationCount++;
              const circuitInfo: TorCircuitInfo = {
                ip: 'rotating...',
                country: 'unknown',
                rotatedAt: new Date()
              };
              this.currentCircuit = circuitInfo;
              socket.destroy();

              // Give Tor a moment to establish new circuit (reduced for faster rotation)
              setTimeout(() => resolve(circuitInfo), 1000);
            } else {
              socket.destroy();
              reject(new Error('Circuit rotation failed'));
            }
          }
        });

        socket.on('error', (err) => {
          reject(err);
        });

        // Authenticate
        if (this.password) {
          socket.write(`AUTHENTICATE "${this.password}"\r\n`);
        } else {
          socket.write('AUTHENTICATE\r\n');
        }
      });
    });
  }

  /**
   * Check if Tor is available and running
   */
  async isTorAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection(this.socksPort, '127.0.0.1', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.setTimeout(2000, () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Get the current circuit information
   */
  getCurrentCircuit(): TorCircuitInfo | undefined {
    return this.currentCircuit;
  }

  /**
   * Get the number of circuit rotations performed
   */
  getRotationCount(): number {
    return this.rotationCount;
  }

  /**
   * Verify the current IP address by making a test request
   */
  async verifyIP(): Promise<string> {
    // This would typically make a request to a service like ifconfig.me
    // For now, we'll return a placeholder
    return 'tor-ip-unknown';
  }
}

/**
 * Tor Pool Manager - manages multiple Tor instances for parallel requests
 */
export class TorPoolManager {
  private managers: TorManager[];
  private currentIndex: number = 0;
  private lastRotation: Map<number, Date> = new Map();
  private minRotationInterval: number = 2000; // 2 seconds minimum between rotations (reduced for CAPTCHA bypass)

  constructor(count: number = 3, basePort: number = 9050) {
    this.managers = [];

    // Create multiple Tor managers (in production, you'd run multiple Tor instances)
    // For now, we'll use the same Tor instance but with different virtual "managers"
    for (let i = 0; i < count; i++) {
      this.managers.push(new TorManager(basePort, 9051));
      this.lastRotation.set(i, new Date(0));
    }
  }

  /**
   * Get the next available Tor manager in round-robin fashion
   */
  getNext(): TorManager {
    const manager = this.managers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.managers.length;
    return manager;
  }

  /**
   * Rotate a specific manager if enough time has passed
   */
  async rotateIfNeeded(index: number): Promise<void> {
    const lastRot = this.lastRotation.get(index);
    if (!lastRot) return;

    const timeSinceRotation = Date.now() - lastRot.getTime();
    if (timeSinceRotation >= this.minRotationInterval) {
      try {
        await this.managers[index].rotateCircuit();
        this.lastRotation.set(index, new Date());
      } catch (error) {
        console.error(`Failed to rotate circuit ${index}:`, error);
      }
    }
  }

  /**
   * Rotate all circuits
   */
  async rotateAll(): Promise<void> {
    const rotations = this.managers.map((_, index) => this.rotateIfNeeded(index));
    await Promise.all(rotations);
  }

  /**
   * Check if any Tor instance is available
   */
  async isAnyAvailable(): Promise<boolean> {
    const checks = await Promise.all(
      this.managers.map(manager => manager.isTorAvailable())
    );
    return checks.some(available => available);
  }

  /**
   * Get all managers
   */
  getAllManagers(): TorManager[] {
    return this.managers;
  }
}
