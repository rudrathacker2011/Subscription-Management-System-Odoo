const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  try {
    await p.$connect();
    console.log('CONNECTED OK');
    const users = await p.user.findMany({
      select: { id: true, name: true, email: true, role: true }
    });
    console.log('USERS:', JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('FAIL:', e.message);
  } finally {
    await p.$disconnect();
  }
}

main();
