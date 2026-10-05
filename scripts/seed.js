"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
dotenv_1.default.config();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ Error: DATABASE_URL is not set in .env');
    process.exit(1);
}
const pool = new pg_1.Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false,
    },
});
async function runSeed() {
    const client = await pool.connect();
    try {
        console.log('🌱 Seeding database...');
        const years = [2024, 2025, 2026];
        const defaultFolders = ['Văn bản A', 'Văn bản B', 'Văn bản C', 'Văn bản D'];
        await client.query('BEGIN');
        const folderIds = [];
        for (const year of years) {
            // Cập nhật hoặc thêm mới năm (upsert year)
            const yearRes = await client.query(`INSERT INTO years (id, year)
         VALUES (COALESCE((SELECT id FROM years WHERE year = $1), gen_random_uuid()), $1)
         ON CONFLICT (year) DO UPDATE SET year = EXCLUDED.year
         RETURNING id`, [year]);
            const yearId = yearRes.rows[0].id;
            for (const folderName of defaultFolders) {
                const folderRes = await client.query(`INSERT INTO folders (id, year_id, name)
           VALUES (COALESCE((SELECT id FROM folders WHERE year_id = $1 AND name = $2), gen_random_uuid()), $1, $2)
           ON CONFLICT (year_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`, [yearId, folderName]);
                folderIds.push({ id: folderRes.rows[0].id, name: folderName, year });
            }
        }
        console.log(`✅ Seeded ${years.length} years and ${folderIds.length} folders.`);
        // Kiểm tra xem có truyền cờ --with-files hay không
        const withFiles = process.argv.includes('--with-files');
        if (withFiles && folderIds.length > 0) {
            console.log('📄 Seeding 50 sample files for testing pagination...');
            const sampleUploaders = [
                { name: 'Nguyễn Văn An', unit: 'Phòng Hành chính' },
                { name: 'Trần Thị Bích', unit: 'Phòng Kế toán' },
                { name: 'Lê Hoàng Nam', unit: 'Phòng Nhân sự' },
                { name: 'Phạm Minh Tuấn', unit: 'Phòng Kỹ thuật' },
                { name: 'Hoàng Thu Trang', unit: 'Ban Giám đốc' },
                { name: 'Đỗ Quốc Bảo', unit: 'Phòng Kế hoạch' },
            ];
            const sampleFileTemplates = [
                { name: 'Quyết định bổ nhiệm cán bộ.pdf', type: 'pdf', mime: 'application/pdf', size: 1048576 },
                { name: 'Báo cáo tài chính quý 1.xlsx', type: 'excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 2457600 },
                { name: 'Kế hoạch công tác tháng.docx', type: 'word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 524288 },
                { name: 'Thông báo lịch họp giao ban.pdf', type: 'pdf', mime: 'application/pdf', size: 419430 },
                { name: 'Bảng theo dõi tiến độ dự án.xlsx', type: 'excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 3145728 },
                { name: 'Quy chế làm việc nội bộ.docx', type: 'word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 838860 },
            ];
            for (let i = 1; i <= 50; i++) {
                const folder = folderIds[i % folderIds.length];
                const template = sampleFileTemplates[i % sampleFileTemplates.length];
                const uploader = sampleUploaders[i % sampleUploaders.length];
                const publicId = `documents/${folder.year}/${folder.id}/sample_file_${i}_${Date.now()}`;
                const fakeUrl = `https://res.cloudinary.com/demo/raw/upload/v1/${publicId}.${template.type === 'pdf' ? 'pdf' : template.type === 'excel' ? 'xlsx' : 'docx'}`;
                await client.query(`INSERT INTO files (
            id, folder_id, original_name, file_type, mime_type, size_bytes,
            cloudinary_url, cloudinary_public_id, uploader_name, uploader_unit, uploaded_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now() - INTERVAL '${i * 3} hours')`, [
                    folder.id,
                    `[${i}] ${template.name}`,
                    template.type,
                    template.mime,
                    template.size,
                    fakeUrl,
                    publicId,
                    uploader.name,
                    uploader.unit,
                ]);
            }
            console.log('✅ Seeded 50 sample files successfully!');
        }
        await client.query('COMMIT');
        console.log('🎉 Seeding completed successfully!');
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
runSeed();
