import type { Request, Response } from 'express';
import crypto from 'crypto';

/**
 * Signed Cloudinary uploads.
 *
 * The browser never sees the API secret: it sends a base64 data URI here, this
 * controller signs the request and posts the file to Cloudinary, then returns
 * the public CDN URL that gets stored in the menu item's `image` field.
 */

const MAX_DECODED_BYTES = 8 * 1024 * 1024; // 8 MB after base64 decoding

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const readCloudinaryConfig = () => ({
  cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
  apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  folder: (process.env.CLOUDINARY_FOLDER || 'shift24/menu').trim()
});

export const getUploadConfigStatus = (_req: Request, res: Response) => {
  const { cloudName, apiKey, apiSecret, folder } = readCloudinaryConfig();
  const missing = [
    !cloudName && 'CLOUDINARY_CLOUD_NAME',
    !apiKey && 'CLOUDINARY_API_KEY',
    !apiSecret && 'CLOUDINARY_API_SECRET'
  ].filter(Boolean) as string[];

  return res.json({
    success: true,
    data: {
      configured: missing.length === 0,
      cloudName: cloudName || null,
      folder,
      missing
    }
  });
};

export const uploadMenuImage = async (req: Request, res: Response) => {
  try {
    const { cloudName, apiKey, apiSecret, folder } = readCloudinaryConfig();

    const missing = [
      !cloudName && 'CLOUDINARY_CLOUD_NAME',
      !apiKey && 'CLOUDINARY_API_KEY',
      !apiSecret && 'CLOUDINARY_API_SECRET'
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      return res.status(503).json({
        success: false,
        code: 'CLOUDINARY_NOT_CONFIGURED',
        message: `Cloudinary is not configured. Add ${missing.join(', ')} to backend/.env and restart the server.`
      });
    }

    const file = typeof req.body?.file === 'string' ? req.body.file.trim() : '';
    const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(file);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Send the image as a base64 data URI in the "file" field (data:image/…;base64,…).'
      });
    }

    const mime = match[1].toLowerCase();
    const extension = MIME_TO_EXTENSION[mime];
    if (!extension) {
      return res.status(400).json({
        success: false,
        message: `Unsupported file type "${mime}". Use a JPEG, PNG, WebP or GIF image.`
      });
    }

    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ success: false, message: 'The uploaded image is empty.' });
    }
    if (buffer.length > MAX_DECODED_BYTES) {
      return res.status(413).json({
        success: false,
        message: `Image is too large (${(buffer.length / (1024 * 1024)).toFixed(1)} MB). Maximum size is 8 MB.`
      });
    }

    // Cloudinary signs the alphabetically sorted, non-file parameters.
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams: Record<string, string> = { folder, timestamp: String(timestamp) };
    const toSign = Object.keys(signedParams)
      .sort()
      .map(key => `${key}=${signedParams[key]}`)
      .join('&');
    const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), `menu-${timestamp}.${extension}`);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature', signature);

    const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form
    });

    const payload: any = await cloudinaryRes.json().catch(() => ({}));

    if (!cloudinaryRes.ok || !payload?.secure_url) {
      return res.status(502).json({
        success: false,
        message: payload?.error?.message || `Cloudinary rejected the upload (HTTP ${cloudinaryRes.status}).`
      });
    }

    return res.json({
      success: true,
      data: {
        url: payload.secure_url,
        publicId: payload.public_id,
        width: payload.width,
        height: payload.height,
        format: payload.format,
        bytes: payload.bytes
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Image upload failed' });
  }
};
