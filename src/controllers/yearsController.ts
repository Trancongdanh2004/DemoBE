import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function getYears(_req: Request, res: Response): Promise<void> {
  try {
    const years = await prisma.year.findMany({
      include: {
        _count: {
          select: { folders: true },
        },
      },
      orderBy: {
        year: 'desc',
      },
    });

    const data = years.map((y) => ({
      id: y.id,
      year: y.year,
      created_at: y.createdAt,
      folder_count: y._count.folders,
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching years:', error);
    res.status(500).json({ message: 'Lỗi khi tải danh sách năm' });
  }
}
