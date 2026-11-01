import { Router } from 'express';
import { getUploadConfigStatus, uploadMenuImage } from '../controllers/uploadController';

const router = Router();

// Current Cloudinary configuration status (never exposes the secret)
router.get('/status', getUploadConfigStatus);

// Upload a menu/dish image and return its Cloudinary CDN URL
router.post('/image', uploadMenuImage);

export default router;
