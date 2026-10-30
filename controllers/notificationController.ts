import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Notification, INotification } from '../models/Notification';
import { Subscription } from '../models/Subscription';
import { Order } from '../models/Order';
import { isConnectedToDb } from '../config/db';

/**
 * Synchronize subscriptions & orders into the Notification collection for a customer.
 * If a notification already exists (even if previously deleted), it is not re-created.
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
        { customerPhone: { $in: phones } }
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

    // 2. Process Order notifications
    for (const order of orders) {
      const status = order.status || 'Pending';
      const meal = order.mealName || `${order.mealType || 'Meal'}`;
      const orderTime = order.updatedAt || order.createdAt || new Date();
      const shortAddr = (order.address || '').split(',')[0] || 'Kakkanad';

      if (status === 'Delivered') {
        notifsToInsert.push({
          notificationId: `ord-delivered-${order.orderId}`,
          customerEmail: email,
          customerPhone: order.customerPhone || '',
          customerName: order.customerName || '',
          subscriptionId: order.subscriptionId || '',
          orderId: order.orderId,
          title: `Meal Delivered: ${order.mealType}`,
          message: `Your ${meal} has been delivered to ${shortAddr}. Enjoy your fresh, healthy meal!`,
          type: 'success',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: orderTime
        });
      } else if (status === 'Out for Delivery') {
        notifsToInsert.push({
          notificationId: `ord-out-${order.orderId}`,
          customerEmail: email,
          customerPhone: order.customerPhone || '',
          customerName: order.customerName || '',
          subscriptionId: order.subscriptionId || '',
          orderId: order.orderId,
          title: `Out for Delivery: ${order.mealType}`,
          message: `Rider ${order.driverName || 'Dispatch'} is heading to ${shortAddr} with your ${meal}.`,
          type: 'delivery',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: orderTime
        });
      } else if (status === 'Preparing') {
        notifsToInsert.push({
          notificationId: `ord-prep-${order.orderId}`,
          customerEmail: email,
          customerPhone: order.customerPhone || '',
          customerName: order.customerName || '',
          subscriptionId: order.subscriptionId || '',
          orderId: order.orderId,
          title: `Kitchen Preparing: ${order.mealType}`,
          message: `Our chefs are freshly cooking your ${meal} for today's ${order.deliveryTimeSlot || order.mealType} slot.`,
          type: 'kitchen',
          unread: true,
          isDeleted: false,
          link: '/profile',
          createdAt: orderTime
        });
      }
    }

    // Insert only notifications that don't already exist
    for (const notif of notifsToInsert) {
      const exists = await Notification.findOne({ notificationId: notif.notificationId });
      if (!exists) {
        await Notification.create(notif);
      }
    }
  } catch (err) {
    console.warn('[NotificationController] Error syncing customer notifications:', err);
  }
}

/**
 * GET /api/notifications
 */
export const getCustomerNotifications = async (req: Request, res: Response) => {
  try {
    const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
    if (!isDbReady) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const email = (
      (req as any).user?.email ||
      req.query.email ||
      ''
    ).toString().toLowerCase().trim();

    if (!email) {
      return res.json({ success: true, count: 0, data: [] });
    }

    // Auto-sync notifications for customer
    await syncCustomerNotifications(email);

    const query: any = { customerEmail: email, isDeleted: false };
    if (req.query.unread === 'true') {
      query.unread = true;
    }

    const notifications = await Notification.find(query).sort({ createdAt: -1 });

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

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

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

    const email = (
      (req as any).user?.email ||
      req.body.email ||
      req.query.email ||
      ''
    ).toString().toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ success: false, message: 'Customer email is required' });
    }

    const result = await Notification.updateMany(
      { customerEmail: email, isDeleted: false, unread: true },
      { $set: { unread: false } }
    );

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
 * Bulk delete notifications (delete selected or delete all for customer)
 */
export const deleteNotificationsBulk = async (req: Request, res: Response) => {
  try {
    const isDbReady = isConnectedToDb || mongoose.connection.readyState === 1;
    if (!isDbReady) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const { ids, all, email: bodyEmail } = req.body;
    const email = (
      (req as any).user?.email ||
      bodyEmail ||
      req.query.email ||
      ''
    ).toString().toLowerCase().trim();

    if (all === true) {
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email required to delete all notifications' });
      }

      const result = await Notification.updateMany(
        { customerEmail: email, isDeleted: false },
        { $set: { isDeleted: true } }
      );

      return res.json({
        success: true,
        message: 'All notifications deleted successfully',
        deletedCount: result.modifiedCount
      });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      const objectIds = ids.filter((id: string) => mongoose.isValidObjectId(id));
      const strIds = ids.map((id: string) => String(id));

      const result = await Notification.updateMany(
        {
          $or: [
            { _id: { $in: objectIds } },
            { notificationId: { $in: strIds } }
          ]
        },
        { $set: { isDeleted: true } }
      );

      return res.json({
        success: true,
        message: `${result.modifiedCount} notification(s) deleted successfully`,
        deletedCount: result.modifiedCount
      });
    }

    return res.status(400).json({ success: false, message: 'Provide ids array or set all=true' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
