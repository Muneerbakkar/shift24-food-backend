import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { isConnectedToDb } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { sendPasswordResetEmail } from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'shift24_super_secure_jwt_secret_key_2026';
const JWT_EXPIRES_IN = '7d';

function generateToken(user: any) {
  return jwt.sign(
    { id: user._id || user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setSessionAndCookie(req: Request, res: Response, user: any, token: string) {
  // 1. Set Express session
  if ((req as any).session) {
    (req as any).session.user = {
      id: user._id || user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || ''
    };
    (req as any).session.token = token;
  }

  // 2. Set HTTP-only Cookie for security & session persistence
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

// -------------------------------------------------------------
// Customer / General Registration
// -------------------------------------------------------------
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isConnectedToDb) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected'
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: cleanEmail,
      password: hashedPassword,
      phone: phone || '',
      role: 'customer',
      allergies: [],
      addresses: [],
      totalSpent: 0,
      totalOrders: 0
    });

    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      addresses: user.addresses || []
    };

    const token = generateToken(safeUser);
    setSessionAndCookie(req, res, safeUser, token);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      user: safeUser,
      token
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Customer / General Login
// -------------------------------------------------------------
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isConnectedToDb) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected'
      });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials.'
      });
    }

    // Validate password (support bcrypt hash or legacy plaintext fallback during transition)
    let isMatch = false;
    if (user.password?.startsWith('$2b$') || user.password?.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
      // Upgrade plain password to bcrypt hash on login
      if (isMatch) {
        user.password = await bcrypt.hash(password, 10);
        await user.save();
      }
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials.'
      });
    }

    // Prioritize and synchronize Full Name and Phone Number from Subscription collection in MongoDB
    try {
      const latestSub = await Subscription.findOne({
        customerEmail: new RegExp('^' + cleanEmail + '$', 'i')
      }).sort({ createdAt: -1, _id: -1 });

      if (latestSub) {
        let changed = false;
        if (latestSub.customerName && latestSub.customerName.trim() && user.name !== latestSub.customerName.trim()) {
          user.name = latestSub.customerName.trim();
          changed = true;
        }
        if (latestSub.customerPhone && latestSub.customerPhone.trim() && user.phone !== latestSub.customerPhone.trim()) {
          user.phone = latestSub.customerPhone.trim();
          changed = true;
        }
        if (changed) {
          await user.save();
        }
      }
    } catch (subErr) {
      console.warn('[login] Subscription sync error:', subErr);
    }

    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      addresses: user.addresses || []
    };

    const token = generateToken(safeUser);
    setSessionAndCookie(req, res, safeUser, token);

    return res.json({
      success: true,
      message: 'Login successful',
      user: safeUser,
      data: safeUser,
      token
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Admin Registration (Staff / Admin Onboarding)
// -------------------------------------------------------------
export const adminRegister = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, adminSecretCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Admin password must be at least 6 characters'
      });
    }

    // Optional admin security phrase validation (default: shift24admin)
    const REQUIRED_KEY = process.env.ADMIN_KEY || 'shift24admin';
    if (adminSecretCode && adminSecretCode !== REQUIRED_KEY) {
      return res.status(403).json({
        success: false,
        message: 'Invalid Admin Security Key'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isConnectedToDb) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected'
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = await User.create({
      name,
      email: cleanEmail,
      password: hashedPassword,
      phone: phone || '+91 98451 00000',
      role: 'admin',
      addresses: [{ title: 'Operations HQ', address: 'MG Road, Kochi, Kerala', isDefault: true }],
      allergies: [],
      totalSpent: 0,
      totalOrders: 0
    });

    const safeAdmin = {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: 'admin'
    };

    const token = generateToken(safeAdmin);
    setSessionAndCookie(req, res, safeAdmin, token);

    return res.status(201).json({
      success: true,
      message: 'Admin account registered successfully!',
      user: safeAdmin,
      token
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Admin Login
// -------------------------------------------------------------
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isConnectedToDb) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected'
      });
    }

    const defaultAdminEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@shift24.com').toLowerCase().trim();
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

    // 1. Direct Default Master Admin Authentication
    if (cleanEmail === defaultAdminEmail && password === defaultAdminPassword) {
      const dbAdmin = await User.findOne({ email: defaultAdminEmail });
      const adminId = dbAdmin ? dbAdmin._id.toString() : 'admin_master';

      const demoAdmin = {
        id: adminId,
        _id: adminId,
        name: dbAdmin?.name || 'Shift24 Super Admin',
        email: defaultAdminEmail,
        role: 'admin',
        addresses: dbAdmin?.addresses || [{ title: 'Headquarters', address: 'MG Road, Kochi, Kerala', isDefault: true }]
      };
      const token = generateToken(demoAdmin);
      setSessionAndCookie(req, res, demoAdmin, token);

      return res.json({
        success: true,
        message: 'Authenticated as Shift24 Administrator',
        user: demoAdmin,
        token
      });
    }

    // 2. Lookup Admin or Staff in MongoDB
    const user = await User.findOne({ 
      email: cleanEmail, 
      role: { $in: ['admin', 'staff', 'kitchen'] } 
    });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or account does not have admin panel access.'
      });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact the administrator.'
      });
    }

    let isMatch = false;
    if (user.password?.startsWith('$2b$') || user.password?.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
      if (isMatch) {
        user.password = await bcrypt.hash(password, 10);
        await user.save();
      }
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.'
      });
    }

    const safeAdmin = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      adminTitle: user.adminTitle || 'Administrator',
      status: user.status || 'active'
    };

    const token = generateToken(safeAdmin);
    setSessionAndCookie(req, res, safeAdmin, token);

    return res.json({
      success: true,
      message: 'Admin authentication successful',
      user: safeAdmin,
      token
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Current Authenticated User (Session Verification)
// -------------------------------------------------------------
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    let userObj: any = (req.user as any).toObject ? (req.user as any).toObject() : { ...req.user };

    // Dynamically retrieve customerName and customerPhone from Subscription collection in MongoDB
    if (isConnectedToDb && req.user.email) {
      try {
        const cleanEmail = req.user.email.toLowerCase().trim();
        const latestSub = await Subscription.findOne({
          customerEmail: new RegExp('^' + cleanEmail + '$', 'i')
        }).sort({ createdAt: -1, _id: -1 });

        if (latestSub) {
          let needsSave = false;
          const userDoc = await User.findById(req.user._id || (req.user as any).id);

          if (latestSub.customerName && latestSub.customerName.trim()) {
            const trimmedName = latestSub.customerName.trim();
            userObj.name = trimmedName;
            if (userDoc && userDoc.name !== trimmedName) {
              userDoc.name = trimmedName;
              needsSave = true;
            }
          }

          if (latestSub.customerPhone && latestSub.customerPhone.trim()) {
            const trimmedPhone = latestSub.customerPhone.trim();
            userObj.phone = trimmedPhone;
            if (userDoc && userDoc.phone !== trimmedPhone) {
              userDoc.phone = trimmedPhone;
              needsSave = true;
            }
          }

          if (userDoc && needsSave) {
            await userDoc.save();
          }
        }
      } catch (subErr) {
        console.warn('[getMe] Error reading subscription collection:', subErr);
      }
    }

    return res.json({
      success: true,
      user: userObj,
      data: userObj,
      token: req.token
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Update User Addresses & Default Address
// -------------------------------------------------------------
export const updateAddresses = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { addresses } = req.body;
    if (!Array.isArray(addresses)) {
      return res.status(400).json({ success: false, message: 'Addresses must be an array' });
    }

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const user = await User.findById(req.user._id || (req.user as any).id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.addresses = addresses;
    await user.save();

    return res.json({
      success: true,
      message: 'Addresses updated successfully',
      addresses: user.addresses
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Update User Profile (Name, Phone)
// -------------------------------------------------------------
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { name, phone } = req.body;

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const user = await User.findById(req.user._id || (req.user as any).id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();

    await user.save();

    // Also synchronize updated name and phone to Subscription collection
    if (req.user.email) {
      try {
        const cleanEmail = req.user.email.toLowerCase().trim();
        const subUpdates: any = {};
        if (name) subUpdates.customerName = name.trim();
        if (phone !== undefined) subUpdates.customerPhone = phone.trim();

        if (Object.keys(subUpdates).length > 0) {
          await Subscription.updateMany(
            { customerEmail: new RegExp('^' + cleanEmail + '$', 'i') },
            { $set: subUpdates }
          );
        }
      } catch (subErr) {
        console.warn('[updateProfile] subscription update warning:', subErr);
      }
    }

    const safeUser = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      addresses: user.addresses || []
    };

    if ((req as any).session) {
      (req as any).session.user = safeUser;
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: safeUser,
      data: safeUser
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Change Password
// -------------------------------------------------------------
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const user = await User.findById(req.user._id || (req.user as any).id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check current password
    let isMatch = false;
    if (user.password?.startsWith('$2b$') || user.password?.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(currentPassword, user.password);
    } else {
      isMatch = user.password === currentPassword;
    }

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash and update
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// In-memory fallback store for reset codes
const inMemoryResetCodes = new Map<string, { code: string; expires: number }>();

// -------------------------------------------------------------
// Forgot Password - Request Email Reset Code
// -------------------------------------------------------------
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your email address'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isConnectedToDb) {
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      inMemoryResetCodes.set(cleanEmail, { code: resetCode, expires: Date.now() + 15 * 60 * 1000 });
      return res.json({
        success: true,
        message: `Password reset code sent to ${cleanEmail}`,
        resetCode: resetCode
      });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Generate 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    user.resetPasswordToken = resetCode;
    user.resetPasswordExpires = expiresAt;
    await user.save();

    inMemoryResetCodes.set(cleanEmail, { code: resetCode, expires: Date.now() + 15 * 60 * 1000 });

    console.log(`\n======================================================`);
    console.log(`[Shift24 Security] PASSWORD RESET CODE FOR: ${cleanEmail}`);
    console.log(`Verification Code: ${resetCode}`);
    console.log(`Valid until: ${expiresAt.toLocaleTimeString()}`);
    console.log(`======================================================\n`);

    // Dispatch real email via nodemailer or test preview
    const emailResult = await sendPasswordResetEmail({
      toEmail: cleanEmail,
      userName: user.name || 'Valued Member',
      resetCode
    });

    return res.json({
      success: true,
      message: emailResult.sent
        ? `A 6-digit password reset verification code has been sent directly to ${cleanEmail}. Please check your inbox and spam folder.`
        : `Verification code generated for ${cleanEmail}. (SMTP not configured in backend/.env)`,
      emailSent: emailResult.sent,
      previewUrl: emailResult.previewUrl || undefined,
      resetCode: resetCode,
      provider: emailResult.provider
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Reset Password - Verify Code & Set New Password
// -------------------------------------------------------------
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, verification code, and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = String(resetCode).trim();

    if (!isConnectedToDb) {
      const stored = inMemoryResetCodes.get(cleanEmail);
      if (!stored || stored.code !== cleanCode || Date.now() > stored.expires) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
      }
      inMemoryResetCodes.delete(cleanEmail);
      return res.json({
        success: true,
        message: 'Password reset successfully! You can now log in with your new password.'
      });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const memStored = inMemoryResetCodes.get(cleanEmail);
    const validInMemory = memStored && memStored.code === cleanCode && Date.now() <= memStored.expires;

    const validInDb = user.resetPasswordToken && 
      user.resetPasswordToken === cleanCode && 
      (!user.resetPasswordExpires || new Date() <= new Date(user.resetPasswordExpires));

    if (!validInMemory && !validInDb) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code. Please check the code or request a new one.'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    inMemoryResetCodes.delete(cleanEmail);

    return res.json({
      success: true,
      message: 'Password reset successfully! You can now use your new password.'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// Logout
// -------------------------------------------------------------
export const logout = (req: Request, res: Response) => {
  if ((req as any).session) {
    (req as any).session.destroy((err: any) => {
      if (err) console.error('Session destroy error:', err);
    });
  }

  res.clearCookie('token');
  res.clearCookie('connect.sid');

  return res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

// -------------------------------------------------------------
// Admin Panel Users Management
// -------------------------------------------------------------

export const getAdminUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const defaultAdminEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@shift24.com').toLowerCase().trim();
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

    // Auto-seed default admin if not in DB so it always appears
    const existingDefault = await User.findOne({ email: defaultAdminEmail });
    if (!existingDefault) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultAdminPassword, salt);
      await User.create({
        name: 'Shift24 Super Admin',
        email: defaultAdminEmail,
        password: hashedPassword,
        phone: '+91 98451 00000',
        role: 'admin',
        adminTitle: 'Super Administrator',
        status: 'active',
        addresses: [{ title: 'Operations HQ', address: 'MG Road, Kochi, Kerala', isDefault: true }],
        allergies: [],
        totalSpent: 0,
        totalOrders: 0
      });
    }

    const { role } = req.query;
    const query: any = {};
    if (role && role !== 'all') {
      query.role = role;
    }

    const users = await User.find(query).select('-password').sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: users
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createAdminUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, phone, role, adminTitle } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const validRole = ['admin', 'staff', 'kitchen', 'customer'].includes(role) ? role : 'customer';
    const defaultTitle = validRole === 'admin' 
      ? 'Super Administrator' 
      : validRole === 'kitchen' 
      ? 'Kitchen Manager' 
      : validRole === 'staff' 
      ? 'Staff Administrator' 
      : 'Customer';

    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      phone: phone ? phone.trim() : '+91 98451 00000',
      role: validRole,
      adminTitle: adminTitle ? adminTitle.trim() : defaultTitle,
      status: 'active',
      addresses: [{ title: 'Operations Office', address: 'MG Road, Kochi, Kerala', isDefault: true }],
      allergies: [],
      totalSpent: 0,
      totalOrders: 0
    });

    const safeUser = {
      _id: newUser._id,
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      adminTitle: newUser.adminTitle,
      status: newUser.status,
      createdAt: newUser.createdAt
    };

    return res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: safeUser
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdminUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, phone, role, adminTitle, status, password } = req.body;

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (role && ['admin', 'staff', 'kitchen', 'customer'].includes(role)) {
      user.role = role;
    }
    if (adminTitle !== undefined) user.adminTitle = adminTitle.trim();
    if (status && ['active', 'inactive'].includes(status)) {
      const defaultEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@shift24.com').toLowerCase().trim();
      if (user.email === defaultEmail && status === 'inactive') {
        return res.status(400).json({
          success: false,
          message: 'The primary Super Administrator cannot be deactivated'
        });
      }
      user.status = status;
    }

    if (password && password.trim().length >= 6) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password.trim(), salt);
    }

    await user.save();

    const safeUser = {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      adminTitle: user.adminTitle,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    return res.json({
      success: true,
      message: 'Admin user updated successfully',
      data: safeUser
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAdminUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const defaultEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@shift24.com').toLowerCase().trim();
    if (user.email === defaultEmail) {
      return res.status(400).json({
        success: false,
        message: 'The primary Super Administrator account cannot be deleted'
      });
    }

    const currentUserId = req.user?._id?.toString() || (req.user as any)?.id?.toString();
    if (currentUserId && currentUserId === user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own currently logged-in account'
      });
    }

    await User.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'Admin user removed successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


