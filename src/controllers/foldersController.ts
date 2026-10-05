import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function getYearFolders(req: Request, res: Response): Promise<void> {
  const { yearId } = req.params;
  try {
    const folders = await prisma.folder.findMany({
      where: { yearId },
      include: {
        _count: {
          select: { files: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const data = folders.map((f) => ({
      id: f.id,
      name: f.name,
      year_id: f.yearId,
      created_at: f.createdAt,
      file_count: f._count.files,
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ message: 'Lỗi khi tải danh sách thư mục' });
  }
}

export async function getFolderDetail(req: Request, res: Response): Promise<void> {
  const { folderId } = req.params;
  try {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        year: true,
      },
    });

    if (!folder) {
      res.status(404).json({ message: 'Không tìm thấy thư mục' });
      return;
    }

    res.json({
      id: folder.id,
      name: folder.name,
      year_id: folder.yearId,
      created_at: folder.createdAt,
      year: folder.year.year,
    });
  } catch (error) {
    console.error('Error fetching folder detail:', error);
    res.status(500).json({ message: 'Lỗi khi tải thông tin thư mục' });
  }
}
