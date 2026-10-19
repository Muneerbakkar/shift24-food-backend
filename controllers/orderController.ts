import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { Subscription } from '../models/Subscription';
import { isConnectedToDb } from '../config/db';

const DUMMY_ORDER_IDS = new Set(['ORD-901', 'ORD-902', 'ORD-903', 'ORD-904', 'ORD-905', 'ORD-906']);
const DUMMY_CUSTOMERS = new Set(['Rahul Sharma', 'Ananya Roy', 'Vikram Menon', 'Pooja Iyer', 'Karthik Nair']);

/**
 * Automatically sync/generate dispatch orders into MongoDB from active subscriptions
 */
export const syncOrdersFromSubscriptions = async () => {
  if (!isConnectedToDb) return;
  try {
    const activeSubs = await Subscription.find({ status: 'Active' });

    const todayObj = new Date();
    const todayFormatted = todayObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const todayDateStr = `Today, ${todayFormatted}`;

    const tomorrowObj = new Date();
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowFormatted = tomorrowObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const tomorrowDateStr = `Tomorrow, ${tomorrowFormatted}`;

    for (const sub of activeSubs) {
      const cleanId = (sub.subId || '').replace(/^SUB-/, '') || 'SUB';
      const mealsPerDay = parseInt(sub.mealsPerDay as any) || 3;
      const slot = (sub.slot || 'all').toLowerCase();

      const durationDays = Number(sub.durationDays) || 7;
      const perMealCost = Math.round(Number(sub.totalPrice || 0) / (durationDays * mealsPerDay));

      const slotsToGenerate: Array<{
        suffix: string;
        type: 'Breakfast' | 'Lunch' | 'Dinner';
        time: string;
        defaultName: string;
      }> = [];

      if (mealsPerDay === 3 || slot === 'all') {
        slotsToGenerate.push(
          { suffix: 'B', type: 'Breakfast', time: '07:30 AM - 08:30 AM', defaultName: `${sub.planTitle} - Chef Breakfast` },
          { suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM', defaultName: `${sub.planTitle} - Power Lunch` },
          { suffix: 'D', type: 'Dinner', time: '07:30 PM - 08:30 PM', defaultName: `${sub.planTitle} - Balanced Dinner` }
        );
      } else if (mealsPerDay === 2) {
        if (slot.includes('dinner')) {
          slotsToGenerate.push(
            { suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM', defaultName: `${sub.planTitle} - Power Lunch` },
            { suffix: 'D', type: 'Dinner', time: '07:30 PM - 08:30 PM', defaultName: `${sub.planTitle} - Balanced Dinner` }
          );
        } else {
          slotsToGenerate.push(
            { suffix: 'B', type: 'Breakfast', time: '07:30 AM - 08:30 AM', defaultName: `${sub.planTitle} - Chef Breakfast` },
            { suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM', defaultName: `${sub.planTitle} - Power Lunch` }
          );
        }
      } else {
        if (slot.includes('breakfast')) {
          slotsToGenerate.push({ suffix: 'B', type: 'Breakfast', time: '07:30 AM - 08:30 AM', defaultName: `${sub.planTitle} - Chef Breakfast` });
        } else if (slot.includes('dinner')) {
          slotsToGenerate.push({ suffix: 'D', type: 'Dinner', time: '07:30 PM - 08:30 PM', defaultName: `${sub.planTitle} - Balanced Dinner` });
        } else {
          slotsToGenerate.push({ suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM', defaultName: `${sub.planTitle} - Power Lunch` });
        }
      }

      for (const s of slotsToGenerate) {
        // 1. Today's order
        const todayOrderId = `ORD-${cleanId}-${s.suffix}`;
        const existingToday = await Order.findOne({ orderId: todayOrderId });
        if (!existingToday) {
          await Order.create({
            orderId: todayOrderId,
            subscriptionId: sub.subId,
            customerName: sub.customerName,
            customerPhone: sub.customerPhone,
            planTitle: sub.planTitle,
            mealName: s.defaultName,
            mealType: s.type,
            deliveryDate: todayDateStr,
            deliveryTimeSlot: s.time,
            address: sub.address || 'Address on file',
            status: 'Preparing',
            amount: perMealCost || 150,
            paymentMethod: 'Online / Subscription',
            allergies: Array.isArray(sub.allergies) ? sub.allergies : []
          });
        } else if (!existingToday.deliveryDate || !existingToday.deliveryDate.toLowerCase().includes('today')) {
          existingToday.deliveryDate = todayDateStr;
          await existingToday.save();
        }

        // 2. Tomorrow's order
        const tomorrowOrderId = `ORD-${cleanId}-M-${s.suffix}`;
        const existingTomorrow = await Order.findOne({ orderId: tomorrowOrderId });
        if (!existingTomorrow) {
          await Order.create({
            orderId: tomorrowOrderId,
            subscriptionId: sub.subId,
            customerName: sub.customerName,
            customerPhone: sub.customerPhone,
            planTitle: sub.planTitle,
            mealName: s.defaultName,
            mealType: s.type,
            deliveryDate: tomorrowDateStr,
            deliveryTimeSlot: s.time,
            address: sub.address || 'Address on file',
            status: 'Pending',
            amount: perMealCost || 150,
            paymentMethod: 'Online / Subscription',
            allergies: Array.isArray(sub.allergies) ? sub.allergies : []
          });
        } else if (!existingTomorrow.deliveryDate || !existingTomorrow.deliveryDate.toLowerCase().includes('tomorrow')) {
          existingTomorrow.deliveryDate = tomorrowDateStr;
          await existingTomorrow.save();
        }
      }
    }
  } catch (err) {
    console.warn('[OrderSync] Error syncing orders from subscriptions:', err);
  }
};

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    // Auto-sync daily dispatch orders for active subscriptions in MongoDB
    await syncOrdersFromSubscriptions();

    const { slot, status, search } = req.query;
    const query: any = {};

    if (slot && slot !== 'All') {
      query.mealType = new RegExp('^' + String(slot).trim() + '$', 'i');
    }
    if (status && status !== 'All') {
      query.status = new RegExp('^' + String(status).trim() + '$', 'i');
    }
    if (search) {
      const q = String(search).trim();
      query.$or = [
        { customerName: { $regex: q, $options: 'i' } },
        { orderId: { $regex: q, $options: 'i' } },
        { customerPhone: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } },
        { mealName: { $regex: q, $options: 'i' } }
      ];
    }

    const dbOrders = await Order.find(query).sort({ createdAt: -1 });

    const filtered = dbOrders.filter(o => 
      !DUMMY_ORDER_IDS.has(o.orderId || (o as any).id) && 
      !DUMMY_CUSTOMERS.has(o.customerName)
    );

    return res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const orderData = req.body;
    const orderId = orderData.orderId || orderData.id || `ORD-${Math.floor(100 + Math.random() * 900)}`;

    const newOrderData = {
      orderId,
      customerName: orderData.customerName || 'Customer',
      customerPhone: orderData.customerPhone || '',
      customerEmail: orderData.customerEmail || '',
      subscriptionId: orderData.subscriptionId || undefined,
      planTitle: orderData.planTitle || 'Meal Plan',
      mealName: orderData.mealName || 'Chef Choice Meal',
      mealType: orderData.mealType || 'Lunch',
      deliveryDate: orderData.deliveryDate || 'Tomorrow',
      deliveryTimeSlot: orderData.deliveryTimeSlot || '12:00 PM - 01:00 PM',
      address: orderData.address || 'Address not provided',
      coordinates: orderData.coordinates || undefined,
      status: orderData.status || 'Pending',
      amount: Number(orderData.amount) || 0,
      paymentMethod: orderData.paymentMethod || 'Online',
      allergies: Array.isArray(orderData.allergies) ? orderData.allergies : []
    };

    const createdOrder = await Order.create(newOrderData);
    return res.status(201).json({ success: true, data: createdOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    const conditions: any[] = [{ orderId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { $or: conditions },
      { status },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.json({ success: true, data: updatedOrder, message: `Status updated to ${status}` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
