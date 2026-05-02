import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.contact.groupBy({ by: ['emailStatus'], _count: true });
  console.log('--- 更新前 ---');
  console.table(before.map(b => ({ emailStatus: b.emailStatus, count: b._count })));

  const result = await prisma.contact.updateMany({
    where: { emailStatus: { not: 'SENT' } },
    data: { emailStatus: 'SENT' },
  });
  console.log(`--- ${result.count}件 を SENT に更新しました ---`);

  const after = await prisma.contact.groupBy({ by: ['emailStatus'], _count: true });
  console.log('--- 更新後 ---');
  console.table(after.map(b => ({ emailStatus: b.emailStatus, count: b._count })));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
