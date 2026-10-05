import process from 'node:process';
import { PrismaClient, FileType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database using Prisma...');

  const years = [2024, 2025, 2026];
  const defaultFolders = ['Văn bản A', 'Văn bản B', 'Văn bản C', 'Văn bản D'];

  const createdFolders: { id: string; name: string; year: number }[] = [];

  for (const yearVal of years) {
    const yearRecord = await prisma.year.upsert({
      where: { year: yearVal },
      update: {},
      create: { year: yearVal },
    });

    for (const folderName of defaultFolders) {
      const folderRecord = await prisma.folder.upsert({
        where: {
          yearId_name: {
            yearId: yearRecord.id,
            name: folderName,
          },
        },
        update: {},
        create: {
          yearId: yearRecord.id,
          name: folderName,
        },
      });

      createdFolders.push({
        id: folderRecord.id,
        name: folderRecord.name,
        year: yearVal,
      });
    }
  }

  console.log(`✅ Seeded ${years.length} years and ${createdFolders.length} folders.`);

  // Kiểm tra xem có truyền cờ --with-files hay không
  const withFiles = process.argv.includes('--with-files');
  if (withFiles && createdFolders.length > 0) {
    console.log('📄 Seeding 50 sample files for testing pagination...');

    const sampleUploaders = [
      { name: 'Nguyễn Văn An', unit: 'Phòng Hành chính' },
      { name: 'Trần Thị Bích', unit: 'Phòng Kế toán' },
      { name: 'Lê Hoàng Nam', unit: 'Phòng Nhân sự' },
      { name: 'Phạm Minh Tuấn', unit: 'Phòng Kỹ thuật' },
      { name: 'Hoàng Thu Trang', unit: 'Ban Giám đốc' },
      { name: 'Đỗ Quốc Bảo', unit: 'Phòng Kế hoạch' },
    ];

    const sampleTemplates: {
      name: string;
      type: FileType;
      mime: string;
      size: bigint;
    }[] = [
      {
        name: 'Quyết định bổ nhiệm cán bộ.pdf',
        type: 'pdf',
        mime: 'application/pdf',
        size: BigInt(1048576),
      },
      {
        name: 'Báo cáo tài chính quý 1.xlsx',
        type: 'excel',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: BigInt(2457600),
      },
      {
        name: 'Kế hoạch công tác tháng.docx',
        type: 'word',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: BigInt(524288),
      },
      {
        name: 'Thông báo lịch họp giao ban.pdf',
        type: 'pdf',
        mime: 'application/pdf',
        size: BigInt(419430),
      },
      {
        name: 'Bảng theo dõi tiến độ dự án.xlsx',
        type: 'excel',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: BigInt(3145728),
      },
      {
        name: 'Quy chế làm việc nội bộ.docx',
        type: 'word',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: BigInt(838860),
      },
    ];

    for (let i = 1; i <= 50; i++) {
      const folder = createdFolders[i % createdFolders.length];
      const template = sampleTemplates[i % sampleTemplates.length];
      const uploader = sampleUploaders[i % sampleUploaders.length];
      const publicId = `documents/${folder.year}/${folder.id}/sample_file_${i}_${Date.now()}`;
      const ext = template.type === 'pdf' ? 'pdf' : template.type === 'excel' ? 'xlsx' : 'docx';
      const fakeUrl = `https://res.cloudinary.com/demo/raw/upload/v1/${publicId}.${ext}`;

      const uploadTime = new Date(Date.now() - i * 3 * 3600 * 1000);

      await prisma.file.create({
        data: {
          folderId: folder.id,
          originalName: `[${i}] ${template.name}`,
          fileType: template.type,
          mimeType: template.mime,
          sizeBytes: template.size,
          cloudinaryUrl: fakeUrl,
          cloudinaryPublicId: publicId,
          uploaderName: uploader.name,
          uploaderUnit: uploader.unit,
          uploadedAt: uploadTime,
        },
      });
    }

    console.log('✅ Seeded 50 sample files successfully!');
  }

  console.log('🎉 Prisma seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
