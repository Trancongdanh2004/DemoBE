import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { generalLimiter } from './middlewares/rateLimiter';
import apiRouter from './routes';

const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
    frameguard: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or postman)
      if (!origin) return callback(null, true);
      if (origin === env.CLIENT_URL || origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      return callback(null, true); // Dev flexible origin
    },
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to all requests
app.use(generalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// API Routes
app.use('/api', apiRouter);

// Centralized error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Server Error:', err);

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'Dung lượng tệp vượt quá giới hạn cho phép (10MB)' });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({ message: 'Số lượng tệp vượt quá giới hạn (tối đa 10 tệp/lần)' });
      return;
    }
    res.status(400).json({ message: `Lỗi tải tệp: ${err.message}` });
    return;
  }

  res.status(err.status || 500).json({
    message: err.message || 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;
