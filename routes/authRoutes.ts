import { Router } from 'express';
import { 
  register, 
  login, 
  adminRegister, 
  adminLogin, 
  getMe, 
  updateAddresses,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser
} from '../controllers/authController';
import { driverLogin } from '../controllers/driverController';
import { requestOtp, verifyOtp } from '../controllers/otpController';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// Customer / general routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Customer OTP login (phone + SMS code)
router.post('/otp/request', requestOtp);
router.post('/otp/verify', verifyOtp);

// Driver routes
router.post('/driver-login', driverLogin);

// Admin routes
// Admin-only: this endpoint creates privileged accounts.
router.post('/admin-register', requireAdmin, adminRegister);
router.post('/admin-login', adminLogin);

// Admin user management routes
// Team management is restricted to a Super Administrator.
router.get('/admin-users', requireAdmin, getAdminUsers);
router.post('/admin-users', requireAdmin, createAdminUser);
router.put('/admin-users/:id', requireAdmin, updateAdminUser);
router.delete('/admin-users/:id', requireAdmin, deleteAdminUser);

// Current user profile & session verification
router.get('/me', requireAuth, getMe);
router.put('/profile', requireAuth, updateProfile);
router.put('/change-password', requireAuth, changePassword);
router.put('/addresses', requireAuth, updateAddresses);

// Logout
router.post('/logout', logout);

export default router;
