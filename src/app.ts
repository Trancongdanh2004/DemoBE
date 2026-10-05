import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { generalLimiter } from './middlewares/rateLimiter';
import apiRouter from './routes';

const app = express();

// Cấu hình các tiêu đề bảo mật (Security headers)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
    frameguard: false,
  })
);

// Cấu hình CORS cho phép truy cập liên tên miền
app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép các yêu cầu không có origin (ví dụ: ứng dụng di động, curl, postman)
      if (!origin) return callback(null, true);
      if (origin === env.CLIENT_URL || origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      return callback(null, true); // Môi trường phát triển: linh hoạt chấp nhận các origin kết nối
    },
    credentials: true,
  })
);

// Middleware xử lý và phân tích cú pháp body dữ liệu gửi lên
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Áp dụng giới hạn tần suất gửi yêu cầu (Rate limiting) cho toàn bộ API
app.use(generalLimiter);

// API kiểm tra tình trạng hoạt động của hệ thống (Health check)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Định tuyến các API chính
app.use('/api', apiRouter);

// Middleware xử lý lỗi tập trung
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
