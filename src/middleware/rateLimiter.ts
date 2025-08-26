import rateLimit from 'express-rate-limit';
import { logger } from '@/lib/logger';

// General rate limiter for all routes
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    ok: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id || 'anonymous',
    });
    
    res.status(429).json({
      ok: false,
      error: 'Too many requests from this IP, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
    });
  },
  skip: (req) => {
    // Skip rate limiting for health check endpoints
    return req.path.startsWith('/api/health');
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return (req as any).user?.id || req.ip;
  },
});

// Stricter rate limiter for authentication routes
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 authentication attempts per windowMs
  message: {
    ok: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Authentication rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(429).json({
      ok: false,
      error: 'Too many authentication attempts, please try again later',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
    });
  },
  keyGenerator: (req) => {
    // Use IP for authentication rate limiting
    return req.ip;
  },
});

// Rate limiter for POST routes (create/update operations)
export const postRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each user to 30 POST requests per windowMs
  message: {
    ok: false,
    error: 'Too many create/update requests, please try again later',
    code: 'POST_RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('POST rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id || 'anonymous',
    });
    
    res.status(429).json({
      ok: false,
      error: 'Too many create/update requests, please try again later',
      code: 'POST_RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
    });
  },
  skip: (req) => {
    // Skip rate limiting for health check endpoints
    return req.path.startsWith('/api/health');
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return (req as any).user?.id || req.ip;
  },
});

// Rate limiter for search operations
export const searchRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each user to 60 search requests per windowMs
  message: {
    ok: false,
    error: 'Too many search requests, please try again later',
    code: 'SEARCH_RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Search rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id || 'anonymous',
    });
    
    res.status(429).json({
      ok: false,
      error: 'Too many search requests, please try again later',
      code: 'SEARCH_RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
    });
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return (req as any).user?.id || req.ip;
  },
});

// Rate limiter for export operations (Notion integration)
export const exportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each user to 20 export operations per hour
  message: {
    ok: false,
    error: 'Too many export operations, please try again later',
    code: 'EXPORT_RATE_LIMIT_EXCEEDED',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Export rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id || 'anonymous',
    });
    
    res.status(429).json({
      ok: false,
      error: 'Too many export operations, please try again later',
      code: 'EXPORT_RATE_LIMIT_EXCEEDED',
      retryAfter: '1 hour',
      timestamp: new Date().toISOString(),
    });
  },
  keyGenerator: (req) => {
    // Use user ID for export rate limiting
    return (req as any).user?.id || req.ip;
  },
});

// Rate limiter for OAuth operations
export const oauthRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 OAuth attempts per hour
  message: {
    ok: false,
    error: 'Too many OAuth attempts, please try again later',
    code: 'OAUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('OAuth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(429).json({
      ok: false,
      error: 'Too many OAuth attempts, please try again later',
      code: 'OAUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: '1 hour',
      timestamp: new Date().toISOString(),
    });
  },
  keyGenerator: (req) => {
    // Use IP for OAuth rate limiting
    return req.ip;
  },
});

// Dynamic rate limiter based on user tier
export const dynamicRateLimiter = (defaultLimit: number = 100) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
      // Implement user tier-based rate limiting
      const user = (req as any).user;
      if (!user) return defaultLimit;
      
      // Example: Premium users get higher limits
      // In a real app, you'd check user subscription/tier
      if (user.email === 'premium@example.com') {
        return defaultLimit * 3; // 3x limit for premium users
      }
      
      return defaultLimit;
    },
    message: {
      ok: false,
      error: 'Rate limit exceeded for your tier, please upgrade or try again later',
      code: 'TIER_RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Dynamic rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        userId: (req as any).user?.id || 'anonymous',
        userTier: (req as any).user?.email === 'premium@example.com' ? 'premium' : 'standard',
      });
      
      res.status(429).json({
        ok: false,
        error: 'Rate limit exceeded for your tier, please upgrade or try again later',
        code: 'TIER_RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes',
        timestamp: new Date().toISOString(),
      });
    },
    keyGenerator: (req) => {
      return (req as any).user?.id || req.ip;
    },
  });
};

// Main rate limiter that applies to all routes
export const rateLimiter = generalRateLimiter;
