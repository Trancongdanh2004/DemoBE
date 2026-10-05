"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🔄 Running database migrations...');
        const migrationFile = path_1.default.join(__dirname, '../migrations/001_initial_schema.sql');
        const sql = fs_1.default.readFileSync(migrationFile, 'utf-8');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✅ Migrations applied successfully!');
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
runMigration();
