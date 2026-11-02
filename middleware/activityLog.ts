import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ActivityLog } from '../models/ActivityLog';
import { isConnectedToDb } from '../config/db';

/**
 * Records every state-changing API call (POST / PUT / PATCH / DELETE) in the
 * activity_logs collection: who did it, what they touched, and the result.
 * Reads are not logged, and the write is fire-and-forget so a logging failure
 * can never break a real request.
 */

const ROUTE_TABLE: Array<{ pattern: RegExp; entity: string; label: string; verb?: boolean }> = [
  { pattern: /^\/api\/auth\/login/, entity: 'auth', label: 'Signed in', verb: true },
  { pattern: /^\/api\/auth\/admin-login/, entity: 'auth', label: 'Signed in to admin', verb: true },
  { pattern: /^\/api\/auth\/register/, entity: 'auth', label: 'Created an account', verb: true },
  { pattern: /^\/api\/auth\/otp/, entity: 'auth', label: 'Signed in with OTP', verb: true },
  { pattern: /^\/api\/auth\/forgot-password/, entity: 'auth', label: 'Requested a password reset', verb: true },
  { pattern: /^\/api\/auth\/reset-password/, entity: 'auth', label: 'Reset a password', verb: true },
  { pattern: /^\/api\/auth\/admin-users/, entity: 'users', label: 'team member' },
  { pattern: /^\/api\/menu/, entity: 'menu', label: 'menu item' },
  { pattern: /^\/api\/plans/, entity: 'plans', label: 'meal plan' },
  { pattern: /^\/api\/referrals\/admin\/[^/]+\/payout/, entity: 'referrals', label: 'referral payout' },
  { pattern: /^\/api\/referrals/, entity: 'referrals', label: 'referral' },
  { pattern: /^\/api\/customers/, entity: 'customers', label: 'customer' },
  { pattern: /^\/api\/subscriptions/, entity: 'subscriptions', label: 'subscription' },
  { pattern: /^\/api\/orders/, entity: 'orders', label: 'order' },
  { pattern: /^\/api\/drivers/, entity: 'drivers', label: 'driver' },
  { pattern: /^\/api\/kitchen/, entity: 'kitchen', label: 'kitchen record' },
  { pattern: /^\/api\/purchases/, entity: 'purchases', label: 'purchase' },
  { pattern: /^\/api\/expenses/, entity: 'expenses', label: 'expense' },
  { pattern: /^\/api\/settings/, entity: 'settings', label: 'settings' },
  { pattern: /^\/api\/uploads/, entity: 'media', label: 'image' },
  { pattern: /^\/api\/activity/, entity: 'activity', label: 'activity log' }
];

// Log maintenance itself is not audited (it would only create noise).
const SKIP_PREFIXES = ['/api/health', '/api/push', '/api/notifications', '/api/geocode', '/api/activity'];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const verbFor = (method: string): string => {
  if (method === 'POST') return 'Created';
  if (method === 'DELETE') return 'Deleted';
  return 'Updated';
};

const describe = (method: string, path: string) => {
  const route = ROUTE_TABLE.find(r => r.pattern.test(path));
  if (!route) return { entity: 'system', action: `${verbFor(method)} ${path}` };
  if (route.verb) return { entity: route.entity, action: route.label };
  return { entity: route.entity, action: `${verbFor(method)} ${route.label}` };
};

const actorFromRequest = (req: Request) => {
  try {
    const header = req.headers.authorization;
    let token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) token = (req as any).cookies?.token;
    if (!token || token === 'null' || token === 'undefined') return null;

    if (token === 'shift24_master_admin_token' || token === 'demo_admin_token') {
      return { email: 'admin@shift24.com', name: 'Shift24 Super Admin', role: 'admin' };
    }

    const decoded: any = jwt.decode(token);
    if (!decoded) return null;
    return {
      email: String(decoded.email || decoded.id || 'unknown'),
      name: String(decoded.name || ''),
      role: String(decoded.role || 'staff')
    };
  } catch {
    return null;
  }
};

export const activityLogger = (req: Request, res: Response, next: NextFunction) => {
  if (!MUTATING.has(req.method)) return next();

  // Snapshot the request details *before* routing strips the mount path.
  const fullPath = (req.originalUrl || req.url || '').split('?')[0];
  if (SKIP_PREFIXES.some(p => fullPath.startsWith(p))) return next();

  const { entity, action } = describe(req.method, fullPath);
  const segments = fullPath.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] || '';
  // Only treat the last segment as a target when it looks like an id.
  const target = /(^|[-_])\d/.test(lastSegment) || /^[a-f0-9]{24}$/i.test(lastSegment) ? lastSegment : '';

  res.on('finish', () => {
    try {
      if (!isConnectedToDb) return;

      const actor = actorFromRequest(req);

      ActivityLog.create({
        actorEmail: actor?.email || 'guest',
        actorName: actor?.name || '',
        actorRole: actor?.role || 'guest',
        action,
        entity,
        method: req.method,
        path: fullPath,
        target,
        statusCode: res.statusCode,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || ''
      }).catch(err => console.warn('[Activity] Could not save log:', err?.message || err));
    } catch (err: any) {
      console.warn('[Activity] Logger error:', err?.message || err);
    }
  });

  next();
};
