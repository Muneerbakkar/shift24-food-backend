import mongoose from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { isConnectedToDb } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface AuthRequest extends Request {
  user?: IUser & { _id?: any };
  token?: string;
}

/**
 * Strict authentication: a valid, unexpired JWT (header or http-only cookie),
 * or an active server session. There are deliberately no master tokens and no
 * "expired admin token" allowances — every request is verified.
 */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
    if (!token && (req as any).cookies?.token) {
      token = String((req as any).cookies.token);
    }
    if (token === 'null' || token === 'undefined' || !token?.trim()) {
      token = undefined;
    }

    // Cookie-based sessions (admin login also sets an express session)
    if (!token && (req as any).session?.user?.email) {
      const sessionEmail = String((req as any).session.user.email).toLowerCase().trim();
      if (isConnectedToDb) {
        const sessionUser = await User.findOne({ email: sessionEmail }).select('-password');
        if (sessionUser) {
          req.user = sessionUser;
          return next();
        }
      }
    }

    if (!token) {
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Authentication required. Please log in.' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', message: 'Session expired. Please log in again.' });
    }

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    let user: any = null;
    if (decoded?.id && mongoose.Types.ObjectId.isValid(decoded.id)) {
      user = await User.findById(decoded.id).select('-password');
    }
    if (!user && decoded?.email) {
      user = await User.findOne({ email: String(decoded.email).toLowerCase().trim() }).select('-password');
    }
    if (!user) {
      return res.status(401).json({ success: false, code: 'USER_GONE', message: 'User no longer exists. Please log in again.' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, code: 'ACCOUNT_INACTIVE', message: 'This account has been deactivated.' });
    }

    req.user = user;
    req.token = token;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid session. Please log in again.' });
  }
};

/** Super Administrator only (team, roles, destructive settings). */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        code: 'ADMIN_REQUIRED',
        message: 'Access denied: administrator privileges required.'
      });
    }
    return next();
  });
};

/** Any signed-in admin-portal user (not customers or drivers). */
export const requireStaff = async (req: AuthRequest, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    const role = String(req.user?.role || '');
    if (!role || role === 'customer' || role === 'driver') {
      return res.status(403).json({
        success: false,
        code: 'STAFF_ONLY',
        message: 'Access denied: staff account required.'
      });
    }
    return next();
  });
};

/**
 * Section-level access for the admin panel.
 * Admins bypass; staff must have the section granted on their user/role.
 */
export const requirePermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      const role = String(req.user?.role || '');
      if (role === 'admin') return next();

      if (!role || role === 'customer' || role === 'driver') {
        return res.status(403).json({
          success: false,
          code: 'STAFF_ONLY',
          message: 'Access denied: staff account required.'
        });
      }

      const permissions: string[] = Array.isArray(req.user?.permissions) ? req.user!.permissions! : [];
      if (permission === 'dashboard' || permissions.includes(permission)) {
        return next();
      }

      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: `Access denied: your role does not include "${permission}".`
      });
    });
  };
};
