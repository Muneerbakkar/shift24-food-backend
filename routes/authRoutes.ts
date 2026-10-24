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
import { requireAuth } from '../middleware/auth';

const router = Router();

// Customer / general routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Driver routes
router.post('/driver-login', driverLogin);

// Admin routes
router.post('/admin-register', adminRegister);
router.post('/admin-login', adminLogin);

// Admin user management routes
router.get('/admin-users', requireAuth, getAdminUsers);
router.post('/admin-users', requireAuth, createAdminUser);
router.put('/admin-users/:id', requireAuth, updateAdminUser);
router.delete('/admin-users/:id', requireAuth, deleteAdminUser);

// Current user profile & session verification
router.get('/me', requireAuth, getMe);
router.put('/profile', requireAuth, updateProfile);
router.put('/change-password', requireAuth, changePassword);
router.put('/addresses', requireAuth, updateAddresses);

// Logout
router.post('/logout', logout);

export default router;
