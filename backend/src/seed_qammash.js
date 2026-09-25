const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding Qammash Platform data...');

  // 1. Teacher
  const teacherPw = await bcrypt.hash('admin123', 10);
  const teacher = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password: teacherPw },
    create: { username: 'admin', password: teacherPw, role: 'teacher' }
  });
  console.log('Teacher ready:', teacher.username);

  // 2. Assistants (Multiple assistants as requested by user)
  const assistantPw = await bcrypt.hash('123', 10);
  const perms = JSON.stringify(['students', 'groups', 'sessions', 'attendance', 'payments', 'exams', 'books']);
  const assistant1 = await prisma.user.upsert({
    where: { username: 'أحمد_المساعد' },
    update: { password: assistantPw, permissions: perms },
    create: { username: 'أحمد_المساعد', password: assistantPw, role: 'assistant', permissions: perms }
  });
  console.log('Assistant 1 ready:', assistant1.username);

  const assistant2 = await prisma.user.upsert({
    where: { username: 'سارة_المساعدة' },
    update: { password: assistantPw, permissions: perms },
    create: { username: 'سارة_المساعدة', password: assistantPw, role: 'assistant', permissions: perms }
  });
  console.log('Assistant 2 ready:', assistant2.username);

  // Remove old generic user if exists to keep list clean
  await prisma.user.deleteMany({ where: { username: 'assistant' } });

  // 3. Offer
  const offer = await prisma.offer.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, title: 'اشتراك شهري عادي', type: 'amount', value: 0 }
  });

  // 4. Group
  let group = await prisma.group.findFirst({ where: { name: 'الصف الأول الثانوي - مجموعة السبت والثلاثاء (سنتر الأوائل)' } });
  if (!group) {
    group = await prisma.group.create({
      data: {
        name: 'الصف الأول الثانوي - مجموعة السبت والثلاثاء (سنتر الأوائل)',
        grade: 'الصف الأول الثانوي'
      }
    });
  }
  console.log('Group ready:', group.name);

  // 5. Session
  let session = await prisma.session.findFirst({ where: { groupId: group.id } });
  if (!session) {
    session = await prisma.session.create({
      data: {
        title: 'حصة 1: مقدمة وشرح الباب الأول',
        groupId: group.id,
        price: 70,
        duration: 2,
        date: new Date(),
        active: true,
        type: 'session'
      }
    });
  }
  console.log('Session ready:', session.title);

  // 6. Students
  const studentsData = [
    { name: 'زياد طارق إبراهيم', phoneNumber: '01012345671', dadPhoneNumber: '01112345671', sex: 'ذكر' },
    { name: 'مريم أحمد حسانين', phoneNumber: '01012345672', dadPhoneNumber: '01112345672', sex: 'أنثى' },
    { name: 'يوسف كريم الدسوقي', phoneNumber: '01012345673', dadPhoneNumber: '01112345673', sex: 'ذكر' },
    { name: 'نور حسام الشربيني', phoneNumber: '01012345674', dadPhoneNumber: '01112345674', sex: 'أنثى' },
    { name: 'عمر خالد المنشاوي', phoneNumber: '01012345675', dadPhoneNumber: '01112345675', sex: 'ذكر' }
  ];

  for (const s of studentsData) {
    let student = await prisma.student.findFirst({ where: { name: s.name } });
    if (!student) {
      student = await prisma.student.create({
        data: {
          name: s.name,
          phoneNumber: s.phoneNumber,
          dadPhoneNumber: s.dadPhoneNumber,
          sex: s.sex,
          groupId: group.id,
          offerId: offer.id,
          active: true
        }
      });
    }

    // Attendance
    await prisma.attendance.upsert({
      where: { studentId_sessionId: { studentId: student.id, sessionId: session.id } },
      update: {},
      create: {
        studentId: student.id,
        sessionId: session.id,
        isAttendant: false,
        amountPaid: 0
      }
    });
  }
  console.log('5 Students seeded with attendance in session!');

  // 7. Book
  const book = await prisma.book.upsert({
    where: { title_grade: { title: 'مذكرة الفيزياء - الفصل الدراسي الأول', grade: 'الصف الأول الثانوي' } },
    update: {},
    create: {
      title: 'مذكرة الفيزياء - الفصل الدراسي الأول',
      grade: 'الصف الأول الثانوي',
      price: 60
    }
  });
  console.log('Book ready:', book.title);

  console.log('All seed data successfully injected!');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
