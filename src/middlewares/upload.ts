import multer from 'multer';

// Lưu trữ tạm trong bộ nhớ (memory Buffer) để kiểm tra magic bytes và truyền luồng lên Cloudinary
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Tối đa 10 MB cho mỗi tệp tin
    files: 10, // Tối đa 10 tệp tin cho mỗi lần tải lên
  },
});
