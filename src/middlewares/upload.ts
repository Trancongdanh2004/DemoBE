import multer from 'multer';

// Storage in memory as Buffers so we can validate magic bytes and stream to Cloudinary
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max per file
    files: 10, // 10 files max per batch
  },
});
