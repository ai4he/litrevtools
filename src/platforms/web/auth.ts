/**
 * Authentication middleware and utilities for Google OAuth
 */

import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// Load from environment variables - these MUST be set in .env file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'litrevtools-secret-key-change-in-production';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('WARNING: Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file.');
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthRequest extends Request {
  user?: User;
}

/**
 * Verify Google OAuth token and extract user information
 */
export async function verifyGoogleToken(token: string): Promise<User> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid token payload');
    }

    return {
      id: payload.sub,
      email: payload.email || '',
      name: payload.name || '',
      picture: payload.picture,
    };
  } catch (error: any) {
    throw new Error(`Google token verification failed: ${error.message}`);
  }
}

/**
 * Generate JWT token for authenticated user
 */
export function generateJWT(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Verify JWT token
 */
export function verifyJWT(token: string): User {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as User;
    return decoded;
  } catch (error: any) {
    throw new Error(`JWT verification failed: ${error.message}`);
  }
}

/**
 * Authentication middleware - protect routes
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ success: false, error: 'No authorization token provided' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    const user = verifyJWT(token);
    req.user = user;
    next();
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const user = verifyJWT(token);
      req.user = user;
    }
  } catch (error) {
    // Silently fail - user will be undefined
  }
  next();
}
