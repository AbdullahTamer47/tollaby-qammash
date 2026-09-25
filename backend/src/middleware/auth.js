/**
 * Authentication middleware
 */

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireTeacher(req, res, next) {
  if (!req.session.userId || req.session.role !== 'teacher') {
    return res.status(403).json({ error: 'Forbidden: Teacher access required' });
  }
  next();
}

function getSessionPermissions(req) {
  if (Array.isArray(req.session.permissions)) return req.session.permissions;
  if (typeof req.session.permissions === 'string') {
    try {
      const parsed = JSON.parse(req.session.permissions);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role === 'teacher') return next();

    const permissions = getSessionPermissions(req);
    if (permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ error: 'ليس لديك صلاحية للقيام بهذا الإجراء' });
  };
}

module.exports = { requireAuth, requireTeacher, requirePermission };
