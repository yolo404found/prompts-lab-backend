import { Request, Response, NextFunction } from 'express';
import { logger } from '@/lib/logger';
import { ZodError } from 'zod';

// Custom error classes
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number, code?: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }

  public details?: any;
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

// Global error handling middleware
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString(),
  };

  // Handle different types of errors
  if (error instanceof ZodError) {
    // Zod validation errors
    logger.warn('Validation error:', {
      ...errorInfo,
      details: error.errors,
    });

    res.status(400).json({
      ok: false,
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      })),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error instanceof AppError) {
    // Custom application errors
    if (error.isOperational) {
      logger.warn('Operational error:', errorInfo);
    } else {
      logger.error('Non-operational error:', errorInfo);
    }

    res.status(error.statusCode).json({
      ok: false,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
      ...(error instanceof ValidationError && error.details && { details: error.details }),
    });
    return;
  }

  // Handle specific known errors
  if (error.name === 'CastError' || error.message.includes('Cast to ObjectId failed')) {
    logger.warn('Cast error (invalid ID):', errorInfo);
    
    res.status(400).json({
      ok: false,
      error: 'Invalid ID format',
      code: 'INVALID_ID_FORMAT',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error.name === 'MongoError' || error.name === 'PostgresError') {
    // Database errors
    logger.error('Database error:', errorInfo);
    
    res.status(500).json({
      ok: false,
      error: 'Database operation failed',
      code: 'DATABASE_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error.name === 'JsonWebTokenError') {
    logger.warn('JWT error:', errorInfo);
    
    res.status(401).json({
      ok: false,
      error: 'Invalid token',
      code: 'JWT_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    logger.warn('JWT expired:', errorInfo);
    
    res.status(401).json({
      ok: false,
      error: 'Token expired',
      code: 'JWT_EXPIRED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    logger.warn('JSON syntax error:', errorInfo);
    
    res.status(400).json({
      ok: false,
      error: 'Invalid JSON format',
      code: 'INVALID_JSON',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle network and external service errors
  if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
    logger.error('Network error:', errorInfo);
    
    res.status(503).json({
      ok: false,
      error: 'Service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
    logger.error('Timeout error:', errorInfo);
    
    res.status(504).json({
      ok: false,
      error: 'Request timeout',
      code: 'TIMEOUT_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Default error handler for unknown errors
  logger.error('Unhandled error:', errorInfo);

  // In production, don't expose internal error details
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(500).json({
    ok: false,
    error: isProduction ? 'Internal server error' : error.message,
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    ...(isProduction && { requestId: req.headers['x-request-id'] }),
  });
};

// Async error wrapper for route handlers
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response): void => {
  logger.warn('Route not found:', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(404).json({
    ok: false,
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};

// Graceful shutdown handler
export const gracefulShutdown = (server: any, signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};
