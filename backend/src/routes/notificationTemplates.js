const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { normalizeEgyptianPhone, sendTextMessage } = require('../utils/whatsapp');
const { renderTemplate } = require('../utils/notificationHelpers');

const VALID_TEMPLATE_TYPES = ['attendance_present', 'attendance_absent', 'exam_grade_good', 'exam_grade_bad', 'new_session', 'new_lecture', 'payment_added_sessions', 'payment_added_book', 'custom'];

const SAMPLE_TOKENS = {
  'اسم_الطالب': 'أحمد محمد',
  'اسم_المجموعة': 'مجموعة أ',
  'عنوان_الحصة': 'حصة الرياضيات',
  'عنوان_المحاضرة': 'محاضرة المراجعة',
  'عنوان_الامتحان': 'امتحان الشهر',
  'الحضور': 'حاضر',
  'الدرجة': '18',
  'الدرجة_الكلية': '20',
  'قيمة_الدفعة': '150',
  'تاريخ_الدفع': new Date().toLocaleDateString('ar-EG'),
  'المتبقي': '350',
  'التاريخ': new Date().toLocaleString('ar-EG')
};

function buildStudentTokens(student) {
  return {
    ...SAMPLE_TOKENS,
    'اسم_الطالب': student?.name || SAMPLE_TOKENS['اسم_الطالب'],
    'اسم_المجموعة': student?.group?.name || SAMPLE_TOKENS['اسم_المجموعة']
  };
}

// ============================================================
// CRUD قوالب الرسائل النصية
// ============================================================

// GET /api/notification-templates
router.get('/', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notification-templates
router.post('/', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { name, type, body, active } = req.body;
  if (!name || !type || !body) {
    return res.status(400).json({ error: 'name و type و body مطلوبة' });
  }
  if (!VALID_TEMPLATE_TYPES.includes(type)) {
    return res.status(400).json({ error: `نوع القالب غير صحيح. الأنواع المتاحة: ${VALID_TEMPLATE_TYPES.join(', ')}` });
  }
  try {
    const template = await prisma.notificationTemplate.create({
      data: { name, type, body, active: active !== false }
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/notification-templates/:id/test-send
router.post('/:id/test-send', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { phoneNumber, studentId, dryRun = false } = req.body;

  try {
    const template = await prisma.notificationTemplate.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const student = studentId
      ? await prisma.student.findUnique({ where: { id: parseInt(studentId) }, include: { group: true } })
      : null;
    const targetPhone = normalizeEgyptianPhone(phoneNumber || student?.dadPhoneNumber || student?.phoneNumber);
    const message = renderTemplate(template.body, buildStudentTokens(student));

    if (!targetPhone) return res.status(400).json({ error: 'phoneNumber or studentId is required' });
    if (dryRun) return res.json({ dryRun: true, phoneNumber: targetPhone, message });

    const result = await sendTextMessage({ to: targetPhone, message });
    const chatMessage = await prisma.chatMessage.create({
      data: {
        studentId: student?.id || null,
        recipientType: student ? (targetPhone === normalizeEgyptianPhone(student.dadPhoneNumber) ? 'parent' : 'student') : 'unknown',
        phoneNumber: targetPhone,
        direction: 'outgoing',
        message,
        status: 'sent',
        waMessageId: result.waMessageId,
        sentByUserId: req.session.userId
      }
    });

    res.json({ sent: true, phoneNumber: targetPhone, message, chatMessage });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PUT /api/notification-templates/:id
router.put('/:id', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { name, type, body, active } = req.body;
  if (type && !VALID_TEMPLATE_TYPES.includes(type)) {
    return res.status(400).json({ error: `نوع القالب غير صحيح. الأنواع المتاحة: ${VALID_TEMPLATE_TYPES.join(', ')}` });
  }
  try {
    const template = await prisma.notificationTemplate.update({
      where: { id: parseInt(req.params.id) },
      data: { name, type, body, active }
    });
    res.json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/notification-templates/:id
router.delete('/:id', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    await prisma.notificationTemplate.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
