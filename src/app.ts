import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import { rateLimiter } from '@/middleware/rateLimiter';
import { healthRouter } from '@/routes/health';
import { templatesRouter } from '@/routes/templates';
import { favoritesRouter } from '@/routes/favorites';
import { notionRouter } from '@/routes/notion';
import { authRouter } from '@/routes/auth';

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:4173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLogger);

// Rate limiting middleware
app.use(rateLimiter);

// Health check route (no auth required)
app.use('/api/health', healthRouter);

// API routes (protected by auth middleware)
app.use('/api/auth', authRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/notion', notionRouter);

// Global error handling middleware (must be last)
app.use(errorHandler);

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Start server
const startServer = async () => {
  try {
    const port = env.PORT;
    app.listen(port, () => {
      logger.info(`🚀 Server running on port ${port} in ${env.NODE_ENV} mode`);
      logger.info(`📊 Health check available at http://localhost:${port}/api/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
