import { Router, Request, Response } from 'express';
import { testConnection } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const router = Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Test database connection
    const dbStatus = await testConnection();
    
    const responseTime = Date.now() - startTime;
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      services: {
        database: dbStatus ? 'connected' : 'disconnected',
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
      },
    };

    // Set appropriate status code based on health
    const statusCode = dbStatus ? 200 : 503;
    
    logger.info('Health check performed', {
      path: req.path,
      statusCode,
      responseTime,
      dbStatus,
    });

    res.status(statusCode).json({
      ok: dbStatus,
      data: healthData,
      error: dbStatus ? undefined : 'Database connection failed',
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      ok: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Detailed health check endpoint
 * GET /api/health/detailed
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Test database connection
    const dbStatus = await testConnection();
    
    const responseTime = Date.now() - startTime;
    
    // Get system information
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
      title: process.title,
      argv: process.argv,
    };
    
    // Get memory usage details
    const memoryUsage = process.memoryUsage();
    const memoryInfo = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024), // Resident Set Size
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // Total heap size
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // Used heap size
      external: Math.round(memoryUsage.external / 1024 / 1024), // External memory
      arrayBuffers: Math.round((memoryUsage as any).arrayBuffers / 1024 / 1024), // Array buffers
    };
    
    // Get CPU usage (basic)
    const cpuUsage = process.cpuUsage();
    const cpuInfo = {
      user: Math.round(cpuUsage.user / 1000), // microseconds to milliseconds
      system: Math.round(cpuUsage.system / 1000),
    };
    
    const detailedHealthData = {
      status: dbStatus ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(process.uptime()),
        formatted: formatUptime(process.uptime()),
      },
      responseTime: `${responseTime}ms`,
      services: {
        database: {
          status: dbStatus ? 'connected' : 'disconnected',
          timestamp: new Date().toISOString(),
        },
      },
      system: {
        ...systemInfo,
        memory: memoryInfo,
        cpu: cpuInfo,
        environment: {
          NODE_ENV: process.env.NODE_ENV || 'development',
          PORT: process.env.PORT || '3000',
          DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'not configured',
          JWT_SECRET: process.env.JWT_SECRET ? 'configured' : 'not configured',
          NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID ? 'configured' : 'not configured',
          ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? 'configured' : 'not configured',
        },
      },
      version: {
        package: process.env.npm_package_version || '1.0.0',
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    const statusCode = dbStatus ? 200 : 503;
    
    logger.info('Detailed health check performed', {
      path: req.path,
      statusCode,
      responseTime,
      dbStatus,
    });

    res.status(statusCode).json({
      ok: dbStatus,
      data: detailedHealthData,
      error: dbStatus ? undefined : 'Database connection failed',
    });
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    
    res.status(503).json({
      ok: false,
      error: 'Detailed health check failed',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Readiness probe endpoint
 * GET /api/health/ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if the application is ready to serve requests
    const dbStatus = await testConnection();
    
    if (!dbStatus) {
      logger.warn('Readiness check failed: Database not connected');
      return res.status(503).json({
        ok: false,
        status: 'not ready',
        error: 'Database connection failed',
        timestamp: new Date().toISOString(),
      });
    }
    
    logger.debug('Readiness check passed');
    res.json({
      ok: true,
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      ok: false,
      status: 'not ready',
      error: 'Readiness check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Liveness probe endpoint
 * GET /api/health/live
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, the process is alive
  res.json({
    ok: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
  });
});

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

export { router as healthRouter };
