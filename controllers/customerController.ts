import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { isConnectedToDb } from '../config/db';

export function isDummyCustomer(c: any): boolean {
  if (!c) return true;
  const email = (c.email || c.customerEmail || '').toLowerCase().trim();
  const name = (c.name || c.customerName || '').toLowerCase().trim();
  const id = (c.id || c.subId || c._id || '').toString();

  const dummyIds = new Set(['CUST-101', 'CUST-102', 'CUST-103', 'CUST-104', 'CUST-105', 'CUST-972', 'CUST-143', 'SUB-801', 'SUB-802', 'SUB-803', 'SUB-804', 'SUB-805']);
  if (dummyIds.has(id)) return true;

  const dummyEmails = new Set([
    'rahul.s@example.com', 'ananya.roy@example.com', 'vikram.m@example.com', 
    'pooja.i@example.com', 'karthik.n@example.com', 'aarav@shift24.food',
    'alex.mercer@gmail.com', 'peterparkar@gmail.com'
  ]);
  if (dummyEmails.has(email)) return true;
  if (email.endsWith('@example.com') || email.endsWith('@example.net')) return true;

  const dummyNames = new Set([
    'rahul sharma', 'ananya roy', 'vikram menon', 'pooja iyer', 'karthik nair',
    'aarav sharma', 'alex mercer', 'peter parker'
  ]);
  if (dummyNames.has(name)) return true;

  return false;
}

/**
 * Automatically create or update a Customer in MongoDB from a Subscription
 */
export async function syncCustomerFromSubscription(sub: any): Promise<any> {
  if (!sub || !isConnectedToDb) {
    return null;
  }

  const cleanEmail = (sub.customerEmail || '').toLowerCase().trim();
  if (!cleanEmail) return null;

  const deliveries = (sub.durationDays || 7) * (parseInt(sub.mealsPerDay) || 1);
  const totalAmount = Number(sub.totalPrice) || 0;

  try {
    let user = await User.findOne({ email: cleanEmail });
    if (user) {
      user.totalSpent = (user.totalSpent || 0) + totalAmount;
      user.totalOrders = (user.totalOrders || 0) + deliveries;
      if (sub.customerPhone && !user.phone) {
        user.phone = sub.customerPhone;
      }
      if (sub.customerName && (!user.name || user.name === 'Customer')) {
        user.name = sub.customerName;
      }
      if (sub.address) {
        const hasAddr = user.addresses?.some((a: any) => a.address.toLowerCase() === sub.address.toLowerCase());
        if (!hasAddr) {
          user.addresses = user.addresses || [];
          user.addresses.push({ title: 'Home', address: sub.address, isDefault: user.addresses.length === 0 });
        }
      }
      if (Array.isArray(sub.allergies) && sub.allergies.length > 0) {
        user.allergies = Array.from(new Set([...(user.allergies || []), ...sub.allergies]));
      }
      await user.save();
      return user;
    } else {
      const newUser = await User.create({
        name: sub.customerName || 'Customer',
        email: cleanEmail,
        phone: sub.customerPhone || '',
        role: 'customer',
        allergies: Array.isArray(sub.allergies) ? sub.allergies : [],
        addresses: sub.address ? [{ title: 'Home', address: sub.address, isDefault: true }] : [],
        totalSpent: totalAmount,
        totalOrders: deliveries
      });
      return newUser;
    }
  } catch (err) {
    console.warn('[CustomerController] Error syncing customer to DB:', err);
    return null;
  }
}

/**
 * Get customers strictly derived from the Subscription collection in MongoDB
 */
export const getAllCustomers = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { search } = req.query;

    // Retrieve all subscriptions directly from MongoDB
    const subscriptions = await Subscription.find({}).sort({ createdAt: -1 });

    const customerMap = new Map<string, any>();

    for (const sub of subscriptions) {
      if (!sub.customerEmail || isDummyCustomer(sub)) continue;
      const email = sub.customerEmail.toLowerCase().trim();
      const deliveries = (sub.durationDays || 7) * (parseInt(sub.mealsPerDay as any) || 1);
      const price = Number(sub.totalPrice) || 0;

      const existing = customerMap.get(email);
      if (existing) {
        existing.totalOrders += deliveries;
        existing.totalSpent += price;
        if (sub.status === 'Active') {
          existing.activePlan = sub.planTitle || existing.activePlan;
          existing.status = 'Active';
        }
        if (sub.address && (!existing.address || existing.address === 'Address not provided')) {
          existing.address = sub.address;
        }
        if (sub.customerPhone && (!existing.phone || existing.phone === 'N/A')) {
          existing.phone = sub.customerPhone;
        }
        if (Array.isArray(sub.allergies) && sub.allergies.length > 0) {
          existing.allergies = Array.from(new Set([...existing.allergies, ...sub.allergies]));
        }
        customerMap.set(email, existing);
      } else {
        const cleanSubId = (sub.subId || '').replace(/^SUB-/, '');
        customerMap.set(email, {
          id: `CUST-${cleanSubId || Math.floor(100 + Math.random() * 900)}`,
          name: sub.customerName || 'Customer',
          email,
          phone: sub.customerPhone || 'N/A',
          totalOrders: deliveries,
          totalSpent: price,
          joinedDate: sub.startDate || (sub.createdAt ? new Date(sub.createdAt).toISOString() : new Date().toISOString()),
          activePlan: sub.planTitle || 'Standard Plan',
          allergies: Array.isArray(sub.allergies) ? sub.allergies : [],
          address: sub.address || 'Address not provided',
          coordinates: (sub as any).coordinates || null,
          status: sub.status === 'Cancelled' ? 'Inactive' : 'Active',
          role: 'customer'
        });
      }
    }

    let result = Array.from(customerMap.values());

    if (search) {
      const q = String(search).toLowerCase().trim();
      result = result.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
      );
    }

    return res.json({ success: true, count: result.length, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCustomerById = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const cleanId = id.toLowerCase().trim();

    const sub = await Subscription.findOne({
      $or: [
        { customerEmail: new RegExp('^' + cleanId + '$', 'i') },
        { subId: id },
        ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])
      ]
    });

    if (!sub) {
      return res.status(404).json({ success: false, message: 'Customer not found in subscriptions' });
    }

    const deliveries = (sub.durationDays || 7) * (parseInt(sub.mealsPerDay as any) || 1);
    const customerObj = {
      id: `CUST-${(sub.subId || '').replace(/^SUB-/, '')}`,
      name: sub.customerName,
      email: sub.customerEmail,
      phone: sub.customerPhone,
      totalOrders: deliveries,
      totalSpent: sub.totalPrice,
      joinedDate: sub.startDate || (sub.createdAt ? new Date(sub.createdAt).toISOString() : new Date().toISOString()),
      activePlan: sub.planTitle,
      allergies: sub.allergies || [],
      address: sub.address,
      status: sub.status === 'Cancelled' ? 'Inactive' : 'Active',
      role: 'customer'
    };

    return res.json({ success: true, data: customerObj });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCustomerAllergies = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { allergies } = req.body;

    if (!Array.isArray(allergies)) {
      return res.status(400).json({ success: false, message: 'Allergies must be an array' });
    }

    // Update in Subscriptions for this customer
    await Subscription.updateMany(
      { customerEmail: new RegExp('^' + id.trim() + '$', 'i') },
      { allergies }
    );

    // Also update in User if exists
    await User.updateOne(
      { email: new RegExp('^' + id.trim() + '$', 'i') },
      { allergies }
    );

    return res.json({ success: true, message: 'Allergies updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
