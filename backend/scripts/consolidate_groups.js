const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const g3 = await prisma.group.findUnique({ where: { id: 3 } });
  console.log('Target group:', g3?.name);

  // 1. Move all students to group 3
  const updatedStudents = await prisma.student.updateMany({
    data: { groupId: 3 }
  });
  console.log('Updated students count:', updatedStudents.count);

  // 2. Reassign any sessions in other groups to group 3
  const updatedSessions = await prisma.session.updateMany({
    where: { groupId: { not: 3 } },
    data: { groupId: 3 }
  });
  console.log('Updated sessions count:', updatedSessions.count);

  // 3. Reassign any exams in other groups to group 3
  const updatedExams = await prisma.exam.updateMany({
    where: { groupId: { not: 3 } },
    data: { groupId: 3 }
  });
  console.log('Updated exams count:', updatedExams.count);

  // 4. Delete the other groups (4, 5, 6, 7)
  const deletedGroups = await prisma.group.deleteMany({
    where: { id: { not: 3 } }
  });
  console.log('Deleted other groups count:', deletedGroups.count);

  const remainingGroups = await prisma.group.findMany();
  console.log('Remaining groups count:', remainingGroups.length, remainingGroups.map(g => ({ id: g.id, name: g.name })));

  const students = await prisma.student.findMany({ select: { id: true, name: true, groupId: true } });
  console.log('Total students in group 3:', students.length);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
