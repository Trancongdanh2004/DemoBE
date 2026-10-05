import { Router } from 'express';
import { getYears } from '../controllers/yearsController';
import { getYearFolders, getFolderDetail } from '../controllers/foldersController';
import { getFolderFiles, uploadFiles, downloadFile, viewFile } from '../controllers/filesController';
import {
  adminLogin,
  getAdminFiles,
  deleteAdminFile,
  bulkDeleteFiles,
  createYear,
  updateYear,
  deleteYear,
  createFolder,
  renameFolder,
  deleteFolder,
  getDashboardStats,
} from '../controllers/adminController';
import { authMiddleware } from '../middlewares/auth';
import { uploadMiddleware } from '../middlewares/upload';
import { uploadLimiter } from '../middlewares/rateLimiter';

const router = Router();

// ================= CÁC TUYẾN ĐƯỜNG CÔNG KHAI (NGƯỜI DÙNG) =================
router.get('/years', getYears);
router.get('/years/:yearId/folders', getYearFolders);
router.get('/folders/:folderId', getFolderDetail);
router.get('/folders/:folderId/files', getFolderFiles);
router.post(
  '/folders/:folderId/files',
  uploadLimiter,
  uploadMiddleware.array('files', 10),
  uploadFiles
);
router.get('/files/:id/download', downloadFile);
router.get('/files/:id/view', viewFile);

// ================= TUYẾN ĐƯỜNG XÁC THỰC QUẢN TRỊ VIÊN =================
router.post('/admin/login', adminLogin);

// ================= CÁC TUYẾN ĐƯỜNG BẢO VỆ CHO QUẢN TRỊ VIÊN =================
router.use('/admin', authMiddleware);

router.get('/admin/files', getAdminFiles);
router.delete('/admin/files/:id', deleteAdminFile);
router.post('/admin/files/bulk-delete', bulkDeleteFiles);

router.post('/admin/years', createYear);
router.patch('/admin/years/:id', updateYear);
router.delete('/admin/years/:id', deleteYear);

router.post('/admin/years/:yearId/folders', createFolder);
router.patch('/admin/folders/:id', renameFolder);
router.delete('/admin/folders/:id', deleteFolder);

router.get('/admin/stats', getDashboardStats);

export default router;
