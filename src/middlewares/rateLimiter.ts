import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Cửa sổ thời gian 15 phút
  max: process.env.NODE_ENV === 'production' ? 1000 : 50000, // Giới hạn số lượng yêu cầu (rộng rãi trong môi trường phát triển)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau 15 phút.',
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Cửa sổ thời gian 15 phút
  max: 50, // Giới hạn mỗi địa chỉ IP tối đa 50 lượt tải tệp trong vòng 15 phút
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Quá nhiều lượt tải lên từ địa chỉ IP này. Vui lòng thử lại sau 15 phút.',
  },
});
