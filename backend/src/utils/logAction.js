/**
 * Shared action logging utility.
 * Accepts either a Prisma client or a transaction handle.
 */
async function logAction(prisma, req, action, method) {
  if (!req.session.userId) return;
  await prisma.actionLog.create({
    data: { userId: req.session.userId, action, path: req.originalUrl, method }
  }).catch(() => {});
}

module.exports = { logAction };
