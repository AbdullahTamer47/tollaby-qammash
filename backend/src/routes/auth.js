const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

function parsePermissions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// GET /api/auth/quick-users
router.get('/quick-users', async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true },
      orderBy: [{ role: 'desc' }, { id: 'asc' }]
    });

    const formatted = users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.role === 'teacher' ? 'مستر محمد القماش' : u.username.replace(/_/g, ' '),
      role: u.role,
      avatar: u.role === 'teacher' ? '👨‍🏫' : '🧑‍💼'
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching quick users:', err);
    res.status(500).json({ error: 'فشل جلب المستخدمين' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res, next) => {
  const limiter = req.app.locals.rateLimiters?.loginLimiter;
  if (limiter) return limiter(req, res, next);
  next();
}, async (req, res) => {
  const { username, password } = req.body;
  const prisma = req.app.locals.prisma;

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    let valid = await bcrypt.compare(password, user.password);
    if (!valid && typeof password === 'string' && password.includes(' ')) {
      valid = await bcrypt.compare(password.replace(/\s+/g, ''), user.password);
    }
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    const permissions = parsePermissions(user.permissions);
    req.session.permissions = permissions;

    req.session.save(err => {
      if (err) {
        console.error('Session Save Error:', err);
        return res.status(500).json({ error: 'تعذر حفظ جلسة تسجيل الدخول' });
      }
      res.json({ id: user.id, username: user.username, role: user.role, permissions, token: req.sessionID });
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const prisma = req.app.locals.prisma;
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, username: true, role: true, permissions: true, dateJoined: true }
    });
    if (user) user.permissions = parsePermissions(user.permissions);
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/me
router.put('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { username, password } = req.body;
  const prisma = req.app.locals.prisma;
  try {
    const dataToUpdate = { username };
    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }
    const user = await prisma.user.update({
      where: { id: req.session.userId },
      data: dataToUpdate,
      select: { id: true, username: true, role: true }
    });
    req.session.username = user.username;
    await prisma.actionLog.create({
      data: { userId: req.session.userId, action: `تعديل بيانات الحساب`, path: req.originalUrl, method: 'PUT' }
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/assistants - Create assistant (teacher only)
router.post('/assistants', async (req, res) => {
  if (req.session.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  const { username, password, permissions } = req.body;
  const prisma = req.app.locals.prisma;

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const permsStr = Array.isArray(permissions) ? JSON.stringify(permissions) : '[]';
    const assistant = await prisma.user.create({
      data: { username, password: hashed, role: 'assistant', permissions: permsStr }
    });
    // Log action
    await prisma.actionLog.create({
      data: {
        userId: req.session.userId,
        action: `إنشاء مساعد ${username}`,
        path: '/api/auth/assistants',
        method: 'POST'
      }
    });
    res.status(201).json({ id: assistant.id, username: assistant.username, role: assistant.role, permissions: JSON.parse(assistant.permissions) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/assistants - List all assistants (teacher only)
router.get('/assistants', async (req, res) => {
  if (req.session.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  const prisma = req.app.locals.prisma;
  try {
    const assistants = await prisma.user.findMany({
      where: { role: 'assistant' },
      select: { id: true, username: true, permissions: true, dateJoined: true }
    });
    const parsedAssistants = assistants.map(a => ({
      ...a,
      permissions: (() => { try { return JSON.parse(a.permissions || '[]'); } catch { return []; } })()
    }));
    res.json(parsedAssistants);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/assistants/:id - Edit assistant
router.put('/assistants/:id', async (req, res) => {
  if (req.session.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const { username, password, permissions } = req.body;
  const prisma = req.app.locals.prisma;

  try {
    const dataToUpdate = { username };
    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }
    if (Array.isArray(permissions)) {
      dataToUpdate.permissions = JSON.stringify(permissions);
    }

    const assistant = await prisma.user.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
      select: { id: true, username: true, permissions: true }
    });

    await prisma.actionLog.create({
      data: { userId: req.session.userId, action: `تعديل المساعد ${username}`, path: req.originalUrl, method: 'PUT' }
    });
    res.json({ ...assistant, permissions: JSON.parse(assistant.permissions || '[]') });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/assistants/:id - Delete assistant
router.delete('/assistants/:id', async (req, res) => {
  if (req.session.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const prisma = req.app.locals.prisma;

  try {
    const assistant = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    await prisma.user.delete({ where: { id: parseInt(id) } });

    await prisma.actionLog.create({
      data: { userId: req.session.userId, action: `حذف المساعد ${assistant.username}`, path: req.originalUrl, method: 'DELETE' }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
