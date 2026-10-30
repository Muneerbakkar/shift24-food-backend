import { sendPushNotification } from './pushController';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Subscription } from '../models/Subscription';
import { Order } from '../models/Order';
import { isConnectedToDb } from '../config/db';
import { syncCustomerFromSubscription } from './customerController';
import { resolveAddressCoordinates } from '../routes/geocodeRoutes';

/**
 * Helper to safely extract or geocode coordinates for a subscription
 */
export async function resolveSubscriptionCoords(
  rawCoords?: any,
  rawLat?: any,
  rawLng?: any,
  address?: string
): Promise<{ lat: number; lng: number } | undefined> {
  let lat: number | undefined = undefined;
  let lng: number | undefined = undefined;

  if (typeof rawLat === 'number' && !isNaN(rawLat)) {
    lat = rawLat;
  } else if (rawLat && !isNaN(Number(rawLat))) {
    lat = Number(rawLat);
  }

  if (typeof rawLng === 'number' && !isNaN(rawLng)) {
    lng = rawLng;
  } else if (rawLng && !isNaN(Number(rawLng))) {
    lng = Number(rawLng);
  }

  if (lat === undefined && rawCoords && typeof rawCoords.lat === 'number' && !isNaN(rawCoords.lat)) {
    lat = Number(rawCoords.lat);
  }
  if (lng === undefined && rawCoords && typeof rawCoords.lng === 'number' && !isNaN(rawCoords.lng)) {
    lng = Number(rawCoords.lng);
  }

  // If both lat and lng are valid numbers, return them
  if (lat !== undefined && lng !== undefined) {
    return { lat, lng };
  }

  // If address is available, geocode it
  if (address && address.trim()) {
    try {
      const geo = await resolveAddressCoordinates(address);
      if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
        return { lat: geo.lat, lng: geo.lng };
      }
    } catch (e) {
      console.warn('[SubscriptionController] Error geocoding address:', e);
    }
  }

  return undefined;
}

/**
 * Backfill coordinates for any subscriptions missing latitude, longitude, or coordinates
 */
export const backfillSubscriptionCoordinates = async () => {
  if (!isConnectedToDb) return;
  try {
    const subsToFix = await Subscription.find({
      $or: [
        { latitude: { $exists: false } },
        { latitude: null },
        { longitude: { $exists: false } },
        { longitude: null },
        { 'coordinates.lat': { $exists: false } },
        { 'coordinates.lat': null }
      ]
    });

    for (const sub of subsToFix) {
      if (sub.address && sub.address.trim()) {
        const geo = await resolveAddressCoordinates(sub.address);
        if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
          await Subscription.updateOne(
            { _id: sub._id },
            {
              $set: {
                latitude: geo.lat,
                longitude: geo.lng,
                coordinates: { lat: geo.lat, lng: geo.lng }
              }
            }
          );
        }
      }
    }
  } catch (err) {
    console.warn('[SubscriptionBackfill] Notice during backfill:', err);
  }
};

export const getAllSubscriptions = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    // Trigger non-blocking backfill for any subscription missing coords
    backfillSubscriptionCoordinates().catch(() => {});

    const { plan, status, search, email } = req.query;
    const query: any = {};

    if (email) {
      query.customerEmail = new RegExp('^' + String(email).trim() + '$', 'i');
    }
    if (plan && plan !== 'all') {
      query.planId = plan;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      const q = String(search).trim();
      query.$or = [
        { customerName: { $regex: q, $options: 'i' } },
        { subId: { $regex: q, $options: 'i' } },
        { customerPhone: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } },
        { customerEmail: { $regex: q, $options: 'i' } }
      ];
    }

    const subscriptions = await Subscription.find(query).sort({ createdAt: -1 });
    return res.json({ success: true, count: subscriptions.length, data: subscriptions });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSubscriptionById = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const conditions: any[] = [{ subId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const sub = await Subscription.findOne({ $or: conditions });
    if (!sub) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    return res.json({ success: true, data: sub });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createSubscription = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const subData = req.body;
    const subId = subData.subId || subData.id || `SUB-${Math.floor(100 + Math.random() * 900)}`;

    const coords = await resolveSubscriptionCoords(
      subData.coordinates,
      subData.latitude,
      subData.longitude,
      subData.address
    );

    const newSubData: any = {
      subId,
      customerName: subData.customerName || 'Customer',
      customerEmail: (subData.customerEmail || '').toLowerCase().trim(),
      customerPhone: subData.customerPhone || '',
      planId: subData.planId || 'balance',
      planTitle: subData.planTitle || 'Balanced Health',
      duration: subData.duration || '7 Days',
      durationDays: Number(subData.durationDays) || 7,
      mealsPerDay: subData.mealsPerDay ? String(subData.mealsPerDay) : '3',
      slot: subData.slot || 'all',
      slotLabel: subData.slotLabel || 'All Meals',
      totalPrice: Number(subData.totalPrice) || 0,
      status: subData.status || 'Active',
      startDate: subData.startDate || new Date().toISOString(),
      endDate: subData.endDate || new Date(Date.now() + 7 * 86400000).toISOString(),
      nextDelivery: subData.nextDelivery || 'Tomorrow, 07:30 AM (Breakfast)',
      address: subData.address || '',
      coordinates: coords,
      latitude: coords ? coords.lat : undefined,
      longitude: coords ? coords.lng : undefined,
      allergies: Array.isArray(subData.allergies) ? subData.allergies : [],
      preferences: Array.isArray(subData.preferences) ? subData.preferences : [],
      skippedDates: Array.isArray(subData.skippedDates) ? subData.skippedDates : [],
      skippedMeals: Array.isArray(subData.skippedMeals) ? subData.skippedMeals : []
    };

    const created = await Subscription.create(newSubData);

    // Trigger Web Push to Customer and Admin
    try {
      // 1. Push to Customer
      sendPushNotification(
        { role: 'customer', email: created.customerEmail },
        {
          title: `Subscription Confirmed! 🎉`,
          body: `Your ${created.duration} ${created.planTitle} plan is active! Next delivery: ${created.nextDelivery}`,
          icon: '/icons/icon-192.png',
          data: { url: '/notifications', role: 'customer' }
        }
      ).catch(() => {});

      // 2. Push to Admins
      sendPushNotification(
        { role: 'admin' },
        {
          title: `New Subscription Order! 💰`,
          body: `${created.customerName} subscribed to ${created.planTitle} (${created.duration}, ₹${created.totalPrice})`,
          icon: '/icons/icon-192.png',
          data: { url: '/admin/subscriptions', role: 'admin' }
        }
      ).catch(() => {});
    } catch (e) {}

    // Sync customer record in MongoDB User collection
    try {
      await syncCustomerFromSubscription(created);
    } catch (syncErr) {
      console.warn('[SubscriptionController] Customer sync warning:', syncErr);
    }

    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { status, pauseStartDate, pauseEndDate } = req.body;

    if (!['Active', 'Paused', 'Cancelled', 'Completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid subscription status' });
    }

    const updateFields: any = { status };

    if (status === 'Paused') {
      updateFields.pauseStartDate = pauseStartDate || new Date().toISOString().split('T')[0];
      updateFields.pauseEndDate = pauseEndDate || null;

      if (pauseEndDate) {
        const d = new Date(pauseEndDate);
        const resumeFormatted = isNaN(d.getTime()) ? pauseEndDate : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        updateFields.nextDelivery = `Resuming on ${resumeFormatted}`;
      } else if (pauseStartDate) {
        const d = new Date(pauseStartDate);
        const startFormatted = isNaN(d.getTime()) ? pauseStartDate : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        updateFields.nextDelivery = `Paused from ${startFormatted}`;
      } else {
        updateFields.nextDelivery = 'Paused';
      }
    } else if (status === 'Active') {
      updateFields.pauseStartDate = null;
      updateFields.pauseEndDate = null;
      updateFields.nextDelivery = 'Tomorrow, 07:30 AM';
    } else if (status === 'Cancelled') {
      updateFields.nextDelivery = 'Cancelled';
    }

    const conditions: any[] = [{ subId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updated = await Subscription.findOneAndUpdate(
      { $or: conditions },
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    try {
      await syncCustomerFromSubscription(updated);
    } catch {}

    // When subscription is paused or cancelled, automatically delete non-delivered orders
    if (status === 'Paused' || status === 'Cancelled') {
      try {
        await Order.deleteMany({
          subscriptionId: updated.subId,
          status: { $ne: 'Delivered' }
        });
      } catch (delErr) {
        console.warn('[SubscriptionController] Notice deleting non-delivered orders for paused/cancelled sub:', delErr);
      }
    }

    // Synchronize coordinates and address to all active orders of this subscription
    try {
      const orderUpdates: any = {};
      if (updated.address) orderUpdates.address = updated.address;
      if (updated.coordinates) orderUpdates.coordinates = updated.coordinates;
      if (typeof updated.latitude === 'number') orderUpdates.latitude = updated.latitude;
      if (typeof updated.longitude === 'number') orderUpdates.longitude = updated.longitude;

      if (Object.keys(orderUpdates).length > 0) {
        await Order.updateMany(
          { subscriptionId: updated.subId },
          { $set: orderUpdates }
        );
      }
    } catch (orderSyncErr) {
      console.warn('[SubscriptionController] Notice updating linked orders:', orderSyncErr);
    }

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSubscriptionSlot = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { slot, slotLabel } = req.body;

    if (!slot || !slotLabel) {
      return res.status(400).json({ success: false, message: 'slot and slotLabel are required' });
    }

    const conditions: any[] = [{ subId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updated = await Subscription.findOneAndUpdate(
      { $or: conditions },
      { slot, slotLabel },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSubscriptionDetails = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { 
      planId,
      planTitle,
      duration, 
      durationDays, 
      mealsPerDay, 
      slot, 
      slotLabel, 
      address, 
      coordinates, 
      latitude, 
      longitude, 
      allergies, 
      preferences, 
      skippedDates, 
      skippedMeals,
      startDate, 
      endDate, 
      pauseStartDate, 
      pauseEndDate 
    } = req.body;

    const conditions: any[] = [{ subId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updateFields: any = {};
    if (planId !== undefined) updateFields.planId = planId;
    if (planTitle !== undefined) updateFields.planTitle = planTitle;
    if (duration !== undefined) updateFields.duration = duration;
    if (durationDays !== undefined) updateFields.durationDays = durationDays;
    if (mealsPerDay !== undefined) updateFields.mealsPerDay = mealsPerDay;
    if (slot !== undefined) updateFields.slot = slot;
    if (slotLabel !== undefined) updateFields.slotLabel = slotLabel;
    if (address !== undefined) updateFields.address = address;
    if (allergies !== undefined) updateFields.allergies = allergies;
    if (preferences !== undefined) updateFields.preferences = preferences;
    if (skippedDates !== undefined) {
      updateFields.skippedDates = skippedDates;
      // Auto-purge any existing non-delivered orders for these skipped dates!
      try {
        const subIdToClean = id;
        const cleanId = String(subIdToClean).replace(/^SUB-/, '');
        for (const sd of (Array.isArray(skippedDates) ? skippedDates : [])) {
          if (!sd) continue;
          const parts = String(sd).trim().split('-');
          if (parts.length === 3) {
            const sY = Number(parts[0]);
            const sM = Number(parts[1]);
            const sD = Number(parts[2]);
            const slug1 = `${sY}${String(sM).padStart(2, '0')}${String(sD).padStart(2, '0')}`;
            const slug2 = `${sY}${String(sM + 1).padStart(2, '0')}${String(sD).padStart(2, '0')}`;
            for (const slug of [slug1, slug2]) {
              await Order.deleteMany({
                orderId: { $regex: new RegExp(`^ORD-${cleanId}-${slug}-[BLD]$`) },
                status: { $ne: 'Delivered' }
              });
            }
          }
        }
      } catch (cleanErr) {
        console.warn('Error purging orders for skipped dates in updateSubscriptionDetails:', cleanErr);
      }
    }

    if (skippedMeals !== undefined) {
      updateFields.skippedMeals = skippedMeals;
      // Auto-purge any existing non-delivered orders for these skipped meals!
      try {
        const cleanId = String(id).replace(/^SUB-/, '');
        for (const sm of (Array.isArray(skippedMeals) ? skippedMeals : [])) {
          if (!sm) continue;
          const [datePart, mealSlot] = String(sm).split(':');
          if (datePart && mealSlot) {
            const slug = datePart.replace(/-/g, '');
            const suffix = mealSlot.toLowerCase().startsWith('b') ? 'B' : mealSlot.toLowerCase().startsWith('l') ? 'L' : 'D';
            await Order.deleteMany({
              orderId: `ORD-${cleanId}-${slug}-${suffix}`,
              status: { $ne: 'Delivered' }
            });
          }
        }
      } catch (cleanErr) {
        console.warn('Error purging orders for skipped meals in updateSubscriptionDetails:', cleanErr);
      }
    }

    if (startDate !== undefined) updateFields.startDate = startDate;
    if (endDate !== undefined) updateFields.endDate = endDate;
    if (pauseStartDate !== undefined) updateFields.pauseStartDate = pauseStartDate;
    if (pauseEndDate !== undefined) updateFields.pauseEndDate = pauseEndDate;

    if (address !== undefined || coordinates !== undefined || latitude !== undefined || longitude !== undefined) {
      const coords = await resolveSubscriptionCoords(coordinates, latitude, longitude, address);
      if (coords) {
        updateFields.coordinates = coords;
        updateFields.latitude = coords.lat;
        updateFields.longitude = coords.lng;
      }
    }

    const updated = await Subscription.findOneAndUpdate(
      { $or: conditions },
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    try {
      await syncCustomerFromSubscription(updated);
    } catch {}

    // Synchronize coordinates and address to all active orders of this subscription
    try {
      const orderUpdates: any = {};
      if (updated.address) orderUpdates.address = updated.address;
      if (updated.coordinates) orderUpdates.coordinates = updated.coordinates;
      if (typeof updated.latitude === 'number') orderUpdates.latitude = updated.latitude;
      if (typeof updated.longitude === 'number') orderUpdates.longitude = updated.longitude;

      if (Object.keys(orderUpdates).length > 0) {
        await Order.updateMany(
          { subscriptionId: updated.subId },
          { $set: orderUpdates }
        );
      }
    } catch (orderSyncErr) {
      console.warn('[SubscriptionController] Notice updating linked orders:', orderSyncErr);
    }

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a subscription by subId or _id
 */
export const deleteSubscription = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database not connected' });
    }

    const { id } = req.params;
    const filter: any = mongoose.isValidObjectId(id)
      ? { $or: [{ _id: id }, { subId: id }] }
      : { subId: id };

    const subscription = await Subscription.findOne(filter);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    const subId = subscription.subId;
    await Subscription.deleteOne(filter);

    // Also clean up non-delivered / pending orders linked to this subscription
    if (subId) {
      try {
        await Order.deleteMany({
          subscriptionId: subId,
          status: { $in: ['Pending', 'Preparing'] }
        });
      } catch (orderErr) {
        console.warn('[deleteSubscription] Notice deleting linked orders:', orderErr);
      }
    }

    return res.json({
      success: true,
      message: `Subscription ${subId || id} deleted successfully`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
