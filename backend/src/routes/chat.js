const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { extractWebhookChanges, normalizeEgyptianPhone, sendTextMessage, verifyWebhookSignature } = require('../utils/whatsapp');
const { logAction } = require('../utils/logAction');
const { runBackgroundTask } = require('../utils/backgroundTask');

/**
 * Find a student by phone number using a direct DB query instead of loading all students.
 */
async function findStudentByPhone(prisma, phoneNumber) {
  const normalized = normalizeEgyptianPhone(phoneNumber);
  if (!normalized) return null;

  // Build candidate forms so we can search the DB directly.
  // Egyptian numbers in the DB might be stored as 01x..., +201x..., 201x..., etc.
  const candidates = new Set();
  candidates.add(normalized); // e.g. 201234567890
  if (normalized.startsWith('20')) {
    candidates.add('0' + normalized.slice(2));   // 01234567890
    candidates.add('+' + normalized);            // +201234567890
  }

  const candidateArray = [...candidates];

  const student = await prisma.student.findFirst({
    where: {
      OR: [
        { phoneNumber: { in: candidateArray } },
        { dadPhoneNumber: { in: candidateArray } },
      ]
    },
    include: { group: true }
  });

  return student || null;
}

function getRecipientPhone(student, recipientType) {
  return recipientType === 'parent' ? student.dadPhoneNumber : student.phoneNumber;
}

function getPagination(query, defaultPerPage = 20, maxPerPage = 100) {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(query.per_page) || defaultPerPage, 1), maxPerPage);
  return { page, perPage, skip: (page - 1) * perPage };
}

// GET /api/chat/archived - list students with archived messages
router.get('/archived', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const archived = await prisma.chatMessage.groupBy({
      by: ['studentId', 'phoneNumber'],
      where: { status: 'archived', direction: 'outgoing' },
      _count: { id: true },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    const results = [];
    for (const group of archived) {
      if (!group.studentId) continue;
      
      const student = await prisma.student.findUnique({
        where: { id: group.studentId },
        select: { id: true, name: true, dadPhoneNumber: true }
      });

      // Find the last message received from this phone number
      const lastIncoming = await prisma.chatMessage.findFirst({
        where: { phoneNumber: group.phoneNumber, direction: 'incoming' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });

      results.push({
        studentId: student?.id,
        studentName: student?.name,
        phoneNumber: group.phoneNumber,
        archivedCount: group._count.id,
        lastContactAt: lastIncoming ? lastIncoming.createdAt : null
      });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/archived/:studentId - list specific archived messages for a student
router.get('/archived/:studentId', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const studentId = parseInt(req.params.studentId);
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { studentId, status: 'archived', direction: 'outgoing' },
      orderBy: { createdAt: 'desc' }
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chat/archived - delete all archived messages
router.delete('/archived', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const result = await prisma.chatMessage.deleteMany({
      where: { status: 'archived', direction: 'outgoing' }
    });
    res.json({ success: true, count: result.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chat/archived/:id - delete specific archived message
router.delete('/archived/:id', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const msgId = parseInt(req.params.id);
  try {
    const message = await prisma.chatMessage.findUnique({ where: { id: msgId } });
    if (!message || message.status !== 'archived') {
      return res.status(404).json({ error: 'Message not found or not archived' });
    }
    await prisma.chatMessage.delete({ where: { id: msgId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/conversations - latest conversations grouped by phone number
router.get('/conversations', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { q = '' } = req.query;
  const { page, perPage, skip } = getPagination(req.query, 20, 50);
  try {
    const where = q
      ? {
          OR: [
            { phoneNumber: { contains: q } },
            { message: { contains: q } },
            { student: { name: { contains: q } } }
          ]
        }
      : {};

    const [conversationGroups, allGroups, unreadCounts] = await Promise.all([
      prisma.chatMessage.groupBy({
        by: ['phoneNumber'],
        where,
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
        skip,
        take: perPage
      }),
      prisma.chatMessage.groupBy({
        by: ['phoneNumber'],
        where,
        _count: { phoneNumber: true }
      }),
      prisma.chatMessage.groupBy({
        by: ['phoneNumber'],
        where: { ...where, direction: 'incoming', seenAt: null },
        _count: { phoneNumber: true }
      })
    ]);

    const latestWhere = conversationGroups
      .filter(row => row._max.createdAt)
      .map(row => ({ phoneNumber: row.phoneNumber, createdAt: row._max.createdAt }));
    const latestMessages = latestWhere.length
      ? await prisma.chatMessage.findMany({
          where: { OR: latestWhere },
          include: { student: { include: { group: true } } },
          orderBy: { createdAt: 'desc' }
        })
      : [];
    const latestByPhone = new Map(latestMessages.map(message => [message.phoneNumber, message]));
    const unreadByPhone = new Map(unreadCounts.map(row => [row.phoneNumber, row._count.phoneNumber]));
    res.json({
      conversations: conversationGroups.map(row => {
        const message = latestByPhone.get(row.phoneNumber);
        if (!message) return null;
        return {
        phoneNumber: message.phoneNumber,
        student: message.student,
        recipientType: message.recipientType,
        lastMessage: message,
        unreadIncoming: unreadByPhone.get(message.phoneNumber) || 0
        };
      }).filter(Boolean),
      total: allGroups.length,
      page,
      per_page: perPage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/conversations/summary - lightweight counters for chat tabs
router.get('/conversations/summary', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const [conversationGroups, incomingUnread, unknownIncoming] = await Promise.all([
      prisma.chatMessage.groupBy({ by: ['phoneNumber'], _count: { phoneNumber: true } }),
      prisma.chatMessage.count({ where: { direction: 'incoming', seenAt: null } }),
      prisma.chatMessage.count({ where: { studentId: null, direction: 'incoming' } })
    ]);

    res.json({
      conversations: conversationGroups.length,
      incomingUnread,
      unknownIncoming
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/recent - latest raw messages for quick auditing
router.get('/recent', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { page, perPage, skip } = getPagination(req.query, 30, 100);
  try {
    const where = req.query.direction ? { direction: req.query.direction } : {};
    const [messages, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where,
        include: { student: { include: { group: true } }, sentBy: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage
      }),
      prisma.chatMessage.count({ where })
    ]);

    res.json({ messages, total, page, per_page: perPage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/students?q=&page=&per_page=
router.get('/students', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { q = '' } = req.query;
  const { page, perPage, skip } = getPagination(req.query, 20, 100);
  try {
    const qNum = parseInt(q);
    const where = q
      ? { OR: [{ name: { contains: q } }, { phoneNumber: { contains: q } }, { dadPhoneNumber: { contains: q } }, ...(!isNaN(qNum) ? [{ id: qNum }] : [])] }
      : {};
    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: { group: true },
        orderBy: { name: 'asc' },
        skip,
        take: perPage
      }),
      prisma.student.count({ where })
    ]);
    res.json({ students, total, page, per_page: perPage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/messages?studentId=&phoneNumber=&page=&per_page=
router.get('/messages', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { studentId, phoneNumber } = req.query;
  const { page, perPage, skip } = getPagination(req.query, 50, 100);
  try {
    const where = phoneNumber
        ? { phoneNumber: normalizeEgyptianPhone(phoneNumber) }
        : studentId
          ? { studentId: parseInt(studentId) }
        : {};

    const [messages, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where,
        include: { student: { include: { group: true } }, sentBy: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage
      }),
      prisma.chatMessage.count({ where })
    ]);

    res.json({ messages: messages.reverse(), total, page, per_page: perPage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chat/messages
router.delete('/messages', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { studentId, phoneNumber } = req.query;
  try {
    const where = phoneNumber
        ? { phoneNumber: normalizeEgyptianPhone(phoneNumber) }
        : studentId
          ? { studentId: parseInt(studentId) }
        : {};
        
    if (Object.keys(where).length === 0) {
      return res.status(400).json({ error: 'Missing studentId or phoneNumber' });
    }

    const result = await prisma.chatMessage.deleteMany({ where });
    res.json({ success: true, deletedCount: result.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/messages/mark-seen - clear local unread badge for a conversation
router.post('/messages/mark-seen', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { studentId, phoneNumber } = req.body;
  try {
    const where = phoneNumber
        ? { phoneNumber: normalizeEgyptianPhone(phoneNumber), direction: 'incoming', seenAt: null }
        : studentId
          ? { studentId: parseInt(studentId), direction: 'incoming', seenAt: null }
        : null;

    if (!where) return res.status(400).json({ error: 'studentId or phoneNumber is required' });

    const result = await prisma.chatMessage.updateMany({
      where,
      data: { seenAt: new Date() }
    });
    res.json({ updated: result.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/unknown - incoming messages not linked to a student
router.get('/unknown', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { page, perPage, skip } = getPagination(req.query, 20, 100);
  try {
    const where = { studentId: null };
    const [messages, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage
      }),
      prisma.chatMessage.count({ where })
    ]);
    res.json({ messages, total, page, per_page: perPage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/webhook/events - recent raw webhook deliveries for troubleshooting
router.get('/webhook/events', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const events = await prisma.chatWebhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/messages/send
router.post('/messages/send', requirePermission('chat'), (req, res, next) => {
  const limiter = req.app.locals.rateLimiters?.chatSendLimiter;
  if (limiter) return limiter(req, res, next);
  next();
}, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { studentId, recipientType = 'student', phoneNumber, message } = req.body;

  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required' });

  try {
    let student = null;
    let targetPhone = phoneNumber;

    if (studentId) {
      student = await prisma.student.findUnique({ where: { id: parseInt(studentId) } });
      if (!student) return res.status(404).json({ error: 'Student not found' });
      targetPhone = getRecipientPhone(student, recipientType);
    }

    const normalizedPhone = normalizeEgyptianPhone(targetPhone);
    if (!normalizedPhone) return res.status(400).json({ error: 'Phone number is required' });

    const created = await prisma.chatMessage.create({
      data: {
        studentId: student?.id || null,
        recipientType: student ? recipientType : 'unknown',
        phoneNumber: normalizedPhone,
        direction: 'outgoing',
        message: String(message).trim(),
        status: 'queued',
        sentByUserId: req.session.userId
      }
    });

    try {
      const result = await sendTextMessage({ to: normalizedPhone, message: String(message).trim() });
      const updated = await prisma.chatMessage.update({
        where: { id: created.id },
        data: { waMessageId: result.waMessageId, status: 'sent' }
      });
      res.json(updated);
    } catch (sendErr) {
      const failed = await prisma.chatMessage.update({
        where: { id: created.id },
        data: { status: 'failed', error: sendErr.message }
      });
      res.status(502).json({ error: sendErr.message, message: failed });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/webhook - Meta verification endpoint
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === expectedToken) {
    return res.status(200).send(challenge);
  }
  console.warn('WhatsApp webhook verification failed', {
    mode,
    hasChallenge: Boolean(challenge),
    receivedTokenLength: token ? token.length : 0,
    expectedTokenLength: expectedToken ? expectedToken.length : 0,
    tokenMatches: token === expectedToken
  });
  res.sendStatus(403);
});

// GET /api/chat/webhook/debug - confirms local webhook env without exposing secrets
router.get('/webhook/debug', requirePermission('chat'), (req, res) => {
  res.json({
    hasVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    verifyTokenLength: (process.env.WHATSAPP_VERIFY_TOKEN || '').length,
    hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    hasAccessToken: Boolean(process.env.WHATSAPP_TOKEN),
    hasAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET)
  });
});

// POST /api/chat/webhook - incoming messages and status updates
router.post('/webhook', (req, res, next) => {
  const limiter = req.app.locals.rateLimiters?.webhookLimiter;
  if (limiter) return limiter(req, res, next);
  next();
}, async (req, res) => {
  const prisma = req.app.locals.prisma;

  // Verify webhook signature
  if (!verifyWebhookSignature(req)) {
    console.warn('❌ WhatsApp webhook signature verification failed');
    return res.sendStatus(403);
  }

  // Acknowledge Meta immediately to prevent timeouts and retries
  res.sendStatus(200);

  const payload = req.body || {};
  
  runBackgroundTask(async () => {
    let eventLog = null;
    try {
      eventLog = await prisma.chatWebhookEvent.create({
        data: { eventType: 'received', payload: JSON.stringify(payload) }
      });

      const changes = extractWebhookChanges(payload);
      console.log('WhatsApp webhook received', {
        changes: changes.length,
        hasEntry: Array.isArray(payload?.entry),
        eventLogId: eventLog.id
      });

      for (const change of changes) {
        const value = change.value || {};

        for (const status of value.statuses || []) {
          if (!status.id) continue;
          await prisma.chatMessage.updateMany({
            where: { waMessageId: status.id },
            data: { status: status.status || 'sent', error: status.errors?.[0]?.message || null }
          });
        }

        for (const incoming of value.messages || []) {
          const phoneNumber = normalizeEgyptianPhone(incoming.from);
          const student = await findStudentByPhone(prisma, phoneNumber);
          const text = incoming.text?.body || incoming.button?.text || incoming.interactive?.button_reply?.title || '[رسالة غير نصية]';
          const recipientType = student
            ? normalizeEgyptianPhone(student.dadPhoneNumber) === phoneNumber ? 'parent' : 'student'
            : 'unknown';

          await prisma.chatMessage.upsert({
            where: { waMessageId: incoming.id },
            update: {},
            create: {
              studentId: student?.id || null,
              recipientType,
              phoneNumber,
              waMessageId: incoming.id,
              direction: 'incoming',
              message: text,
              status: 'received'
            }
          });

          // Release archived messages for this phone number
          const archivedMessages = await prisma.chatMessage.findMany({
            where: { phoneNumber, status: 'archived', direction: 'outgoing' },
            orderBy: { createdAt: 'asc' }
          });

          if (archivedMessages.length > 0) {
            console.log(`Releasing ${archivedMessages.length} archived messages for ${phoneNumber}`);
            for (const msg of archivedMessages) {
              try {
                const res = await sendTextMessage({ to: phoneNumber, message: msg.message });
                await prisma.chatMessage.update({
                  where: { id: msg.id },
                  data: { status: 'sent', waMessageId: res.waMessageId || null }
                });
              } catch (sendErr) {
                console.error(`Failed to release archived message ${msg.id}:`, sendErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('WhatsApp webhook processing failed', err);
      if (eventLog) {
        await prisma.chatWebhookEvent.update({
          where: { id: eventLog.id },
          data: { eventType: 'failed', error: err.message }
        }).catch(() => {});
      }
    }
  }, 'whatsapp webhook processing');
});

module.exports = router;
