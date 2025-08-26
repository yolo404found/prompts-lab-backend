import { Router, Request, Response } from 'express';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router = Router();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'ab7241c613285bf300d47fec464c057285734d27a89c0bd622aadfe6bee50dd9';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

// Validation schemas
const signUpSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

interface AuthResponse {
  ok: boolean;
  data?: {
    user: any;
    token: string;
    expires_in: string;
  };
  error?: string;
  details?: any;
}

// Password utilities
const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(password + salt + JWT_SECRET)
    .digest('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password: string, storedHash: string): boolean => {
  try {
    const [salt, originalHash] = storedHash.split(':');
    const hash = createHash('sha256')
      .update(password + salt + JWT_SECRET)
      .digest('hex');
    
    // Use timingSafeEqual to prevent timing attacks
    const hashBuffer = Buffer.from(hash, 'hex');
    const originalHashBuffer = Buffer.from(originalHash, 'hex');
    
    return hashBuffer.length === originalHashBuffer.length && 
           timingSafeEqual(hashBuffer, originalHashBuffer);
  } catch (error) {
    return false;
  }
};

const generateToken = (userId: string, email: string): string => {
  return jwt.sign(
    {
      sub: userId,
      email: email,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

router.get('/', (req: Request, res: Response) => {
  res.json({ ok: true, message: 'Auth API root' });
});

/**
 * Register new user
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response<AuthResponse>) => {
  try {
    // Validate request body
    const validationResult = signUpSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        ok: false,
        error: 'Validation failed',
        details: validationResult.error.format(),
      });
    }

    const { name, email, password } = validationResult.data;

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(409).json({
        ok: false,
        error: 'User with this email already exists',
      });
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Create user in database
    const { data: user, error: createError } = await supabase
      .from('profiles')
      .insert({
        email,
        full_name: name,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, email, full_name, avatar_url, created_at')
      .single();

    if (createError) {
      logger.error('User creation failed:', createError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to create user',
        details: createError.message,
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({
      ok: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
        },
        token,
        expires_in: JWT_EXPIRES_IN,
      },
    });
  } catch (error) {
    logger.error('Registration failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Login user
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response<AuthResponse>) => {
  try {
    // Validate request body
    const validationResult = signInSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        ok: false,
        error: 'Validation failed',
        details: validationResult.error.format(),
      });
    }

    const { email, password } = validationResult.data;

    // Find user by email
    const { data: user, error: findError } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, password_hash, created_at')
      .eq('email', email)
      .single();

    if (findError || !user) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid email or password',
      });
    }

    // Verify password
    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid email or password',
      });
    }

    // Update last login
    await supabase
      .from('profiles')
      .update({ 
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
    });

    res.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
        },
        token,
        expires_in: JWT_EXPIRES_IN,
      },
    });
  } catch (error) {
    logger.error('Login failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        error: 'Authorization token required',
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; id?: string; email: string };
      
      // Handle both 'sub' and 'id' fields for backward compatibility
      const userId = decoded.sub || decoded.id;
      
      const { data: user, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, created_at, last_login')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return res.status(404).json({
          ok: false,
          error: 'User not found',
        });
      }

      res.json({
        ok: true,
        data: user,
      });
    } catch (jwtError) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid or expired token',
      });
    }
  } catch (error) {
    logger.error('Get profile failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Logout user (client-side token removal)
 * POST /api/auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  // Since we're using JWT, logout is handled client-side by removing the token
  // This endpoint is for consistency and future enhancements
  res.json({
    ok: true,
    message: 'Logged out successfully',
  });
});

export { router as authRouter };