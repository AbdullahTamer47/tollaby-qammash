const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Teacher account
  const hashedPw = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: hashedPw, role: 'teacher' }
  });

  // Assistant account
  const assistantPw = await bcrypt.hash('assistant123', 10);
  await prisma.user.upsert({
    where: { username: 'assistant' },
    update: {},
    create: { username: 'assistant', password: assistantPw, role: 'assistant' }
  });

  // Default offer (no discount)
  const defaultOffer = await prisma.offer.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, title: 'بدون خصم', type: 'percentage', value: 0 }
  });

  console.log('✅ Seed complete!');
  console.log('👤 Teacher: admin / admin123');
  console.log('👤 Assistant: assistant / assistant123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
