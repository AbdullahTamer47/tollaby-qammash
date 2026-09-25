const { normalizeEgyptianPhone, sendTextMessage } = require('./whatsapp');

/**
 * Check whether a parent has an open 24-hour conversation window.
 * Returns true if there is an incoming message from that phone within the last 24 hours.
 */
async function hasOpenConversationWindow(prisma, dadPhone) {
  const normalized = normalizeEgyptianPhone(dadPhone);
  if (!normalized) return false;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const msg = await prisma.chatMessage.findFirst({
    where: {
      phoneNumber: normalized,
      direction: 'incoming',
      createdAt: { gte: since }
    }
  });
  return !!msg;
}

/**
 * Replace {{placeholder}} tokens in a template body string.
 * Supports Arabic and English keys with underscores.
 * tokens = { 'اسم_الطالب': 'أحمد', 'عنوان_الحصة': 'الحصة 1', ... }
 */
function renderTemplate(body, tokens) {
  if (!body) return '';
  return body.replace(/\{\{([\u0600-\u06FFa-zA-Z0-9_]+)\}\}/g, (_, key) => tokens[key] !== undefined ? String(tokens[key]) : `{{${key}}}`);
}

/**
 * Core send function. Decides whether to send a text (free, inside window).
 * If the 24-hour conversation window is not open, it skips sending.
 *
 * @param {object} opts
 * @param {object} opts.prisma
 * @param {object} opts.student  - Student with group
 * @param {string} opts.type     - notification type key
 * @param {string} opts.textBody - resolved plain text for in-window send
 * @param {number} opts.sentByUserId
 * @param {boolean} opts.dryRun  - if true, don't actually send
 * @returns {{ sent: boolean, method: 'text'|'skipped'|'dry_run', phone: string }}
 */
async function sendParentNotification({ prisma, student, type, textBody, sentByUserId, dryRun = false }) {
  const phone = normalizeEgyptianPhone(student.dadPhoneNumber);
  if (!phone) return { sent: false, method: 'skipped', phone: null, reason: 'no_phone' };

  // Deduplication: prevent sending the exact same message to the same student within 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentDuplicate = await prisma.chatMessage.findFirst({
    where: {
      studentId: student.id,
      message: textBody,
      createdAt: { gte: twentyFourHoursAgo }
    }
  });

  if (recentDuplicate) {
    return { sent: false, method: 'skipped', phone, reason: 'duplicate' };
  }

  const windowOpen = await hasOpenConversationWindow(prisma, phone);

  // If there's an open window, send text message
  if (windowOpen) {
    if (dryRun) return { sent: false, method: 'dry_run', phone, window: true };

    const result = await sendTextMessage({ to: phone, message: textBody });
    await prisma.chatMessage.create({
      data: {
        studentId: student.id,
        recipientType: 'parent',
        phoneNumber: phone,
        direction: 'outgoing',
        message: textBody,
        status: 'sent',
        waMessageId: result.waMessageId,
        sentByUserId: sentByUserId || null
      }
    });
    return { sent: true, method: 'text', phone, window: true };
  }

  // Without an open window, we archive the message so it can be sent automatically later
  if (!dryRun) {
    await prisma.chatMessage.create({
      data: {
        studentId: student.id,
        recipientType: 'parent',
        phoneNumber: phone,
        direction: 'outgoing',
        message: textBody,
        status: 'archived',
        sentByUserId: sentByUserId || null
      }
    });
  }
  return { sent: false, method: 'archived', phone, reason: 'no_trigger', window: false };
}

/**
 * Safe wrapper that catches send errors and returns a structured result
 * instead of throwing.
 */
async function sendParentNotificationSafe(opts) {
  try {
    return await sendParentNotification(opts);
  } catch (err) {
    console.error(`❌ Notification failed for student ${opts.student?.id} (${opts.student?.name}):`, err.message);
    return {
      sent: false,
      method: 'failed',
      phone: normalizeEgyptianPhone(opts.student?.dadPhoneNumber),
      reason: err.message || 'send_failed'
    };
  }
}

/**
 * Find the active DB template for a given type, or fall back to a default.
 * All tokens use Arabic keys matching frontend TYPES placeholders.
 */
async function resolveTextTemplate(prisma, type, tokens, student = null) {
  const tpl = await prisma.notificationTemplate.findFirst({
    where: { type, active: true },
    orderBy: { updatedAt: 'desc' }
  });

  // Built-in fallbacks — Arabic keys
  const fallbacks = {
    attendance_present: 'مرحباً، {{اسم_الطالب}} كان {{الحضور}} في حصة {{عنوان_الحصة}} بتاريخ {{التاريخ}}.',
    attendance_absent:  'تنبيه: {{اسم_الطالب}} كان {{الحضور}} عن حصة {{عنوان_الحصة}} بتاريخ {{التاريخ}}.',
    exam_grade_good:    'تهانينا! حصل {{اسم_الطالب}} على درجة {{الدرجة}} من {{الدرجة_الكلية}} في {{عنوان_الامتحان}}.',
    exam_grade_bad:     'تنبيه: حصل {{اسم_الطالب}} على درجة ضعيفة {{الدرجة}} من {{الدرجة_الكلية}} في {{عنوان_الامتحان}}.',
    new_session:     'تم إضافة حصة جديدة: {{عنوان_الحصة}} للمجموعة {{اسم_المجموعة}} بتاريخ *{{التاريخ}}*.',
    new_lecture:     'تم إضافة محاضرة جديدة: {{عنوان_المحاضرة}} عن {{الوصف}} بتاريخ *{{التاريخ}}* ف *{{المكان}}*.',
    payment_added_sessions: 'تم استلام دفعة حصص بقيمة {{قيمة_الدفعة}} من الطالب {{اسم_الطالب}} بتاريخ {{تاريخ_الدفع}}. المتبقي: {{المتبقي}}.',
    payment_added_book:     'تم استلام دفعة كتب بقيمة {{قيمة_الدفعة}} من الطالب {{اسم_الطالب}} بتاريخ {{تاريخ_الدفع}}. المتبقي: {{المتبقي}}.',
  };
  const body = (tpl ? tpl.body : fallbacks[type]) || 'إشعار من المنظومة التعليمية.';

  if (student) {
    tokens['رقم_الهاتف'] = student.phoneNumber || '-';
    tokens['رقم_ولي_الأمر'] = student.dadPhoneNumber || '-';
    
    if (student.group) {
      tokens['اسم_المجموعة'] = tokens['اسم_المجموعة'] || student.group.name || '-';
      tokens['المجموعة'] = student.group.name || '-';
      tokens['الصف'] = student.group.grade || '-';
    }

    if (body.includes('{{المدفوع_الكلي}}') || body.includes('{{المتبقي_الكلي}}') || body.includes('{{الإجمالي_الكلي}}')) {
      const { summarizeStudentPayments } = require('./payments');
      let fullStudent = student;
      if (!fullStudent.eachPayments) {
        fullStudent = await prisma.student.findUnique({
          where: { id: student.id },
          include: { 
            group: true, offer: true,
            attendance: { include: { session: true } },
            bookBookings: { include: { book: true } },
            eachPayments: { orderBy: { lastPaymentDate: 'desc' } }
          }
        });
      }
      if (fullStudent) {
        const summary = summarizeStudentPayments(fullStudent);
        tokens['الإجمالي_الكلي'] = summary.amountDue;
        tokens['المدفوع_الكلي'] = summary.amountPaid;
        tokens['المتبقي_الكلي'] = summary.amountDue - summary.amountPaid;
      }
    }
  }

  return renderTemplate(body, tokens);
}

module.exports = {
  hasOpenConversationWindow,
  renderTemplate,
  sendParentNotification,
  sendParentNotificationSafe,
  resolveTextTemplate,
};
