import process from 'node:process';
import bcrypt from 'bcryptjs';

const password = process.argv[2] || 'admin123';

async function hashPassword() {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log(`\n========================================`);
  console.log(`Password: ${password}`);
  console.log(`Bcrypt Hash: ${hash}`);
  console.log(`\nCopy hash này vào file BE/.env:`);
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`========================================\n`);
}

hashPassword();
