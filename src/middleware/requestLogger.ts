import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { logger, stream } from '@/lib/logger';

// Custom token for request ID
morgan.token('id', (req: Request) => req.headers['x-request-id'] || 'unknown');

// Custom token for user ID (if authenticated)
morgan.token('user', (req: Request) => (req as any).user?.id || 'anonymous');

// Custom token for response time in milliseconds
morgan.token('response-time-ms', (req: Request, res: Response) => {
  const responseTime = res.getHeader('X-Response-Time');
  return responseTime ? `${responseTime}ms` : 'unknown';
});

// Custom token for request body size
morgan.token('body-size', (req: Request) => {
  if (req.body) {
    const bodyStr = JSON.stringify(req.body);
    return bodyStr ? `${bodyStr.length} bytes` : '0 bytes';
  }
  return '0 bytes';
});

// Custom token for query parameters (sanitized)
morgan.token('query', (req: Request) => {
  if (Object.keys(req.query).length === 0) return 'none';
  
  // Sanitize sensitive query parameters
  const sanitizedQuery = { ...req.query };
  const sensitiveParams = ['token', 'password', 'secret', 'key', 'auth'];
  
  sensitiveParams.forEach(param => {
    if (sanitizedQuery[param]) {
      sanitizedQuery[param] = '[REDACTED]';
    }
  });
  
  return JSON.stringify(sanitizedQuery);
});

// Custom token for request headers (sanitized)
morgan.token('headers', (req: Request) => {
  const sanitizedHeaders = { ...req.headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  
  sensitiveHeaders.forEach(header => {
    if (sanitizedHeaders[header]) {
      sanitizedHeaders[header] = '[REDACTED]';
    }
  });
  
  return JSON.stringify(sanitizedHeaders);
});

// Custom token for IP address
morgan.token('ip', (req: Request) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         (req.connection.socket ? req.connection.socket.remoteAddress : 'unknown');
});

// Custom token for user agent (truncated)
morgan.token('user-agent', (req: Request) => {
  const userAgent = req.get('User-Agent') || 'unknown';
  return userAgent.length > 100 ? userAgent.substring(0, 100) + '...' : userAgent;
});

// Development format (detailed)
const devFormat = ':method :url :status :response-time-ms - :id - :user - :ip - :user-agent';

// Production format (minimal)
const prodFormat = ':method :url :status :response-time-ms - :id - :user - :ip';

// Custom format function for detailed logging
const detailedFormat = (tokens: any, req: Request, res: Response) => {
  const logData = {
    timestamp: new Date().toISOString(),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: tokens.status(req, res),
    responseTime: tokens['response-time-ms'](req, res),
    requestId: tokens.id(req, res),
    userId: tokens.user(req, res),
    ip: tokens.ip(req, res),
    userAgent: tokens['user-agent'](req, res),
    bodySize: tokens['body-size'](req, res),
    query: tokens.query(req, res),
    headers: tokens.headers(req, res),
    contentLength: tokens.res(req, res, 'content-length'),
    referrer: tokens.referrer(req, res),
  };

  return JSON.stringify(logData);
};

// Create Morgan middleware with custom format
export const requestLogger = morgan(detailedFormat, {
  stream,
  skip: (req: Request, res: Response) => {
    // Skip logging for health check endpoints to reduce noise
    return req.path.startsWith('/api/health') || req.path === '/favicon.ico';
  },
});

// Additional request logging middleware for performance monitoring
export const performanceLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Add response time header
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    res.setHeader('X-Response-Time', responseTime.toString());
    
    // Log slow requests
    if (responseTime > 1000) { // 1 second threshold
      logger.warn('Slow request detected', {
        path: req.path,
        method: req.method,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
        userId: (req as any).user?.id || 'anonymous',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }
    
    // Log request completion
    logger.info('Request completed', {
      path: req.path,
      method: req.method,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      requestId: req.headers['x-request-id'] || 'unknown',
      userId: (req as any).user?.id || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length') || '0',
    });
  });
  
  next();
};

// Request ID middleware
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate request ID if not present
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = generateRequestId();
  }
  
  // Set response header
  res.setHeader('X-Request-ID', req.headers['x-request-id']);
  
  next();
};

// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Request body size limit middleware
export const bodySizeLimitMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (contentLength > maxSize) {
    logger.warn('Request body too large', {
      path: req.path,
      method: req.method,
      contentLength: `${contentLength} bytes`,
      maxSize: `${maxSize} bytes`,
      ip: req.ip,
      userId: (req as any).user?.id || 'anonymous',
    });
    
    return res.status(413).json({
      ok: false,
      error: 'Request entity too large',
      code: 'PAYLOAD_TOO_LARGE',
      maxSize: `${maxSize} bytes`,
      receivedSize: `${contentLength} bytes`,
    });
  }
  
  next();
};

// Request timeout middleware
export const timeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeoutId = setTimeout(() => {
      logger.warn('Request timeout', {
        path: req.path,
        method: req.method,
        timeout: `${timeoutMs}ms`,
        ip: req.ip,
        userId: (req as any).user?.id || 'anonymous',
      });
      
      if (!res.headersSent) {
        res.status(408).json({
          ok: false,
          error: 'Request timeout',
          code: 'REQUEST_TIMEOUT',
          timeout: `${timeoutMs}ms`,
        });
      }
    }, timeoutMs);
    
    // Clear timeout on response
    res.on('finish', () => clearTimeout(timeoutId));
    res.on('close', () => clearTimeout(timeoutId));
    
    next();
  };
};

// Export the main middleware
export default requestLogger;
