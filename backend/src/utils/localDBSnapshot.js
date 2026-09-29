const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'local_cache.json');
const MUTATIONS_FILE = path.join(DATA_DIR, 'offline_mutations.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

let cache = {
  students: [],
  groups: [],
  sessions: [],
  expenses: [],
  books: [],
  offers: [],
  users: [],
  lastUpdated: null
};

// Load existing cache from disk if available
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    cache = { ...cache, ...JSON.parse(raw) };
    console.log(`📦 Loaded local offline cache (${cache.students?.length || 0} students, ${cache.groups?.length || 0} groups)`);
  }
} catch (e) {
  console.warn('Failed to parse local cache file:', e.message);
}

function persistCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write local cache to disk:', e.message);
  }
}

function isDbConnectionError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code;
  const name = err.name;
  return (
    code === 'P1001' || // Can't reach database server
    code === 'P1002' || // The database server was reached but timed out
    code === 'P1003' || // Database does not exist
    code === 'P1017' || // Server has closed the connection
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    msg.includes("can't reach database server") ||
    msg.includes('connection timed out') ||
    msg.includes('connection refused') ||
    msg.includes('pool timeout') ||
    name === 'PrismaClientInitializationError'
  );
}

async function warmupCache(prisma) {
  if (!prisma) return;
  try {
    const [students, groups, sessions, expenses, books, offers, users] = await Promise.all([
      prisma.student.findMany({ include: { group: true, offer: true } }).catch(() => null),
      prisma.group.findMany({ include: { _count: { select: { students: true } } } }).catch(() => null),
      prisma.session.findMany({ include: { group: true }, take: 100, orderBy: { date: 'desc' } }).catch(() => null),
      prisma.expense.findMany({ take: 100, orderBy: { date: 'desc' } }).catch(() => null),
      prisma.book.findMany({ include: { _count: { select: { bookings: true } } } }).catch(() => null),
      prisma.offer.findMany().catch(() => null),
      prisma.user.findMany({ select: { id: true, name: true, username: true, role: true, permissions: true, active: true } }).catch(() => null)
    ]);

    let changed = false;
    if (students) { cache.students = students; changed = true; }
    if (groups) { cache.groups = groups; changed = true; }
    if (sessions) { cache.sessions = sessions; changed = true; }
    if (expenses) { cache.expenses = expenses; changed = true; }
    if (books) { cache.books = books; changed = true; }
    if (offers) { cache.offers = offers; changed = true; }
    if (users) { cache.users = users; changed = true; }

    if (changed) {
      cache.lastUpdated = new Date().toISOString();
      persistCache();
      console.log('✅ Local offline snapshot synchronized successfully');
    }
  } catch (err) {
    console.warn('Cache warmup skipped (DB offline or unreachable):', err.message);
  }
}

function getOfflineQueue() {
  try {
    if (fs.existsSync(MUTATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(MUTATIONS_FILE, 'utf8') || '[]');
    }
  } catch (e) {}
  return [];
}

function enqueueOfflineMutation(mutation) {
  try {
    const queue = getOfflineQueue();
    queue.push({
      id: Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      ...mutation
    });
    fs.writeFileSync(MUTATIONS_FILE, JSON.stringify(queue, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to enqueue offline mutation:', e.message);
  }
}

async function syncPendingMutations(prisma) {
  if (!prisma) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  console.log(`🔄 Attempting to sync ${queue.length} offline mutations to database...`);
  const remaining = [];

  for (const item of queue) {
    try {
      if (item.type === 'CREATE_EXPENSE') {
        await prisma.expense.create({ data: item.data });
      } else if (item.type === 'RECORD_ATTENDANCE') {
        await prisma.attendance.upsert({
          where: { studentId_sessionId: { studentId: item.data.studentId, sessionId: item.data.sessionId } },
          create: item.data,
          update: { isAttendant: item.data.isAttendant }
        });
      } else if (item.type === 'BULK_CARD_PRINTED') {
        await prisma.student.updateMany({
          where: { id: { in: item.data.studentIds } },
          data: { cardPrinted: item.data.printed }
        });
      } else if (item.type === 'ADD_PAYMENT') {
        await prisma.eachPayment.create({ data: item.data });
      }
    } catch (err) {
      if (isDbConnectionError(err)) {
        remaining.push(item);
      } else {
        console.warn('Dropping invalid offline mutation:', err.message);
      }
    }
  }

  try {
    fs.writeFileSync(MUTATIONS_FILE, JSON.stringify(remaining, null, 2), 'utf8');
    if (remaining.length === 0) {
      console.log('✅ All offline mutations successfully synchronized!');
    }
  } catch (e) {}
}

module.exports = {
  cache,
  persistCache,
  isDbConnectionError,
  warmupCache,
  enqueueOfflineMutation,
  syncPendingMutations
};
