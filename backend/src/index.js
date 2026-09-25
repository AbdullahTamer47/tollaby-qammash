require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const compression = require('compression');
const helmet = require('helmet');

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

// CORS: allow configured domains, Vercel preview domains, and same-origin requests.
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || /^https:\/\/[^/]+\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const { PrismaSessionStore } = require('@quixo3/prisma-session-store');
const sessionStore = new PrismaSessionStore(
  prisma,
  {
    checkPeriod: 2 * 60 * 1000,  // ms
    dbRecordIdIsSessionId: true,
    dbRecordIdFunction: undefined,
    sessionModelName: 'sessionStore',
  }
);

// Session
app.use(session({
  name: 'tollaby.sid',
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: isProduction ? 'auto' : false,
    sameSite: cookieSameSite,
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  }
}));

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
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/notification-templates', require('./routes/notificationTemplates'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
});

// Start Server
const PORT = process.env.ALWAYSDATA_HTTPD_PORT || process.env.PORT || 5000;
const IP = process.env.ALWAYSDATA_HTTPD_IP || '0.0.0.0';
if (!isVercel) {
  app.listen(PORT, IP, () => {
    console.log(`🚀 Tollaby backend running on http://${IP}:${PORT}`);
  });
}

module.exports = app;
