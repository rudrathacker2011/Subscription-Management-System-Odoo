const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$connect()
  .then(() => { console.log('CONNECTED OK'); return p.$disconnect(); })
  .catch(e => { console.error('FAIL:', e.message); });
