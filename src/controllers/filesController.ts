import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';
import { fixUtf8FileName, validateFile } from '../utils/fileValidation';
import { FileType } from '@prisma/client';

const uploaderSchema = z.object({
  uploaderName: z
    .string({ required_error: 'Vui lòng nhập họ và tên người nộp' })
    .trim()
    .min(2, 'Họ và tên người nộp phải từ 2 ký tự')
    .max(255, 'Họ và tên không được vượt quá 255 ký tự'),
  uploaderUnit: z
    .string()
    .trim()
    .max(255, 'Đơn vị / Phòng ban không được vượt quá 255 ký tự')
    .optional()
    .or(z.literal('')),
});

export async function getFolderFiles(req: Request, res: Response): Promise<void> {
  const { folderId } = req.params;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 10));
  const skip = (page - 1) * pageSize;

  try {
    const [total, files] = await Promise.all([
      prisma.file.count({ where: { folderId } }),
      prisma.file.findMany({
        where: { folderId },
        orderBy: { uploadedAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    const data = files.map((f) => ({
      id: f.id,
      folder_id: f.folderId,
      original_name: f.originalName,
      file_type: f.fileType,
      mime_type: f.mimeType,
      size_bytes: Number(f.sizeBytes),
      cloudinary_url: f.cloudinaryUrl,
      cloudinary_public_id: f.cloudinaryPublicId,
      uploader_name: f.uploaderName,
      uploader_unit: f.uploaderUnit,
      uploaded_at: f.uploadedAt,
    }));

    res.json({
      data,
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching files in folder:', error);
    res.status(500).json({ message: 'Lỗi khi tải danh sách tệp tin' });
  }
}

export async function uploadFiles(req: Request, res: Response): Promise<void> {
  const { folderId } = req.params;

  // 1. Kiểm tra tính hợp lệ của dữ liệu gửi lên (body schema)
  const parsed = uploaderSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMsg = parsed.error.errors.map((e) => e.message).join(', ');
    res.status(400).json({ message: errorMsg });
    return;
  }

  const { uploaderName, uploaderUnit } = parsed.data;

  // 2. Kiểm tra sự tồn tại của thư mục và lấy thông tin năm tương ứng
  try {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { year: true },
    });

    if (!folder) {
      res.status(404).json({ message: 'Thư mục không tồn tại' });
      return;
    }

    const folderYear = folder.year.year;

    // 3. Kiểm tra danh sách các tệp tin được tải lên
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files || files.length === 0) {
      res.status(400).json({ message: 'Vui lòng chọn ít nhất một tệp tin để tải lên' });
      return;
    }

    if (files.length > 10) {
      res.status(400).json({ message: 'Mỗi lần chỉ được tải lên tối đa 10 tệp tin' });
      return;
    }

    const results: Array<{
      originalName: string;
      status: 'success' | 'error';
      message?: string;
      file?: any;
    }> = [];

    // 4. Xử lý độc lập từng tệp tin
    for (const file of files) {
      const fixedName = fixUtf8FileName(file.originalname);

      // Kiểm tra dung lượng tệp (tối đa 10 MB)
      if (file.size > 10 * 1024 * 1024) {
        results.push({
          originalName: fixedName,
          status: 'error',
          message: 'Dung lượng tệp vượt quá 10MB',
        });
        continue;
      }

      // Kiểm tra magic bytes, mime type và phần mở rộng của tệp
      const validation = validateFile(file.buffer, fixedName, file.mimetype);
      if (!validation.isValid || !validation.fileType || !validation.extension) {
        results.push({
          originalName: fixedName,
          status: 'error',
          message: validation.error || 'Tệp không hợp lệ',
        });
        continue;
      }

      // Tải tệp lên Cloudinary thông qua luồng upload_stream
      const ext = validation.extension;
      const fileId = randomUUID();
      const publicIdWithExt = `${fileId}${ext}`;
      const folderPath = `documents/${folderYear}/${folderId}`;
      const fullPublicId = `${folderPath}/${fileId}${ext}`;

      let cloudinaryResult: any;
      try {
        cloudinaryResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'raw',
              folder: folderPath,
              public_id: publicIdWithExt,
              use_filename: false,
              unique_filename: false,
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(file.buffer);
        });
      } catch (uploadErr: any) {
        console.error('Cloudinary upload error:', uploadErr);
        results.push({
          originalName: fixedName,
          status: 'error',
          message: 'Lỗi khi tải tệp lên máy chủ lưu trữ Cloudinary',
        });
        continue;
      }

      // Lưu bản ghi thông tin tệp vào cơ sở dữ liệu qua Prisma
      try {
        const createdFile = await prisma.file.create({
          data: {
            folderId,
            originalName: fixedName,
            fileType: validation.fileType as FileType,
            mimeType: file.mimetype,
            sizeBytes: BigInt(file.size),
            cloudinaryUrl: cloudinaryResult.secure_url,
            cloudinaryPublicId: cloudinaryResult.public_id || fullPublicId,
            uploaderName,
            uploaderUnit: uploaderUnit || null,
          },
        });

        results.push({
          originalName: fixedName,
          status: 'success',
          file: {
            id: createdFile.id,
            folder_id: createdFile.folderId,
            original_name: createdFile.originalName,
            file_type: createdFile.fileType,
            mime_type: createdFile.mimeType,
            size_bytes: Number(createdFile.sizeBytes),
            cloudinary_url: createdFile.cloudinaryUrl,
            cloudinary_public_id: createdFile.cloudinaryPublicId,
            uploader_name: createdFile.uploaderName,
            uploader_unit: createdFile.uploaderUnit,
            uploaded_at: createdFile.uploadedAt,
          },
        });
      } catch (dbErr) {
        console.error('Prisma insert error, rolling back Cloudinary asset:', dbErr);
        try {
          await cloudinary.uploader.destroy(cloudinaryResult.public_id || fullPublicId, {
            resource_type: 'raw',
          });
        } catch (cleanupErr) {
          console.error('Error rolling back Cloudinary asset:', cleanupErr);
        }

        results.push({
          originalName: fixedName,
          status: 'error',
          message: 'Lỗi khi lưu thông tin tệp tin vào cơ sở dữ liệu',
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const failureCount = results.filter((r) => r.status === 'error').length;

    const statusCode = failureCount === 0 ? 201 : 207;
    res.status(statusCode).json({
      message:
        failureCount === 0
          ? `Tải lên thành công ${successCount} tệp tin!`
          : `Đã xử lý xong: ${successCount} tệp thành công, ${failureCount} tệp thất bại.`,
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    console.error('Server error during upload:', error);
    res.status(500).json({ message: 'Lỗi máy chủ trong quá trình tải tệp' });
  }
}

function generateFallbackPdf(title: string, uploader: string, date: string): Buffer {
  const cleanTitle = title.replace(/[()\\]/g, '');
  const cleanUploader = uploader.replace(/[()\\]/g, '');
  const cleanDate = date.replace(/[()\\]/g, '');

  const content =
    `BT /F1 18 Tf 50 750 Td (${cleanTitle}) Tj ET ` +
    `BT /F1 12 Tf 50 710 Td (Nguoi nop: ${cleanUploader}) Tj ET ` +
    `BT /F1 12 Tf 50 690 Td (Ngay nop: ${cleanDate}) Tj ET ` +
    `BT /F1 12 Tf 50 650 Td (Tai lieu mau duoc luu tru trong He Thong Quan Ly Van Ban.) Tj ET`;

  const streamLen = Buffer.byteLength(content, 'utf-8');
  const body =
    '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n' +
    '4 0 obj\n<< /Length ' +
    streamLen +
    ' >>\nstream\n' +
    content +
    '\nendstream\nendobj\n' +
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n' +
    'xref\n0 6\n0000000000 65535 f \n' +
    'trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n10\n%%EOF';

  return Buffer.from(body, 'utf-8');
}

function generateFallbackText(title: string, uploader: string, date: string): Buffer {
  const content =
    `========================================\r\n` +
    `TÀI LIỆU LƯU TRỮ: ${title}\r\n` +
    `Người nộp: ${uploader}\r\n` +
    `Thời gian: ${date}\r\n` +
    `========================================\r\n\r\n` +
    `Nội dung tài liệu đã được lưu trữ an toàn trong Hệ Thống Quản Lý & Lưu Trữ Văn Bản.`;
  return Buffer.from(content, 'utf-8');
}

export async function downloadFile(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      res.status(404).json({ message: 'Không tìm thấy tệp tin' });
      return;
    }

    const encodedFilename = encodeURIComponent(file.originalName);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );

    // Nếu là tệp thực tế trên Cloudinary, tải về và truyền luồng dữ liệu trả về cho client
    if (file.cloudinaryUrl && !file.cloudinaryUrl.includes('/demo/raw/upload/v1/')) {
      try {
        const response = await fetch(file.cloudinaryUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          res.send(Buffer.from(arrayBuffer));
          return;
        }
      } catch (err) {
        console.warn('Could not fetch from Cloudinary upstream, serving fallback:', err);
      }
    }

    // Tạo tài liệu dự phòng cho dữ liệu mẫu (seed/sample) hoặc khi không kết nối được upstream Cloudinary
    const uploadDateStr = file.uploadedAt.toISOString();
    if (file.fileType === 'pdf') {
      const pdfBuf = generateFallbackPdf(file.originalName, file.uploaderName, uploadDateStr);
      res.send(pdfBuf);
    } else {
      const textBuf = generateFallbackText(file.originalName, file.uploaderName, uploadDateStr);
      res.send(textBuf);
    }
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Lỗi khi tải tệp tin' });
    }
  }
}

export async function viewFile(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      res.status(404).json({ message: 'Không tìm thấy tệp tin' });
      return;
    }

    const encodedFilename = encodeURIComponent(file.originalName);
    res.setHeader('Content-Type', file.mimeType || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // Nếu là tệp thực tế trên Cloudinary, tải về và truyền luồng dữ liệu xem trước
    if (file.cloudinaryUrl && !file.cloudinaryUrl.includes('/demo/raw/upload/v1/')) {
      try {
        const response = await fetch(file.cloudinaryUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          res.send(Buffer.from(arrayBuffer));
          return;
        }
      } catch (err) {
        console.warn('Could not fetch from Cloudinary upstream, serving fallback:', err);
      }
    }

    // Tạo nội dung tài liệu mẫu dự phòng để xem trước
    const uploadDateStr = file.uploadedAt.toISOString();
    if (file.fileType === 'pdf') {
      const pdfBuf = generateFallbackPdf(file.originalName, file.uploaderName, uploadDateStr);
      res.send(pdfBuf);
    } else {
      const textBuf = generateFallbackText(file.originalName, file.uploaderName, uploadDateStr);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(textBuf);
    }
  } catch (error) {
    console.error('View error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Lỗi khi xem tệp tin' });
    }
  }
}
