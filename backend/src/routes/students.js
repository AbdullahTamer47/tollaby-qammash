const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { summarizeStudentPayments } = require('../utils/payments');
const { reconcileStudentPayments } = require('../utils/wallet');
const { logAction } = require('../utils/logAction');
const { isDbConnectionError, cache: localCache, enqueueOfflineMutation, persistCache } = require('../utils/localDBSnapshot');

// GET /api/students
router.get('/', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { q, page = 1, per_page = 15, groupId, active, grade, sex, cardPrinted } = req.query;
  try {
    const where = {
      ...(q && {
        OR: [
          { name: { contains: q } },
          { id: isNaN(q) ? undefined : { equals: parseInt(q) } },
          { phoneNumber: { contains: q } },
          { dadPhoneNumber: { contains: q } }
        ].filter(Boolean)
      }),
      ...(groupId && { groupId: parseInt(groupId) }),
      ...(active !== undefined && active !== '' && { active: active === 'true' }),
      ...(cardPrinted !== undefined && cardPrinted !== '' && { cardPrinted: cardPrinted === 'true' }),
      ...(sex && { sex }),
      ...(grade && { group: { grade } })
    };
    const skip = (parseInt(page) - 1) * parseInt(per_page);
    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where, skip, take: parseInt(per_page),
        orderBy: { id: 'asc' },
        include: { group: true, offer: true }
      }),
      prisma.student.count({ where })
    ]);
    res.json({ students, total, page: parseInt(page), per_page: parseInt(per_page) });
  } catch (err) {
    if (isDbConnectionError(err)) {
      console.warn('⚡ DB offline: Serving students from local cache');
      let list = localCache.students || [];
      if (groupId) list = list.filter(s => s.groupId === parseInt(groupId));
      if (active !== undefined && active !== '') {
        list = list.filter(s => Boolean(s.active) === (active === 'true'));
      }
      if (cardPrinted !== undefined && cardPrinted !== '') {
        list = list.filter(s => Boolean(s.cardPrinted) === (cardPrinted === 'true'));
      }
      if (q && q.trim()) {
        const query = q.trim().toLowerCase();
        list = list.filter(s =>
          (s.name || '').toLowerCase().includes(query) ||
          String(s.id) === query ||
          (s.phoneNumber || '').includes(query) ||
          (s.dadPhoneNumber || '').includes(query)
        );
      }
      const pageNum = parseInt(page) || 1;
      const perPageNum = parseInt(per_page) || 15;
      const skip = (pageNum - 1) * perPageNum;
      const paginated = list.slice(skip, skip + perPageNum);
      return res.json({
        students: paginated,
        total: list.length,
        page: pageNum,
        per_page: perPageNum,
        isOfflineFallback: true
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students
router.post('/', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const name = req.body.name;
  const phoneNumber = req.body.phoneNumber || req.body.phone;
  const dadPhoneNumber = req.body.dadPhoneNumber || req.body.parent_phone || req.body.parentPhone;
  const sex = req.body.sex || 'male';
  const rawGroupId = req.body.groupId || req.body.group_id;
  const rawOfferId = req.body.offerId || req.body.offer_id;
  const active = req.body.active !== undefined ? req.body.active : true;
  try {
    const parsedGroupId = parseInt(rawGroupId);
    let parsedOfferId = parseInt(rawOfferId);
    if (!Number.isInteger(parsedGroupId)) return res.status(400).json({ error: 'Group is required' });
    if (!Number.isInteger(parsedOfferId)) {
      const defaultOffer = await prisma.offer.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, title: 'بدون خصم', type: 'percentage', value: 0 }
      });
      parsedOfferId = defaultOffer.id;
    }
    const student = await prisma.student.create({
      data: { name, phoneNumber, dadPhoneNumber, sex, groupId: parsedGroupId, offerId: parsedOfferId, active: !!active },
      include: { group: true, offer: true }
    });
    await logAction(prisma, req, `إضافة طالب ${name}`, 'POST');
    res.status(201).json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/students/barcodes?group_id=
router.get('/barcodes/print', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { group_id } = req.query;
  try {
    const where = group_id ? { groupId: parseInt(group_id) } : {};
    const [students, groups] = await Promise.all([
      prisma.student.findMany({ where, include: { group: true }, orderBy: { id: 'asc' } }),
      prisma.group.findMany({ orderBy: { name: 'asc' } })
    ]);
    res.json({ students, groups, selectedGroupId: group_id ? parseInt(group_id) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/students/:id
router.get('/:id', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const student = await prisma.student.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { group: true, offer: true }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/students/:id
router.put('/:id', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const name = req.body.name;
  const phoneNumber = req.body.phoneNumber || req.body.phone;
  const dadPhoneNumber = req.body.dadPhoneNumber || req.body.parent_phone || req.body.parentPhone;
  const sex = req.body.sex;
  const rawGroupId = req.body.groupId || req.body.group_id;
  const rawOfferId = req.body.offerId || req.body.offer_id;
  const active = req.body.active;
  try {
    const parsedGroupId = rawGroupId !== undefined ? parseInt(rawGroupId) : undefined;
    let parsedOfferId = rawOfferId !== undefined ? parseInt(rawOfferId) : undefined;
    if (parsedGroupId !== undefined && !Number.isInteger(parsedGroupId)) return res.status(400).json({ error: 'Group is required' });
    if (!Number.isInteger(parsedOfferId)) {
      const defaultOffer = await prisma.offer.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, title: 'بدون خصم', type: 'percentage', value: 0 }
      });
      parsedOfferId = defaultOffer.id;
    }
    const student = await prisma.$transaction(async tx => {
      const updated = await tx.student.update({
        where: { id: parseInt(req.params.id) },
        data: { name, phoneNumber, dadPhoneNumber, sex, groupId: parsedGroupId, offerId: parsedOfferId, active: !!active },
        include: { group: true, offer: true }
      });
      await reconcileStudentPayments(tx, updated.id);
      await logAction(tx, req, `تعديل الطالب ${name}`, 'PUT');
      return updated;
    });
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/students/:id
router.delete('/:id', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const student = await prisma.student.findUnique({ where: { id: parseInt(req.params.id) } });
    await prisma.student.delete({ where: { id: parseInt(req.params.id) } });
    await logAction(prisma, req, `حذف الطالب ${student?.name}`, 'DELETE');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:id/activate  - toggle active
router.post('/:id/activate', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const student = await prisma.student.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const updated = await prisma.student.update({
      where: { id: parseInt(req.params.id) },
      data: { active: !student.active }
    });
    await logAction(prisma, req, `تغيير حالة الطالب ${student.name}`, 'POST');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:id/change-group
router.post('/:id/change-group', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { groupId } = req.body;
  try {
    const student = await prisma.$transaction(async tx => {
      const updated = await tx.student.update({
        where: { id: parseInt(req.params.id) },
        data: { groupId: parseInt(groupId) },
        include: { group: true }
      });
      await reconcileStudentPayments(tx, updated.id);
      await logAction(tx, req, `نقل الطالب ${updated.name} إلى مجموعة ${updated.group.name}`, 'POST');
      return updated;
    });
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/students/:id/dashboard
router.get('/:id/dashboard', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const studentId = parseInt(req.params.id);
  if (isNaN(studentId)) {
    return res.status(400).json({ error: 'Invalid student ID' });
  }
  
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { group: true, offer: true }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const [allAttendance, eachPayments, examResults, allGroups] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId },
        include: { session: { include: { group: true } } },
        orderBy: { session: { date: 'desc' } }
      }),
      prisma.eachPayment.findMany({ where: { studentId }, orderBy: { lastPaymentDate: 'desc' } }),
      prisma.studentDegree.findMany({
        where: { studentId },
        include: { exam: true },
        orderBy: { examId: 'desc' }
      }),
      prisma.group.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] })
    ]);

    const attended = allAttendance.filter(a => a.isAttendant);
    const totalAttended = attended.length;
    const totalGroupSessions = allAttendance.length;
    const attendancePercentage = totalGroupSessions > 0 ? (totalAttended / totalGroupSessions) * 100 : 0;

    // Books logic
    const studentGrade = student.group?.grade;
    const allBooks = await prisma.book.findMany();
    const availableBooks = allBooks.filter(b => !b.grade || b.grade === studentGrade);
    
    const bookBookings = await prisma.bookBooking.findMany({
      where: { studentId },
      include: { book: true }
    });
    const bookedBookIds = bookBookings.map(b => b.bookId);

    student.bookBookings = bookBookings;
    student.attendance = allAttendance;
    student.eachPayments = eachPayments;
    const paymentSummary = summarizeStudentPayments(student);

    res.json({
      student,
      allAttendance,
      totalGroupSessions,
      totalAttended,
      attendancePercentage,
      payment: paymentSummary,
      eachPayments,
      examResults,
      allGroups,
      totalSessionCost: paymentSummary.sessionsDue,
      discountAmount: 0,
      finalAmountAfterDiscount: paymentSummary.sessionsDue,
      availableBooks,
      bookedBookIds,
      bookBookings
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/bulk-card-printed
router.post('/bulk-card-printed', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { studentIds, printed = true } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: 'مصفوفة الطلاب مطلوبة' });
  }
  const ids = studentIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  try {
    await prisma.student.updateMany({
      where: { id: { in: ids } },
      data: { cardPrinted: Boolean(printed) }
    });
    // Update local cache
    if (localCache.students) {
      const idsSet = new Set(ids);
      localCache.students = localCache.students.map(s => idsSet.has(s.id) ? { ...s, cardPrinted: Boolean(printed) } : s);
      persistCache();
    }
    await logAction(prisma, req, `تحديث حالة طباعة الكروت لـ ${ids.length} طالب إلى ${printed ? 'تمت الطباعة' : 'لم تُطبع'}`, 'POST').catch(() => {});
    res.json({ success: true, count: ids.length, printed: Boolean(printed) });
  } catch (err) {
    if (isDbConnectionError(err)) {
      console.warn('⚡ DB offline: Enqueueing bulk card printed mutation');
      if (localCache.students) {
        const idsSet = new Set(ids);
        localCache.students = localCache.students.map(s => idsSet.has(s.id) ? { ...s, cardPrinted: Boolean(printed) } : s);
        persistCache();
      }
      enqueueOfflineMutation({ type: 'BULK_CARD_PRINTED', data: { studentIds: ids, printed: Boolean(printed) } });
      return res.json({ success: true, count: ids.length, printed: Boolean(printed), isOfflineFallback: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:id/card-printed
router.post('/:id/card-printed', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const studentId = parseInt(req.params.id);
  const { printed } = req.body;
  try {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
    const newStatus = printed !== undefined ? Boolean(printed) : !student.cardPrinted;
    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { cardPrinted: newStatus }
    });
    if (localCache.students) {
      localCache.students = localCache.students.map(s => s.id === studentId ? { ...s, cardPrinted: newStatus } : s);
      persistCache();
    }
    res.json(updated);
  } catch (err) {
    if (isDbConnectionError(err)) {
      const cached = (localCache.students || []).find(s => s.id === studentId);
      const newStatus = printed !== undefined ? Boolean(printed) : !(cached?.cardPrinted);
      if (localCache.students) {
        localCache.students = localCache.students.map(s => s.id === studentId ? { ...s, cardPrinted: newStatus } : s);
        persistCache();
      }
      enqueueOfflineMutation({ type: 'BULK_CARD_PRINTED', data: { studentIds: [studentId], printed: newStatus } });
      return res.json({ id: studentId, cardPrinted: newStatus, isOfflineFallback: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/import-excel
router.post('/import-excel', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { students: rawStudents, defaultGroupId, defaultOfferId = 1 } = req.body;

  if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
    return res.status(400).json({ error: 'لم يتم إرسال بيانات طلاب للاستيراد' });
  }

  try {
    // Get existing groups map (by name and grade)
    const existingGroups = await prisma.group.findMany();
    const groupMap = new Map();
    existingGroups.forEach(g => {
      groupMap.set(g.name.trim().toLowerCase(), g.id);
      groupMap.set(`${g.name.trim().toLowerCase()}_${(g.grade || '').trim().toLowerCase()}`, g.id);
    });

    // Default offer fallback
    let fallbackOfferId = parseInt(defaultOfferId) || 1;
    const defaultOffer = await prisma.offer.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, title: 'بدون خصم', type: 'percentage', value: 0 }
    });
    fallbackOfferId = defaultOffer.id;

    const createdList = [];
    const skippedList = [];
    const errorsList = [];

    for (let i = 0; i < rawStudents.length; i++) {
      const row = rawStudents[i];
      const name = (row.name || row['اسم الطالب'] || row['الاسم'] || '').trim();
      const phone = String(row.phoneNumber || row.phone || row['رقم الهاتف'] || row['هاتف الطالب'] || '').trim();
      const dadPhone = String(row.dadPhoneNumber || row.parentPhone || row['رقم ولي الأمر'] || row['هاتف ولي الأمر'] || '').trim();
      const rawSex = String(row.sex || row['النوع'] || row['الجنس'] || '').toLowerCase();
      const sex = rawSex.includes('أنث') || rawSex.includes('بنت') || rawSex === 'female' ? 'female' : 'male';
      const groupName = (row.groupName || row.group || row['المجموعة'] || row['اسم المجموعة'] || '').trim();
      const grade = (row.grade || row['الصف'] || row['الصف الدراسي'] || 'الصف الأول الثانوي').trim();

      if (!name) {
        skippedList.push({ row: i + 1, reason: 'الاسم مفقود' });
        continue;
      }

      // Determine Group ID
      let assignedGroupId = defaultGroupId ? parseInt(defaultGroupId) : null;
      if (!assignedGroupId && groupName) {
        const key = groupName.toLowerCase();
        if (groupMap.has(key)) {
          assignedGroupId = groupMap.get(key);
        } else {
          // Auto-create new group if not found!
          const newGroup = await prisma.group.create({
            data: { name: groupName, grade: grade || 'الصف الأول الثانوي' }
          });
          assignedGroupId = newGroup.id;
          groupMap.set(key, newGroup.id);
          existingGroups.push(newGroup);
        }
      }

      if (!assignedGroupId) {
        if (existingGroups.length > 0) {
          assignedGroupId = existingGroups[0].id;
        } else {
          const firstGroup = await prisma.group.create({
            data: { name: 'المجموعة العامة', grade: grade || 'الصف الأول الثانوي' }
          });
          assignedGroupId = firstGroup.id;
          existingGroups.push(firstGroup);
        }
      }

      try {
        const student = await prisma.student.create({
          data: {
            name,
            phoneNumber: phone || '01000000000',
            dadPhoneNumber: dadPhone || '01000000000',
            sex,
            groupId: assignedGroupId,
            offerId: fallbackOfferId,
            active: true
          },
          include: { group: true }
        });
        createdList.push({ id: student.id, name: student.name, group: student.group.name });
      } catch (insertErr) {
        errorsList.push({ row: i + 1, name, error: insertErr.message });
      }
    }

    await logAction(prisma, req, `استيراد إكسيل: تم بنجاح إضافة ${createdList.length} طالب`, 'POST');

    res.json({
      success: true,
      importedCount: createdList.length,
      skippedCount: skippedList.length,
      errorsCount: errorsList.length,
      createdStudents: createdList,
      skipped: skippedList,
      errors: errorsList
    });
  } catch (err) {
    console.error('Import excel error:', err);
    res.status(500).json({ error: 'فشل استيراد ملف الإكسيل: ' + err.message });
  }
});

module.exports = router;
