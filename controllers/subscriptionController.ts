import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Subscription } from '../models/Subscription';
import { isConnectedToDb } from '../config/db';
import { syncCustomerFromSubscription } from './customerController';

export const getAllSubscriptions = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

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

    const newSubData = {
      subId,
      customerName: subData.customerName || 'Customer',
      customerEmail: (subData.customerEmail || '').toLowerCase().trim(),
      customerPhone: subData.customerPhone || '',
      planId: subData.planId || 'balance',
      planTitle: subData.planTitle || 'Balanced Health',
      duration: subData.duration || '7 Days',
      durationDays: Number(subData.durationDays) || 7,
      mealsPerDay: subData.mealsPerDay || '3',
      slot: subData.slot || 'all',
      slotLabel: subData.slotLabel || 'All Meals',
      totalPrice: Number(subData.totalPrice) || 0,
      status: subData.status || 'Active',
      startDate: subData.startDate || new Date().toISOString(),
      endDate: subData.endDate || new Date(Date.now() + 7 * 86400000).toISOString(),
      nextDelivery: subData.nextDelivery || 'Tomorrow, 07:30 AM (Breakfast)',
      address: subData.address || '',
      allergies: Array.isArray(subData.allergies) ? subData.allergies : []
    };

    const created = await Subscription.create(newSubData);

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
    const { duration, durationDays, mealsPerDay, slot, slotLabel, address, allergies, preferences, startDate, endDate, pauseStartDate, pauseEndDate } = req.body;

    const conditions: any[] = [{ subId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updateFields: any = {};
    if (duration !== undefined) updateFields.duration = duration;
    if (durationDays !== undefined) updateFields.durationDays = durationDays;
    if (mealsPerDay !== undefined) updateFields.mealsPerDay = mealsPerDay;
    if (slot !== undefined) updateFields.slot = slot;
    if (slotLabel !== undefined) updateFields.slotLabel = slotLabel;
    if (address !== undefined) updateFields.address = address;
    if (allergies !== undefined) updateFields.allergies = allergies;
    if (preferences !== undefined) updateFields.preferences = preferences;
    if (startDate !== undefined) updateFields.startDate = startDate;
    if (endDate !== undefined) updateFields.endDate = endDate;
    if (pauseStartDate !== undefined) updateFields.pauseStartDate = pauseStartDate;
    if (pauseEndDate !== undefined) updateFields.pauseEndDate = pauseEndDate;

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

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
