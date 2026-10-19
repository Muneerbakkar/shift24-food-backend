import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { connectDB, isConnectedToDb } from './config/db';

import authRoutes from './routes/authRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import orderRoutes from './routes/orderRoutes';
import menuRoutes from './routes/menuRoutes';
import customerRoutes from './routes/customerRoutes';
import kitchenRoutes from './routes/kitchenRoutes';
import purchaseRoutes from './routes/purchaseRoutes';
import expenseRoutes from './routes/expenseRoutes';
import salesRoutes from './routes/salesRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'shift24_session_secret_key_998877';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shift24';

// Trust proxy for Render / load balancers (required for secure cookies)
app.set('trust proxy', 1);

// 1. CORS with credentials support (for session cookie and auth headers)
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((u) => u.trim()) : [])
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (mobile, postman, curl, health checks)
    if (!origin) return callback(null, true);
    if (defaultAllowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // Allow any deployed Vercel, Netlify, or Render domain
    if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com') || origin.endsWith('.netlify.app')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Body & Cookie Parsing
app.use(express.json());
app.use(cookieParser());

import mongoose from 'mongoose';

// Prevent background network errors from crashing the server
process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server] Handled background rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err: any) => {
  console.warn('[Server] Handled uncaught exception:', err?.message || err);
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
    uptime: process.uptime(),
    dbConnected,
    database: dbConnected ? 'MongoDB (Connected)' : 'Disconnected',
    sessionActive: !!(req as any).session,
    timestamp: new Date().toISOString(),
    service: 'Shift24 Meal Prep Backend API'
  });
});

// 5. Mount Routes (strictly /api)
app.use('/api/auth', authRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api', menuRoutes); // handles /api/plans and /api/menu

// Global 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `API route ${req.originalUrl} not found` });
});

// Start Server
async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🚀 Shift24 Express Server running on port ${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`📦 MongoDB Status: ${isConnectedToDb ? 'Connected' : 'Fallback Mode Active'}`);
    console.log(`🔐 JWT & Session Auth: Enabled`);
    console.log(`===========================================`);
  });
}

startServer();

export default app;
