require('dotenv').config();

// Global crash protection for offline network drops and database reconnections
process.on('unhandledRejection', (reason, promise) => {
  console.warn('⚠️ Guarded unhandled rejection (offline resilience):', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Guarded uncaught exception (offline resilience):', err?.message || err);
});

// Default cloud database & session secret fallbacks for zero-config cloud deployment
const DEFAULT_DATABASE_URL = "postgresql://neondb_owner:npg_EY5GmxONt4yF@ep-young-union-abwr6fhi-pooler.eu-west-2.aws.neon.tech/tollabytestDB?sslmode=require&channel_binding=require";
const DEFAULT_SESSION_SECRET = "RhZa58RuanU8hOaJwDNVIhpm6kgtDGxXrD1CD91HyayJl";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = DEFAULT_SESSION_SECRET;
}

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const compression = require('compression');
const helmet = require('helmet');
const os = require('os');

const prisma = new PrismaClient();
const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL);
const cookieSameSite = process.env.COOKIE_SAME_SITE || 'lax';

// Warn if using default session secret
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'secret') {
  console.warn('⚠️  SESSION_SECRET is not set or using default — this is insecure in production!');
}

// Security and Performance Middlewares
app.use(helmet());
app.use(compression());

// Trust proxy for rate limiters behind Vite/Nginx
app.set('trust proxy', 1);

// Body parser — capture rawBody for webhook signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173'
].filter(Boolean);

// CORS: allow configured domains, Vercel preview domains, LAN IPs, and mobile Capacitor
app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      origin === 'null' ||
      allowedOrigins.includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin) ||
      /^https:\/\/[^/]+\.vercel\.app$/.test(origin) ||
      origin.startsWith('capacitor://') ||
      origin.startsWith('ionic://')
    ) {
      return callback(null, true);
    }
    // In local network / hotspot mode, always allow
    return callback(null, true);
  },
  credentials: true,
}));

const { PrismaSessionStore } = require('@quixo3/prisma-session-store');
const prismaSessionStore = new PrismaSessionStore(
  prisma,
  {
    checkPeriod: isVercel ? 0 : 5 * 60 * 1000,  // ms - only periodic cleanup on server
    dbRecordIdIsSessionId: true,
    dbRecordIdFunction: undefined,
    sessionModelName: 'sessionStore',
  }
);

// Offline-resilient session store: fall back to memory cache if DB connection is offline
const memorySessionMap = new Map();
const origGet = prismaSessionStore.get.bind(prismaSessionStore);
const origSet = prismaSessionStore.set.bind(prismaSessionStore);
const origDestroy = prismaSessionStore.destroy.bind(prismaSessionStore);

prismaSessionStore.get = function(sid, callback) {
  const mem = memorySessionMap.get(sid);
  origGet(sid, (err, sess) => {
    if (err) {
      // In offline mode or DB error, suppress error so express-session does not crash with 500
      return callback(null, mem || null);
    }
    if (sess) {
      memorySessionMap.set(sid, sess);
      return callback(null, sess);
    }
    callback(null, mem || null);
  });
};

prismaSessionStore.set = function(sid, sess, callback) {
  memorySessionMap.set(sid, sess);
  origSet(sid, sess, (err) => {
    if (err) console.warn('Offline session saved to local memory cache');
    callback && callback(null);
  });
};

prismaSessionStore.destroy = function(sid, callback) {
  memorySessionMap.delete(sid);
  origDestroy(sid, (err) => {
    callback && callback(null);
  });
};

// Session: only use secure cookies when running on Vercel HTTPS; local development / LAN works seamlessly on HTTP
const isCookieSecure = isVercel;
app.use(session({
  name: 'tollaby.sid',
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  store: prismaSessionStore,
  cookie: {
    httpOnly: true,
    secure: isCookieSecure ? true : false,
    sameSite: isCookieSecure ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  }
}));

// Dual-Auth: Support Header-based session token for mobile Capacitor app / cross-origin API calls
app.use((req, res, next) => {
  const token = req.headers['x-session-token'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (token && (!req.session || !req.session.userId)) {
    prismaSessionStore.get(token, (err, sess) => {
      if (!err && sess && sess.userId) {
        req.session = Object.assign(req.session || {}, sess);
        req.sessionID = token;
      }
      next();
    });
  } else {
    next();
  }
});

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatSendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'أنت ترسل رسائل بسرعة كبيرة، انتظر قليلاً' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Make prisma available in routes
app.locals.prisma = prisma;

// Export rate limiters for use in route files
app.locals.rateLimiters = { loginLimiter, webhookLimiter, chatSendLimiter };

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/books', require('./routes/books'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/search', require('./routes/search'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/notification-templates', require('./routes/notificationTemplates'));
app.use('/api/sync', require('./routes/sync'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/network-info', (req, res) => {
  // If running on Vercel or cloud serverless, it has no LAN interfaces
  if (isVercel || process.env.VERCEL) {
    return res.json({ addresses: [], isCloud: true });
  }

  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Must be IPv4, non-internal, and NOT link-local/APIPA (169.254.x.x)
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        !net.address.startsWith('169.254.') &&
        net.address !== '0.0.0.0'
      ) {
        addresses.push({ interface: name, address: net.address });
      }
    }
  }

  // Prioritize Wi-Fi and common LAN subnets (192.168.x.x, 10.x.x.x, 172.x.x.x)
  addresses.sort((a, b) => {
    const isWiFiA = /wi-?fi|wireless|wlan/i.test(a.interface);
    const isWiFiB = /wi-?fi|wireless|wlan/i.test(b.interface);
    if (isWiFiA && !isWiFiB) return -1;
    if (!isWiFiA && isWiFiB) return 1;

    const is192A = a.address.startsWith('192.168.');
    const is192B = b.address.startsWith('192.168.');
    if (is192A && !is192B) return -1;
    if (!is192A && is192B) return 1;

    return 0;
  });

  const primaryAddress = addresses.length > 0 ? addresses[0].address : 'localhost';
  res.json({ addresses, primaryAddress, port: 5173 });
});


// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
});

// Local Offline Snapshot & Queue loop
const { warmupCache, syncPendingMutations } = require('./utils/localDBSnapshot');

// Start Server
const PORT = process.env.ALWAYSDATA_HTTPD_PORT || process.env.PORT || 5000;
const IP = process.env.ALWAYSDATA_HTTPD_IP || '0.0.0.0';
if (!isVercel) {
  app.listen(PORT, IP, () => {
    console.log(`🚀 Tollaby backend running on http://${IP}:${PORT}`);
    // Initial cache warmup & sync
    setTimeout(() => {
      warmupCache(prisma);
      syncPendingMutations(prisma);
    }, 2000);

    // Periodic synchronization every 3 minutes
    setInterval(() => {
      warmupCache(prisma);
      syncPendingMutations(prisma);
    }, 3 * 60 * 1000);
  });
}

module.exports = app;
