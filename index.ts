import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { connectDB, isConnectedToDb } from './config/db';
import { backfillSubscriptionCoordinates } from './controllers/subscriptionController';

import authRoutes from './routes/authRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import orderRoutes from './routes/orderRoutes';
import menuRoutes from './routes/menuRoutes';
import customerRoutes from './routes/customerRoutes';
import kitchenRoutes from './routes/kitchenRoutes';
import purchaseRoutes from './routes/purchaseRoutes';
import expenseRoutes from './routes/expenseRoutes';
import salesRoutes from './routes/salesRoutes';
import geocodeRoutes from './routes/geocodeRoutes';
import driverRoutes from './routes/driverRoutes';
import settingsRoutes from './routes/settingsRoutes';
import notificationRoutes from './routes/notificationRoutes';
import pushRoutes from './routes/pushRoutes';
import paymentRoutes from './routes/paymentRoutes';
import referralRoutes from './routes/referralRoutes';
import uploadRoutes from './routes/uploadRoutes';
import activityRoutes from './routes/activityRoutes';
import roleRoutes from './routes/roleRoutes';
import { activityLogger } from './middleware/activityLog';
import { rateLimit } from './middleware/rateLimit';
import { requireAuth, requireAdmin, requirePermission, requireStaff } from './middleware/auth';
import { getSmsProvider } from './services/smsService';
import { createRazorpayOrder, verifyRazorpayPayment, getRazorpayKey } from './controllers/paymentController';

import path from 'path';

dotenv.config();
try {
  dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });
  dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 5000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
if (!SESSION_SECRET) throw new Error('SESSION_SECRET environment variable is required');
if (!MONGODB_URI) throw new Error('MONGODB_URI environment variable is required');

// Trust proxy for Render / load balancers (required for secure cookies)
app.set('trust proxy', 1);

// 1. CORS — explicit allow-list only (no wildcard, no reflected origins)
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://shift24.in',
  'https://www.shift24.in',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((u) => u.trim()).filter(Boolean) : []),
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((u) => u.trim()).filter(Boolean) : [])
];

app.use(cors({
  origin: (origin, callback) => {
    // Non-browser callers (curl, mobile apps, health checks) send no Origin.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 1b. Security headers (no extra dependency)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
});

// 1c. Global + auth-specific rate limits
app.use('/api', rateLimit({ windowMs: 60_000, max: 900, name: 'api' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, max: 15, name: 'login', message: 'Too many sign-in attempts. Try again in 15 minutes.' }));
app.use('/api/auth/admin-login', rateLimit({ windowMs: 15 * 60_000, max: 10, name: 'admin-login', message: 'Too many admin sign-in attempts. Try again in 15 minutes.' }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60_000, max: 10, name: 'register', message: 'Too many accounts created from this network. Try later.' }));
app.use('/api/auth/forgot-password', rateLimit({ windowMs: 60 * 60_000, max: 5, name: 'forgot', message: 'Too many reset requests. Try again in an hour.' }));
app.use('/api/auth/reset-password', rateLimit({ windowMs: 15 * 60_000, max: 10, name: 'reset' }));
app.use('/api/auth/otp', rateLimit({ windowMs: 60 * 60_000, max: 20, name: 'otp' }));
app.use('/api/uploads', rateLimit({ windowMs: 60 * 60_000, max: 60, name: 'upload' }));

// 2. Body & Cookie Parsing
// Only the image-upload route accepts large bodies (base64 data URIs); every
// other route gets a small limit so a large payload cannot be parsed.
app.use('/api/uploads', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Activity log: records every state-changing API call (POST/PUT/PATCH/DELETE)
app.use(activityLogger);

import mongoose from 'mongoose';

// Prevent background network errors from crashing the server
process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server] Handled background rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err: any) => {
  // An uncaught exception leaves the process in an unknown state. Log and exit
  // so the platform restarts a clean instance instead of serving on.
  console.error('[Server] Fatal uncaught exception:', err?.stack || err);
  process.exit(1);
});

// 3. Resilient Session Store
const isProduction = process.env.NODE_ENV === 'production';
const sessionConfig: session.SessionOptions = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: isProduction ? 'none' : 'lax'
  }
};

let sessionMiddleware: any = null;

app.use((req, res, next) => {
  if (!sessionMiddleware) {
    if (isConnectedToDb && mongoose.connection.readyState === 1) {
      try {
        sessionConfig.store = MongoStore.create({
          client: mongoose.connection.getClient() as any,
          collectionName: 'sessions',
          ttl: 7 * 24 * 60 * 60
        });
        console.log('[Session] MongoDB session store enabled');
      } catch (e: any) {
        console.warn('[Session] Note: Using in-memory session store fallback:', e.message);
      }
    } else {
      console.log('[Session] Running in memory fallback mode (MemoryStore)');
    }
    sessionMiddleware = session(sessionConfig);
  }
  sessionMiddleware(req, res, next);
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Shift24 Meal Prep Backend API is live',
    health: '/api/health',
    status: 'online'
  });
});

// 4. API Health Check
app.get('/api/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    online: true,
    dbConnected
  });
});

// 5. Mount Routes (strictly /api)
// Section guards: admins bypass, staff need the section granted on their role.
const can = {
  sales: requirePermission('sales'),
  subscriptions: requirePermission('subscriptions'),
  orders: requirePermission('orders'),
  customers: requirePermission('customers'),
  kitchen: requirePermission('kitchen'),
  purchases: requirePermission('purchases'),
  expenses: requirePermission('expenses'),
  drivers: requirePermission('drivers'),
  settings: requirePermission('settings'),
  referrals: requirePermission('referrals'),
  menu: requirePermission('menu'),
  activity: requirePermission('activity')
};

const isRead = (req: any) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
// Public reads, protected writes (menu/plans are shown on the customer site).
const writesGuarded = (guard: any) => (req: any, res: any, next: any) =>
  isRead(req) ? next() : guard(req, res, next);

// Roles: any staff member can read them (needed by the Users screen);
// only a Super Administrator can create or change them.
const roleGuard = (req: any, res: any, next: any) =>
  isRead(req) ? requireStaff(req, res, next) : requireAdmin(req, res, next);

// Subscriptions: checkout creates one (any signed-in customer), everything else is staff.
const subscriptionGuard = (req: any, res: any, next: any) =>
  req.method === 'POST' ? requireAuth(req, res, next) : can.subscriptions(req, res, next);

// Orders: drivers advance status (any signed-in user), the rest is staff.
const orderGuard = (req: any, res: any, next: any) => {
  if (req.method === 'PATCH' && /\/[^/]+\/status$/.test(req.path)) return requireAuth(req, res, next);
  // Creating an order is an operational action; the controller additionally
  // pins customer-created payloads to the signed-in account.
  if (req.method === 'POST' && req.path === '/') return can.orders(req, res, next);
  return can.orders(req, res, next);
};

// Drivers: login is public; a driver may read their own profile/orders;
// managing drivers needs the Drivers section.
const driverGuard = (req: any, res: any, next: any) => {
  if (req.path === '/login') return next();
  if (req.path === '/' && isRead(req)) return can.drivers(req, res, next);
  if (req.method === 'POST' && req.path === '/') return can.drivers(req, res, next);
  if (isRead(req)) return requireAuth(req, res, next);
  if (/\/(password)$/.test(req.path)) return requireAuth(req, res, next);
  return can.drivers(req, res, next);
};

const referralGuard = (req: any, res: any, next: any) => {
  if (req.path === '/my-referrals' || req.path === '/validate-code') return requireAuth(req, res, next);
  return can.referrals(req, res, next);
};

const paymentGuard = (req: any, res: any, next: any) =>
  isRead(req) ? next() : requireAuth(req, res, next);

const uploadGuard = (req: any, res: any, next: any) =>
  isRead(req) ? next() : can.menu(req, res, next);

app.use('/api/auth', authRoutes);
app.use('/api/subscriptions', subscriptionGuard, subscriptionRoutes);
app.use('/api/orders', orderGuard, orderRoutes);
app.use('/api/customers', can.customers, customerRoutes);
app.use('/api/kitchen', can.kitchen, kitchenRoutes);
app.use('/api/purchases', can.purchases, purchaseRoutes);
app.use('/api/expenses', can.expenses, expenseRoutes);
app.use('/api/sales', can.sales, salesRoutes);
app.use('/api/drivers', driverGuard, driverRoutes);
app.use('/api/settings', writesGuarded(can.settings), settingsRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/push', requireAuth, pushRoutes);
app.use('/api/referrals', referralGuard, referralRoutes);
app.use('/api/payment', paymentGuard, paymentRoutes);
app.use('/api/uploads', uploadGuard, uploadRoutes);
app.use('/api/activity', can.activity, activityRoutes);
app.use('/api/roles', roleGuard, roleRoutes);
app.post('/api/create-order', requireAuth, createRazorpayOrder);
app.post('/api/verify-payment', requireAuth, verifyRazorpayPayment);
app.get('/api/razorpay-key', getRazorpayKey);
app.use('/api/geocode', requireAuth, geocodeRoutes);
app.use('/api', writesGuarded(can.menu), menuRoutes); // handles /api/plans and /api/menu

// Global 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `API route ${req.originalUrl} not found` });
});

// Start Server
async function startServer() {
  await connectDB();
  backfillSubscriptionCoordinates().catch(() => {});

  app.listen(PORT, () => {
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const smtpReady = Boolean(smtpUser && smtpPass);
    console.log(`===========================================`);
    console.log(`🚀 Shift24 Express Server running on port ${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`📦 MongoDB Status: ${isConnectedToDb ? 'Connected' : 'Fallback Mode Active'}`);
    console.log(`🔐 JWT & Session Auth: Enabled`);
    console.log(`✉️  Live SMTP: ${smtpReady ? `configured (${smtpUser})` : 'NOT configured — reset codes fall back to a test inbox'}`);
    const sms = getSmsProvider();
    console.log(`📱 Customer OTP SMS: ${sms.configured ? `configured (${sms.provider})` : 'NOT configured — codes are printed to this log'}`);
    console.log(`===========================================`);
  });
}

startServer();

export default app;
