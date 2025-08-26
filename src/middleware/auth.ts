import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        fullName?: string;
        iat: number;
        exp: number;
      };
    }
  }
}

// JWT payload interface
interface JWTPayload {
  id: string;
  email: string;
  fullName?: string;
  iat: number;
  exp: number;
}

/**
 * Authentication middleware
 * Validates JWT token from Authorization header and attaches user data to req.user
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(401).json({
        ok: false,
        error: 'Access token required',
        code: 'AUTH_TOKEN_MISSING',
      });
      return;
    }

    // Verify JWT token
    jwt.verify(token, env.JWT_SECRET, (err: jwt.VerifyErrors | null, decoded: any) => {
      if (err) {
        let errorMessage = 'Invalid token';
        let errorCode = 'AUTH_TOKEN_INVALID';

        if (err.name === 'TokenExpiredError') {
          errorMessage = 'Token expired';
          errorCode = 'AUTH_TOKEN_EXPIRED';
        } else if (err.name === 'JsonWebTokenError') {
          errorMessage = 'Malformed token';
          errorCode = 'AUTH_TOKEN_MALFORMED';
        }

        logger.warn('Authentication failed: Token verification error', {
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          error: err.message,
        });

        res.status(401).json({
          ok: false,
          error: errorMessage,
          code: errorCode,
        });
        return;
      }

      // Validate decoded payload structure
      // Check for both 'id' and 'sub' fields (JWT standard uses 'sub' for subject)
      const userId = decoded.id || decoded.sub;
      if (!decoded || typeof decoded !== 'object' || !userId || !decoded.email) {
        logger.warn('Authentication failed: Invalid token payload structure', {
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          decoded: decoded,
        });

        res.status(401).json({
          ok: false,
          error: 'Invalid token payload',
          code: 'AUTH_TOKEN_INVALID_PAYLOAD',
        });
        return;
      }

      // Check if token is expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < currentTime) {
        logger.warn('Authentication failed: Token expired', {
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: userId,
        });

        res.status(401).json({
          ok: false,
          error: 'Token expired',
          code: 'AUTH_TOKEN_EXPIRED',
        });
        return;
      }

      // Attach user data to request
      req.user = {
        id: userId, // Use the extracted userId (either 'id' or 'sub')
        email: decoded.email,
        fullName: decoded.fullName,
        iat: decoded.iat,
        exp: decoded.exp,
      };

      logger.debug('Authentication successful', {
        path: req.path,
        userId: req.user.id,
        email: req.user.email,
      });

      next();
    });
  } catch (error) {
    logger.error('Unexpected error in authentication middleware:', error);
    
    res.status(500).json({
      ok: false,
      error: 'Internal server error during authentication',
      code: 'AUTH_INTERNAL_ERROR',
    });
  }
};

/**
 * Optional authentication middleware
 * Similar to authenticateToken but doesn't fail if no token is provided
 * Useful for routes that can work with or without authentication
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token provided, continue without authentication
      next();
      return;
    }

    // Verify JWT token
    jwt.verify(token, env.JWT_SECRET, (err: jwt.VerifyErrors | null, decoded: any) => {
      if (err) {
        // Token is invalid, but continue without authentication
        logger.debug('Optional auth: Invalid token provided, continuing without auth', {
          path: req.path,
          error: err.message,
        });
        next();
        return;
      }

      // Validate decoded payload structure
      // Check for both 'id' and 'sub' fields (JWT standard uses 'sub' for subject)
      const userId = decoded.id || decoded.sub;
      if (decoded && typeof decoded === 'object' && userId && decoded.email) {
        // Check if token is expired
        const currentTime = Math.floor(Date.now() / 1000);
        if (!decoded.exp || decoded.exp >= currentTime) {
          req.user = {
            id: userId, // Use the extracted userId (either 'id' or 'sub')
            email: decoded.email,
            fullName: decoded.fullName,
            iat: decoded.iat,
            exp: decoded.exp,
          };

          logger.debug('Optional auth: Valid token, user authenticated', {
            path: req.path,
            userId: req.user.id,
          });
        }
      }

      next();
    });
  } catch (error) {
    logger.error('Unexpected error in optional authentication middleware:', error);
    // Continue without authentication on error
    next();
  }
};

/**
 * Role-based access control middleware
 * Checks if the authenticated user has the required role
 */
export const requireRole = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        ok: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    // For now, we'll implement a simple role system
    // In a real application, you might want to check roles from the database
    if (req.user.email === 'admin@example.com') {
      // Admin role check (example)
      next();
    } else {
      res.status(403).json({
        ok: false,
        error: 'Insufficient permissions',
        code: 'AUTH_INSUFFICIENT_PERMISSIONS',
      });
    }
  };
};

/**
 * Generate JWT token for a user
 * This is a utility function that can be used in auth routes
 */
export const generateToken = (payload: { id: string; email: string; fullName?: string }): string => {
  const tokenPayload: JWTPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
  };

  return jwt.sign(tokenPayload, env.JWT_SECRET);
};

/**
 * Verify JWT token and return decoded payload
 * This is a utility function for internal use
 */
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.debug('Token verification failed:', error);
    return null;
  }
};
