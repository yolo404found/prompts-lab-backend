# Prompt Formatter Backend API

A production-ready, enterprise-grade backend API for managing AI prompt templates with Notion integration, built with Node.js, Express, TypeScript, and Supabase.

## 🚀 Features

- **Template Management**: Full CRUD operations for AI prompt templates
- **Notion Integration**: OAuth flow and export functionality to Notion
- **User Authentication**: JWT-based authentication with role-based access control
- **Favorites System**: User favorite management for templates
- **Search & Filtering**: Advanced template search with category and tag filtering
- **Rate Limiting**: Comprehensive rate limiting to prevent API abuse
- **Security**: Helmet, CORS, input validation, and encrypted token storage
- **Logging**: Structured logging with Winston and Morgan
- **Error Handling**: Global error handling with consistent response format
- **Health Checks**: Comprehensive health monitoring endpoints

## 🏗️ Architecture

This backend follows the **Feature-Sliced Design (FSD)** architecture pattern:

```
src/
├── lib/           # Core libraries and configurations
├── middleware/    # Express middleware
├── repositories/  # Data access layer
├── routes/        # API route handlers
├── types/         # TypeScript type definitions
└── utils/         # Utility functions
```

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: JWT
- **Validation**: Zod
- **Encryption**: CryptoJS
- **Logging**: Winston + Morgan
- **Rate Limiting**: express-rate-limit
- **Security**: Helmet, CORS

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Supabase account and project
- Notion Developer account

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd backend
npm install
```

### 2. Environment Configuration

Copy the environment example file and configure your variables:

```bash
cp env.example .env
```

Fill in the required environment variables:

```env
# Database Configuration (Supabase)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=[YOUR-SUPABASE-SERVICE-ROLE-KEY]

# JWT Configuration
JWT_SECRET=[YOUR-32-CHARACTER-JWT-SECRET-KEY]

# Notion OAuth Configuration
NOTION_CLIENT_ID=[YOUR-NOTION-CLIENT-ID]
NOTION_CLIENT_SECRET=[YOUR-NOTION-CLIENT-SECRET]
NOTION_REDIRECT_URI=http://localhost:3000/api/notion/oauth/callback

# Encryption Configuration (32-byte hex string)
ENCRYPTION_KEY=[YOUR-32-BYTE-HEX-ENCRYPTION-KEY]

# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

### 3. Database Setup

Run the database migration:

```bash
# Connect to your Supabase database and run:
psql [YOUR-DATABASE-URL] -f supabase/migrations/0001_initial_schema.sql

# Optional: Seed with sample data
psql [YOUR-DATABASE-URL] -f supabase/seed.sql
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## 📚 API Documentation

### Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Health Check

```http
GET /api/health
GET /api/health/detailed
GET /api/health/ready
GET /api/health/live
```

### Templates

```http
# List templates (public + user's if authenticated)
GET /api/templates

# Get template by ID
GET /api/templates/:id

# Create template
POST /api/templates
Authorization: Bearer <token>

# Update template
PATCH /api/templates/:id
Authorization: Bearer <token>

# Delete template
DELETE /api/templates/:id
Authorization: Bearer <token>

# Search templates
GET /api/templates/search?query=code&category=coding

# Get user's templates
GET /api/templates/my
Authorization: Bearer <token>

# Export template to Notion
POST /api/templates/:id/export
Authorization: Bearer <token>
```

### Favorites

```http
# Toggle favorite
POST /api/favorites/toggle
Authorization: Bearer <token>

# List user's favorites
GET /api/favorites
Authorization: Bearer <token>

# Check if favorited
GET /api/favorites/check/:templateId
Authorization: Bearer <token>

# Get favorite count
GET /api/favorites/count/:templateId

# Clear all favorites
DELETE /api/favorites/clear
Authorization: Bearer <token>
```

### Notion Integration

```http
# Start OAuth flow
GET /api/notion/oauth/start
Authorization: Bearer <token>

# OAuth callback
GET /api/notion/oauth/callback

# Get integration status
GET /api/notion/status
Authorization: Bearer <token>

# Test connection
POST /api/notion/test
Authorization: Bearer <token>

# Disconnect integration
DELETE /api/notion/disconnect
Authorization: Bearer <token>
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Zod schema validation for all inputs
- **Rate Limiting**: Multiple rate limiters for different operations
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet Security**: Security headers and protections
- **Token Encryption**: Encrypted storage of sensitive tokens
- **SQL Injection Protection**: Parameterized queries via Supabase
- **XSS Protection**: Content Security Policy headers

## 📊 Monitoring & Logging

### Health Checks

- **Liveness Probe**: `/api/health/live` - Basic process health
- **Readiness Probe**: `/api/health/ready` - Service readiness
- **Health Check**: `/api/health` - Basic health status
- **Detailed Health**: `/api/health/detailed` - Comprehensive system info

### Logging

- **Structured Logging**: JSON format with Winston
- **Request Logging**: HTTP request/response logging with Morgan
- **Performance Monitoring**: Slow request detection and logging
- **Error Tracking**: Comprehensive error logging with stack traces

## 🚦 Rate Limiting

The API implements multiple rate limiters:

- **General**: 100 requests per 15 minutes per user/IP
- **Authentication**: 5 attempts per 15 minutes per IP
- **POST Operations**: 30 requests per 15 minutes per user
- **Search**: 60 requests per 15 minutes per user
- **Export**: 20 operations per hour per user
- **OAuth**: 3 attempts per hour per IP

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🏗️ Building for Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── lib/              # Core libraries
│   │   ├── env.ts        # Environment configuration
│   │   ├── logger.ts     # Logging configuration
│   │   └── supabase.ts   # Database client
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts       # Authentication
│   │   ├── errorHandler.ts # Error handling
│   │   ├── requestLogger.ts # Request logging
│   │   └── rateLimiter.ts # Rate limiting
│   ├── repositories/     # Data access layer
│   │   ├── TemplatesRepository.ts
│   │   ├── FavoritesRepository.ts
│   │   └── IntegrationsRepository.ts
│   ├── routes/           # API routes
│   │   ├── health.ts     # Health checks
│   │   ├── templates.ts  # Template management
│   │   ├── favorites.ts  # Favorites
│   │   └── notion.ts     # Notion integration
│   └── app.ts            # Main application
├── supabase/             # Database files
│   ├── migrations/       # Database migrations
│   └── seed.sql          # Sample data
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── README.md             # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | Supabase PostgreSQL connection string | Yes | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes | - |
| `JWT_SECRET` | JWT signing secret (32+ chars) | Yes | - |
| `NOTION_CLIENT_ID` | Notion OAuth client ID | Yes | - |
| `NOTION_CLIENT_SECRET` | Notion OAuth client secret | Yes | - |
| `NOTION_REDIRECT_URI` | Notion OAuth redirect URI | Yes | - |
| `ENCRYPTION_KEY` | 32-byte hex encryption key | Yes | - |
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment mode | No | development |
| `LOG_LEVEL` | Logging level | No | info |

### Database Schema

The application uses the following main tables:

- **profiles**: User profile information
- **templates**: AI prompt templates
- **favorites**: User favorite templates
- **user_integrations**: OAuth integrations (Notion, etc.)

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/app.js"]
```

### Environment Setup

1. Set `NODE_ENV=production`
2. Configure production database URLs
3. Set strong JWT secrets and encryption keys
4. Configure CORS origins for production domains
5. Set up monitoring and logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Ensure linting passes
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the API documentation
- Review the health check endpoints
- Check the application logs

## 🔮 Roadmap

- [ ] User management and profiles
- [ ] Template versioning
- [ ] Advanced search with Elasticsearch
- [ ] Webhook support
- [ ] API analytics and metrics
- [ ] Multi-tenant support
- [ ] GraphQL API
- [ ] Real-time notifications
- [ ] Bulk operations
- [ ] Template sharing and collaboration
