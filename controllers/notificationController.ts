import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Notification, INotification } from '../models/Notification';
import { Subscription } from '../models/Subscription';
import { Order } from '../models/Order';
import { isConnectedToDb } from '../config/db';
import { sendPushNotification } from './pushController';

/**
 * Universal helper to create and broadcast a notification across the system & Web Push
 */
export async function createAndDispatchNotification(data: {
  notificationId?: string;
  role?: 'customer' | 'admin' | 'driver' | 'all';
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  driverId?: string;
  driverName?: string;
  subscriptionId?: string;
  orderId?: string;
  title: string;
  message: string;
  type?: 'order' | 'delivery' | 'kitchen' | 'dispatch' | 'system' | 'driver' | 'success' | 'alert' | 'calendar' | 'promo';
  status?: string;
  link?: string;
}) {
  const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
  if (!isDbReady) return null;

  try {
    const role = data.role || 'customer';
    const notifId = data.notificationId || `notif-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const link = data.link || (role === 'admin' ? '/admin/orders' : role === 'driver' ? '/driver/portal' : '/profile');

    const docData: any = {
      notificationId: notifId,
      role,
      customerEmail: (data.customerEmail || '').toLowerCase().trim(),
      customerPhone: data.customerPhone || '',
      customerName: data.customerName || '',
      driverId: data.driverId || '',
      driverName: data.driverName || '',
      subscriptionId: data.subscriptionId || '',
      orderId: data.orderId || '',
      title: data.title,
      message: data.message,
      type: data.type || (role === 'admin' ? 'dispatch' : role === 'driver' ? 'driver' : 'order'),
      status: data.status || '',
      unread: true,
      isDeleted: false,
      link
    };

    const updated = await Notification.findOneAndUpdate(
      { notificationId: notifId },
      { $set: docData },
      { upsert: true, new: true }
    );

    // Send Web Push notification to target devices
    sendPushNotification(
      {
        role: role === 'all' ? undefined : role,
        email: data.customerEmail
      },
      {
        title: data.title,
        body: data.message,
        data: { url: link, role, orderId: data.orderId }
      }
    ).catch(() => {});

    return updated;
  } catch (err: any) {
    console.warn('[NotificationController] Error creating notification:', err.message);
    return null;
  }
}

/**
 * Synchronize subscriptions & orders into the Notification collection for a customer.
 * If a notification already exists, it is updated to current status.
 */
export async function syncCustomerNotifications(customerEmail: string) {
  const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
  if (!isDbReady || !customerEmail) return;

  const email = customerEmail.toLowerCase().trim();
  try {
    const subscriptions = await Subscription.find({
      customerEmail: new RegExp('^' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    });

    if (subscriptions.length === 0) return;

    const phones = subscriptions.map(s => s.customerPhone).filter(Boolean);
    const subIds = subscriptions.map(s => s.subId).filter(Boolean);

    // Find any relevant orders
    const orders = await Order.find({
      $or: [
        { subscriptionId: { $in: subIds } },
        { customerPhone: { $in: phones } },
        { customerEmail: email }
      ]
    });

    const notifsToInsert: Partial<INotification>[] = [];

    // 1. Process Subscription notifications
    for (const sub of subscriptions) {
      const planName = sub.planTitle || 'Healthy Meal';
      const subId = sub.subId || 'SUB';
      const shortAddr = (sub.address || '').split(',')[0] || 'Kakkanad';
      const subCreatedAt = sub.createdAt || new Date();

      // Confirmed
      notifsToInsert.push({
        notificationId: `sub-confirm-${subId}`,
        role: 'customer',
        customerEmail: email,
        customerPhone: sub.customerPhone || '',
        customerName: sub.customerName || '',
        subscriptionId: subId,
        title: `Subscription Confirmed: ${planName}`,
        message: `Your ${sub.duration || 'monthly'} plan (${subId}) is active with ${sub.slotLabel || 'daily delivery'}. Meals will be delivered to ${shortAddr}.`,
        type: 'order',
        unread: true,
        isDeleted: false,
        link: '/profile',
        createdAt: subCreatedAt
      });

      // Upcoming delivery
      if (sub.status === 'Active') {
        const nextTime = sub.nextDelivery || 'Tomorrow, 08:00 AM - 09:00 AM';
        notifsToInsert.push({
          notificationId: `sub-sched-${subId}`,
          role: 'customer',
          customerEmail: email,
          customerPhone: sub.customerPhone || '',
          customerName: sub.customerName || '',
          subscriptionId: subId,
          title: `Upcoming Delivery Scheduled`,
          message: `Your next fresh meal delivery for ${planName} (${subId}) is set for ${nextTime}.`,
          type: 'delivery',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: new Date(new Date(subCreatedAt).getTime() + 1000)
        });
      }

      // Skipped dates
      if (Array.isArray(sub.skippedDates) && sub.skippedDates.length > 0) {
        notifsToInsert.push({
          notificationId: `sub-skipped-${subId}-${sub.skippedDates.length}`,
          role: 'customer',
          customerEmail: email,
          customerPhone: sub.customerPhone || '',
          customerName: sub.customerName || '',
          subscriptionId: subId,
          title: `Delivery Schedule Adjusted`,
          message: `You have ${sub.skippedDates.length} skipped delivery date(s) recorded (${sub.skippedDates.slice(0, 3).join(', ')}${sub.skippedDates.length > 3 ? '...' : ''}). Deliveries will pause automatically on those dates.`,
          type: 'calendar',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: sub.updatedAt || subCreatedAt
        });
      }

      // Paused
      if (sub.status === 'Paused') {
        const pauseRange = sub.pauseStartDate ? ` from ${sub.pauseStartDate}${sub.pauseEndDate ? ` to ${sub.pauseEndDate}` : ''}` : '';
        notifsToInsert.push({
          notificationId: `sub-paused-${subId}`,
          role: 'customer',
          customerEmail: email,
          customerPhone: sub.customerPhone || '',
          customerName: sub.customerName || '',
          subscriptionId: subId,
          title: `Subscription Paused`,
          message: `Your deliveries for ${planName} are paused${pauseRange}. You can resume anytime from your Profile.`,
          type: 'alert',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: sub.updatedAt || subCreatedAt
        });
      }
    }

    // 2. Process Order notifications according to dispatch status
    for (const order of orders) {
      const status = order.status || 'Pending';
      const meal = order.mealName || `${order.mealType || 'Meal'}`;
      const orderTime = order.updatedAt || order.createdAt || new Date();
      const shortAddr = (order.address || '').split(',')[0] || 'Kakkanad';

      if (status === 'Delivered') {
        notifsToInsert.push({
          notificationId: `ord-delivered-${order.orderId}`,
          role: 'customer',
          customerEmail: email,
          customerPhone: order.customerPhone || '',
          customerName: order.customerName || '',
          subscriptionId: order.subscriptionId || '',
          orderId: order.orderId,
          title: `Meal Delivered: ${order.mealType} 🍽️`,
          message: `Your ${meal} has been delivered to ${shortAddr}. Enjoy your fresh, healthy meal!`,
          type: 'success',
          status: 'Delivered',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: orderTime
        });
      } else if (status === 'Out for Delivery') {
        notifsToInsert.push({
          notificationId: `ord-out-${order.orderId}`,
          role: 'customer',
          customerEmail: email,
          customerPhone: order.customerPhone || '',
          customerName: order.customerName || '',
          subscriptionId: order.subscriptionId || '',
          orderId: order.orderId,
          title: `Out for Delivery: ${order.mealType} 🚚`,
          message: `Rider ${order.driverName || 'Fleet Rider'} is heading to ${shortAddr} with your ${meal}.`,
          type: 'delivery',
          status: 'Out for Delivery',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: orderTime
        });
      } else if (status === 'Preparing') {
        notifsToInsert.push({
          notificationId: `ord-prep-${order.orderId}`,
          role: 'customer',
          customerEmail: email,
          customerPhone: order.customerPhone || '',
          customerName: order.customerName || '',
          subscriptionId: order.subscriptionId || '',
          orderId: order.orderId,
          title: `Kitchen Cooking: ${order.mealType} 🍳`,
          message: `Our chefs are freshly cooking your ${meal} for today's ${order.deliveryTimeSlot || order.mealType} slot.`,
          type: 'kitchen',
          status: 'Preparing',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: orderTime
        });
      } else {
        // Pending
        notifsToInsert.push({
          notificationId: `ord-pending-${order.orderId}`,
          role: 'customer',
          customerEmail: email,
          customerPhone: order.customerPhone || '',
          customerName: order.customerName || '',
          subscriptionId: order.subscriptionId || '',
          orderId: order.orderId,
          title: `Meal Scheduled: ${order.mealType}`,
          message: `Your ${meal} is scheduled for today's ${order.deliveryTimeSlot || order.mealType} delivery in Kakkanad.`,
          type: 'order',
          status: 'Pending',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: orderTime
        });
      }
    }

    // Insert or update notifications
    for (const notif of notifsToInsert) {
      await Notification.findOneAndUpdate(
        { notificationId: notif.notificationId },
        { $setOnInsert: notif },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.warn('[NotificationController] Error syncing customer notifications:', err);
  }
}

/**
 * GET /api/notifications
 * Supports role: 'customer' | 'admin' | 'driver'
 */
export const getCustomerNotifications = async (req: Request, res: Response) => {
  try {
    const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
    if (!isDbReady) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const role = (req.query.role || (req as any).user?.role || '').toString().toLowerCase().trim();
    const email = (
      req.query.email ||
      (req as any).user?.email ||
      ''
    ).toString().toLowerCase().trim();
    const driverId = (req.query.driverId || '').toString().trim();

    // Auto-sync customer notifications if email is present
    if (email && (role === 'customer' || !role)) {
      await syncCustomerNotifications(email);
    }

    const query: any = { isDeleted: false };
    if (req.query.unread === 'true') {
      query.unread = true;
    }

    if (role === 'admin') {
      query.$or = [
        { role: 'admin' },
        { role: 'all' },
        { type: { $in: ['dispatch', 'kitchen', 'system'] } }
      ];
    } else if (role === 'driver') {
      const driverConds: any[] = [{ role: 'driver' }, { role: 'all' }];
      if (driverId) {
        driverConds.push({ driverId });
      }
      query.$or = driverConds;
    } else if (email) {
      query.$or = [
        { customerEmail: email },
        { role: 'customer', customerEmail: email },
        { role: 'all' }
      ];
    } else {
      // Guest or general view
      query.$or = [
        { role: 'customer' },
        { role: 'all' }
      ];
    }

    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(100);

    return res.json({
      success: true,
      count: notifications.length,
      unreadCount: notifications.filter(n => n.unread).length,
      data: notifications
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/notifications/:id/read
 */
export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
    if (!isDbReady) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const { id } = req.params;
    const conditions: any[] = [{ notificationId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updated = await Notification.findOneAndUpdate(
      { $or: conditions },
      { $set: { unread: false } },
      { new: true }
    );

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/notifications/read-all
 */
export const markAllNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
    if (!isDbReady) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const role = (req.body.role || req.query.role || '').toString().toLowerCase().trim();
    const email = (
      (req as any).user?.email ||
      req.body.email ||
      req.query.email ||
      ''
    ).toString().toLowerCase().trim();

    const filter: any = { isDeleted: false, unread: true };
    if (role === 'admin') {
      filter.$or = [{ role: 'admin' }, { type: { $in: ['dispatch', 'kitchen', 'system'] } }];
    } else if (role === 'driver') {
      filter.role = 'driver';
    } else if (email) {
      filter.customerEmail = email;
    }

    const result = await Notification.updateMany(filter, { $set: { unread: false } });

    return res.json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/notifications/:id
 * Delete a single notification (soft delete)
 */
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
    if (!isDbReady) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const { id } = req.params;
    const conditions: any[] = [{ notificationId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updated = await Notification.findOneAndUpdate(
      { $or: conditions },
      { $set: { isDeleted: true } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/notifications
 * Bulk delete notifications (delete selected or delete all for role/user)
 */
export const deleteNotificationsBulk = async (req: Request, res: Response) => {
  try {
    const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
    if (!isDbReady) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const { ids, all, email: bodyEmail, role: bodyRole } = req.body;
    const role = (bodyRole || req.query.role || '').toString().toLowerCase().trim();
    const email = (
      (req as any).user?.email ||
      bodyEmail ||
      req.query.email ||
      ''
    ).toString().toLowerCase().trim();

    if (all === true) {
      const filter: any = { isDeleted: false };
      if (role === 'admin') {
        filter.$or = [{ role: 'admin' }, { type: { $in: ['dispatch', 'kitchen', 'system'] } }];
      } else if (role === 'driver') {
        filter.role = 'driver';
      } else if (email) {
        filter.customerEmail = email;
      }

      const result = await Notification.updateMany(filter, { $set: { isDeleted: true } });

      return res.json({
        success: true,
        message: 'All notifications cleared successfully',
        modifiedCount: result.modifiedCount
      });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array is required for bulk deletion' });
    }

    const validObjectIds = ids.filter(id => mongoose.isValidObjectId(id));
    const conditions: any[] = [{ notificationId: { $in: ids } }];
    if (validObjectIds.length > 0) {
      conditions.push({ _id: { $in: validObjectIds } });
    }

    const result = await Notification.updateMany(
      { $or: conditions },
      { $set: { isDeleted: true } }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} notifications deleted successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
