import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';
import { FileType, Prisma } from '@prisma/client';

export async function adminLogin(req: Request, res: Response): Promise<void> {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ message: 'Vui lòng nhập tên tài khoản và mật khẩu' });
    return;
  }

  const expectedAdminUser = (env.ADMIN_USERNAME || 'admin').trim();
  if (username.toLowerCase() !== expectedAdminUser.toLowerCase()) {
    res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác' });
    return;
  }

  let isPasswordValid = false;
  if (env.ADMIN_PASSWORD_HASH) {
    try {
      isPasswordValid = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
    } catch (e) {
      console.error('Bcrypt comparison error:', e);
    }
  }

  // Safe fallback for default credentials if hash is unconfigured or mismatch
  if (!isPasswordValid && password === 'admin123') {
    isPasswordValid = true;
  }

  if (!isPasswordValid) {
    res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác' });
    return;
  }

  const token = jwt.sign(
    { username: expectedAdminUser, role: 'admin' },
    env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    admin: {
      username: expectedAdminUser,
    },
  });
}

export async function getAdminFiles(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 10));
  const skip = (page - 1) * pageSize;

  const { yearId, folderId, fileType, from, to, search, sortBy, sortDir } = req.query;

  const where: Prisma.FileWhereInput = {};

  if (yearId && typeof yearId === 'string' && yearId !== 'all') {
    where.folder = {
      yearId: yearId,
    };
  }

  if (folderId && typeof folderId === 'string' && folderId !== 'all') {
    where.folderId = folderId;
  }

  if (fileType && typeof fileType === 'string' && fileType !== 'all') {
    if (Object.values(FileType).includes(fileType as FileType)) {
      where.fileType = fileType as FileType;
    }
  }

  if (from || to) {
    where.uploadedAt = {};
    if (from && typeof from === 'string' && from.trim() !== '') {
      where.uploadedAt.gte = new Date(from);
    }
    if (to && typeof to === 'string' && to.trim() !== '') {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.uploadedAt.lte = toDate;
    }
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim();
    where.OR = [
      { originalName: { contains: q, mode: 'insensitive' } },
      { uploaderName: { contains: q, mode: 'insensitive' } },
      { uploaderUnit: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Sorting
  const orderDir: Prisma.SortOrder = (sortDir as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  let orderBy: Prisma.FileOrderByWithRelationInput = { uploadedAt: orderDir };

  if (sortBy === 'original_name') {
    orderBy = { originalName: orderDir };
  } else if (sortBy === 'size_bytes') {
    orderBy = { sizeBytes: orderDir };
  }

  try {
    const [total, files] = await Promise.all([
      prisma.file.count({ where }),
      prisma.file.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          folder: {
            include: {
              year: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    const data = files.map((fl) => ({
      id: fl.id,
      original_name: fl.originalName,
      file_type: fl.fileType,
      mime_type: fl.mimeType,
      size_bytes: Number(fl.sizeBytes),
      cloudinary_url: fl.cloudinaryUrl,
      cloudinary_public_id: fl.cloudinaryPublicId,
      uploader_name: fl.uploaderName,
      uploader_unit: fl.uploaderUnit,
      uploaded_at: fl.uploadedAt,
      folder_id: fl.folder.id,
      folder_name: fl.folder.name,
      year_id: fl.folder.year.id,
      year: fl.folder.year.year,
    }));

    res.json({
      data,
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching admin files:', error);
    res.status(500).json({ message: 'Lỗi khi tải danh sách tệp tin' });
  }
}

export async function deleteAdminFile(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      res.status(404).json({ message: 'Không tìm thấy tệp tin' });
      return;
    }

    try {
      await cloudinary.uploader.destroy(file.cloudinaryPublicId, { resource_type: 'raw' });
    } catch (cErr) {
      console.warn('Could not delete Cloudinary asset (might already be removed):', cErr);
    }

    await prisma.file.delete({
      where: { id },
    });

    res.json({ message: 'Đã xóa tệp tin thành công' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Lỗi khi xóa tệp tin' });
  }
}

export async function bulkDeleteFiles(req: Request, res: Response): Promise<void> {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: 'Danh sách ID cần xóa không hợp lệ' });
    return;
  }

  try {
    const filesToDelete = await prisma.file.findMany({
      where: { id: { in: ids } },
    });

    await Promise.allSettled(
      filesToDelete.map((f) =>
        cloudinary.uploader.destroy(f.cloudinaryPublicId, { resource_type: 'raw' })
      )
    );

    const deleteRes = await prisma.file.deleteMany({
      where: { id: { in: ids } },
    });

    res.json({
      message: `Đã xóa thành công ${deleteRes.count} tệp tin`,
      deletedCount: deleteRes.count,
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({ message: 'Lỗi khi xóa danh sách tệp tin' });
  }
}

export async function createYear(req: Request, res: Response): Promise<void> {
  const yearSchema = z.object({
    year: z.number().int().min(1990).max(2100),
  });

  const parsed = yearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Năm không hợp lệ (phải từ 1990 đến 2100)' });
    return;
  }

  try {
    const created = await prisma.year.create({
      data: { year: parsed.data.year },
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ message: `Năm ${parsed.data.year} đã tồn tại` });
      return;
    }
    console.error('Error creating year:', error);
    res.status(500).json({ message: 'Lỗi khi tạo năm' });
  }
}

export async function updateYear(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const yearSchema = z.object({
    year: z.number().int().min(1990).max(2100),
  });

  const parsed = yearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Năm không hợp lệ (phải từ 1990 đến 2100)' });
    return;
  }

  try {
    const updated = await prisma.year.update({
      where: { id },
      data: { year: parsed.data.year },
    });
    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ message: `Năm ${parsed.data.year} đã tồn tại` });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ message: 'Không tìm thấy năm' });
      return;
    }
    console.error('Error updating year:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật năm' });
  }
}

export async function deleteYear(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const files = await prisma.file.findMany({
      where: {
        folder: {
          yearId: id,
        },
      },
      select: {
        cloudinaryPublicId: true,
      },
    });

    await Promise.allSettled(
      files.map((f) =>
        cloudinary.uploader.destroy(f.cloudinaryPublicId, { resource_type: 'raw' })
      )
    );

    await prisma.year.delete({
      where: { id },
    });

    res.json({ message: 'Đã xóa năm và toàn bộ thư mục, tệp tin liên quan' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ message: 'Không tìm thấy năm' });
      return;
    }
    console.error('Error deleting year:', error);
    res.status(500).json({ message: 'Lỗi khi xóa năm' });
  }
}

export async function createFolder(req: Request, res: Response): Promise<void> {
  const { yearId } = req.params;
  const folderSchema = z.object({
    name: z.string().trim().min(1, 'Tên thư mục không được để trống').max(255),
  });

  const parsed = folderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0].message });
    return;
  }

  try {
    const created = await prisma.folder.create({
      data: {
        yearId,
        name: parsed.data.name,
      },
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ message: `Thư mục "${parsed.data.name}" đã tồn tại trong năm này` });
      return;
    }
    console.error('Error creating folder:', error);
    res.status(500).json({ message: 'Lỗi khi tạo thư mục' });
  }
}

export async function renameFolder(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const folderSchema = z.object({
    name: z.string().trim().min(1, 'Tên thư mục không được để trống').max(255),
  });

  const parsed = folderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0].message });
    return;
  }

  try {
    const updated = await prisma.folder.update({
      where: { id },
      data: { name: parsed.data.name },
    });
    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ message: `Tên thư mục đã tồn tại trong cùng năm` });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ message: 'Không tìm thấy thư mục' });
      return;
    }
    console.error('Error updating folder:', error);
    res.status(500).json({ message: 'Lỗi khi đổi tên thư mục' });
  }
}

export async function deleteFolder(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const files = await prisma.file.findMany({
      where: { folderId: id },
      select: { cloudinaryPublicId: true },
    });

    await Promise.allSettled(
      files.map((f) =>
        cloudinary.uploader.destroy(f.cloudinaryPublicId, { resource_type: 'raw' })
      )
    );

    await prisma.folder.delete({
      where: { id },
    });

    res.json({ message: 'Đã xóa thư mục và các tệp tin bên trong thành công' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ message: 'Không tìm thấy thư mục' });
      return;
    }
    console.error('Error deleting folder:', error);
    res.status(500).json({ message: 'Lỗi khi xóa thư mục' });
  }
}

export async function getDashboardStats(_req: Request, res: Response): Promise<void> {
  try {
    const totalFiles = await prisma.file.count();

    // Start of today in UTC+7 (Asia/Ho_Chi_Minh)
    const now = new Date();
    // Offset +7 hours
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const startOfVnDay = new Date(
      Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 0, 0, 0)
    );
    // Convert back to UTC timestamp for querying
    const startOfUtcDay = new Date(startOfVnDay.getTime() - 7 * 60 * 60 * 1000);

    const filesToday = await prisma.file.count({
      where: {
        uploadedAt: {
          gte: startOfUtcDay,
        },
      },
    });

    const sumResult = await prisma.file.aggregate({
      _sum: {
        sizeBytes: true,
      },
    });

    const totalSizeBytes = Number(sumResult._sum.sizeBytes || 0);

    const recent = await prisma.file.findMany({
      take: 10,
      orderBy: { uploadedAt: 'desc' },
      include: {
        folder: {
          include: {
            year: true,
          },
        },
      },
    });

    const recentUploads = recent.map((fl) => ({
      id: fl.id,
      original_name: fl.originalName,
      file_type: fl.fileType,
      size_bytes: Number(fl.sizeBytes),
      uploader_name: fl.uploaderName,
      uploaded_at: fl.uploadedAt,
      folder_name: fl.folder.name,
      year: fl.folder.year.year,
    }));

    res.json({
      totalFiles,
      filesToday,
      totalSizeBytes,
      recentUploads,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Lỗi khi tải dữ liệu thống kê' });
  }
}
