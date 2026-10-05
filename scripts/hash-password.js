"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const password = process.argv[2] || 'admin123';
async function hashPassword() {
    const salt = await bcryptjs_1.default.genSalt(10);
    const hash = await bcryptjs_1.default.hash(password, salt);
    console.log(`\n========================================`);
    console.log(`Password: ${password}`);
    console.log(`Bcrypt Hash: ${hash}`);
    console.log(`\nCopy hash này vào file BE/.env:`);
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
    console.log(`========================================\n`);
}
hashPassword();
