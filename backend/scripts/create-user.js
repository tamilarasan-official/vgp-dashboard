// Create or update a dashboard login.
// Usage: node scripts/create-user.js <email> "<Full Name>" <role> [password]
//   role: admin | viewer | tally_uploader | feedback_uploader
//   If no password is given, a strong one is generated and printed ONCE.
require('dotenv').config({ quiet: true });
const { randomBytes, scryptSync } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const [email, name, role, given] = process.argv.slice(2);
const ROLES = ['admin', 'viewer', 'tally_uploader', 'feedback_uploader'];
if (!email || !name || !ROLES.includes(role)) {
  console.error('Usage: node scripts/create-user.js <email> "<Full Name>" <' + ROLES.join('|') + '> [password]');
  process.exit(1);
}
const password = given || randomBytes(12).toString('base64url');
if (password.length < 10) {
  console.error('Password must be at least 10 characters');
  process.exit(1);
}
const salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`;
const p = new PrismaClient();

(async () => {
  const e = email.trim().toLowerCase();
  await p.appUser.upsert({
    where: { email: e },
    create: { email: e, name, role, passwordHash },
    update: { name, role, passwordHash, active: true },
  });
  console.log(`OK: ${e} (${role})` + (given ? '' : `\nPassword: ${password}\n(shown once - share it securely)`));
  await p.$disconnect();
})();
