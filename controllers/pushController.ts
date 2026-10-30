import { Request, Response } from 'express';
import webpush from 'web-push';
import { DevicePushSubscription, IDevicePushSubscription } from '../models/DevicePushSubscription';
import { isConnectedToDb } from '../config/db';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BAKL_qgysJYbEDWGIz7J2GwoDneG__iurPhMBL77kqH2zb90AyadZ2BPsqlz2uIpEYI9g1V_qixTkZ0225igfOY';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'zku2p0yA2Slp9rx5Lf78liQ6ODCCRVC4pE0QgtsPRDk';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@shift24.com';

// Configure Web Push with VAPID credentials
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn('[WebPush] Error initializing VAPID credentials:', err);
}

/**
 * Universal helper to send push notifications to phones matching a target query
 */
export async function sendPushNotification(
  target: {
    role?: 'customer' | 'admin' | 'driver';
    email?: string;
    userId?: string;
  },
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: any;
    tag?: string;
  }
) {
  if (!isConnectedToDb) return { sentCount: 0, failedCount: 0 };

  const query: any = {};
  if (target.role) {
    query.role = target.role;
  }
  if (target.email) {
    query.email = target.email.toLowerCase().trim();
  }
  if (target.userId) {
    query.userId = target.userId;
  }

  const subscriptions = await DevicePushSubscription.find(query);
  if (subscriptions.length === 0) {
    return { sentCount: 0, failedCount: 0 };
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
    tag: payload.tag || `shift24-${Date.now()}`,
    data: payload.data || { url: target.role === 'driver' ? '/driver/portal' : target.role === 'admin' ? '/admin' : '/notifications' }
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys
        },
        notificationPayload
      );
      sentCount++;
    } catch (err: any) {
      failedCount++;
      // If subscription expired or was unsubscribed by device, remove from database
      if (err.statusCode === 410 || err.statusCode === 404) {
        await DevicePushSubscription.deleteOne({ _id: sub._id });
        console.log(`[WebPush] Removed expired push subscription: ${sub._id}`);
      } else {
        console.warn(`[WebPush] Error sending push to device (${sub._id}):`, err.message);
      }
    }
  }

  return { sentCount, failedCount };
}

/**
 * GET /api/push/vapid-public-key
 */
export const getVapidPublicKey = async (req: Request, res: Response) => {
  return res.json({
    success: true,
    publicKey: VAPID_PUBLIC_KEY
  });
};

/**
 * POST /api/push/subscribe
 * Register or update device push subscription with user role & identity
 */
export const subscribeDevice = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB not connected' });
    }

    const { subscription, role, email, userId, name, device } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ success: false, message: 'Invalid push subscription payload' });
    }

    const assignedRole = role === 'admin' || role === 'driver' ? role : 'customer';
    const cleanEmail = (email || '').toLowerCase().trim();

    const updated = await DevicePushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          role: assignedRole,
          email: cleanEmail,
          userId: userId || '',
          name: name || '',
          device: device || (req.headers['user-agent']?.includes('iPhone') ? 'iOS Device' : req.headers['user-agent']?.includes('Android') ? 'Android Device' : 'Web Device')
        }
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      message: 'Push subscription registered successfully',
      data: updated
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/push/unsubscribe
 */
export const unsubscribeDevice = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB not connected' });
    }

    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Endpoint is required' });
    }

    await DevicePushSubscription.deleteOne({ endpoint });
    return res.json({ success: true, message: 'Device unsubscribed from push notifications' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/push/test
 * Send immediate test push to verify phone reception
 */
export const sendTestPush = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB not connected' });
    }

    const { role, email } = req.body;
    const targetRole = role === 'admin' || role === 'driver' ? role : 'customer';

    let title = 'Shift24 Meal Prep';
    let body = 'Your mobile device is linked! You will receive meal delivery updates.';
    let url = '/notifications';

    if (targetRole === 'admin') {
      title = 'Shift24 Admin Portal';
      body = 'Admin Alert: Push notification service is active for live order & fleet tracking.';
      url = '/admin';
    } else if (targetRole === 'driver') {
      title = 'Shift24 Driver Dispatch';
      body = 'Driver Alert: Mobile notifications connected! You will receive assigned delivery runs.';
      url = '/driver/portal';
    }

    const result = await sendPushNotification(
      { role: targetRole, email },
      {
        title,
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: { url, role: targetRole }
      }
    );

    return res.json({
      success: true,
      message: `Test notification sent to ${result.sentCount} device(s)`,
      ...result
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
