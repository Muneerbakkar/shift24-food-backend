import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { Subscription } from '../models/Subscription';
import { isConnectedToDb } from '../config/db';

const DUMMY_ORDER_IDS = new Set(['ORD-901', 'ORD-902', 'ORD-903', 'ORD-904', 'ORD-905', 'ORD-906']);
const DUMMY_CUSTOMERS = new Set(['Rahul Sharma', 'Ananya Roy', 'Vikram Menon', 'Pooja Iyer', 'Karthik Nair']);

/**
 * Automatically sync/generate dispatch orders into MongoDB from active subscriptions for Today only
 */
/**
 * Universal helper to check if a date is skipped.
 * Supports both standard 1-indexed ISO format ('2026-10-25') and legacy 0-indexed month format ('2026-9-25').
 */
export const isDateSkipped = (skippedDates: any[], targetDateISO: string): boolean => {
  if (!Array.isArray(skippedDates) || skippedDates.length === 0 || !targetDateISO) return false;

  const targetParts = targetDateISO.split('-');
  if (targetParts.length !== 3) return false;
  const tY = Number(targetParts[0]);
  const tM = Number(targetParts[1]); // 1-12
  const tD = Number(targetParts[2]);

  return skippedDates.some(sd => {
    if (!sd) return false;
    const clean = String(sd).trim();
    if (clean === targetDateISO) return true;

    const parts = clean.split('-');
    if (parts.length === 3) {
      const sY = Number(parts[0]);
      const sM = Number(parts[1]);
      const sD = Number(parts[2]);

      // 1. Direct 1-indexed match (e.g. 2026-10-25 or 2026-10-5)
      if (sY === tY && sM === tM && sD === tD) return true;

      // 2. Legacy 0-indexed match (where month 0-11 was saved, e.g. 9 for October)
      if (sY === tY && sM === (tM - 1) && sD === tD) return true;
    }
    return false;
  });
};

/**
 * Universal helper to check if a specific meal slot is skipped.
 * Checks both whole date skips (skippedDates) and specific meal skips (skippedMeals, e.g. '2026-10-25:Breakfast').
 */
export const isMealSkipped = (
  skippedDates: any[] | undefined,
  skippedMeals: any[] | undefined,
  targetDateISO: string,
  mealType: 'Breakfast' | 'Lunch' | 'Dinner'
): boolean => {
  // If whole date is skipped, meal is skipped
  if (isDateSkipped(skippedDates || [], targetDateISO)) return true;

  if (Array.isArray(skippedMeals) && skippedMeals.length > 0) {
    const targetKey = `${targetDateISO}:${mealType}`.toLowerCase();
    const suffix = mealType === 'Breakfast' ? 'B' : mealType === 'Lunch' ? 'L' : 'D';
    const targetKeySuffix = `${targetDateISO}-${suffix}`.toLowerCase();

    return skippedMeals.some(sm => {
      if (!sm) return false;
      const clean = String(sm).trim().toLowerCase();
      if (clean === targetKey || clean === targetKeySuffix) return true;
      if (clean.includes(targetDateISO.toLowerCase()) && clean.includes(mealType.toLowerCase())) return true;
      return false;
    });
  }

  return false;
};

export const syncOrdersFromSubscriptions = async (options?: { slot?: 'Breakfast' | 'Lunch' | 'Dinner'; targetDateISO?: string }) => {
  if (!isConnectedToDb) return;
  try {
    // Only generate orders for Active subscriptions
    const activeSubs = await Subscription.find({
      status: 'Active'
    });

    // Clean up non-delivered orders for any paused, cancelled, or completed subscriptions
    const inactiveSubs = await Subscription.find({
      status: { $in: ['Paused', 'Cancelled', 'Completed'] }
    });
    const inactiveSubIds = inactiveSubs.map(s => s.subId).filter(Boolean);
    if (inactiveSubIds.length > 0) {
      await Order.deleteMany({
        subscriptionId: { $in: inactiveSubIds },
        status: { $ne: 'Delivered' }
      });
    }

    // Collect skipped and paused subscription details for admin generation feedback
    const skippedSubscriptions: Array<{
      subId: string;
      customerName: string;
      customerPhone?: string;
      planTitle?: string;
      skippedDate: string;
      reason: string;
    }> = [];

    const pausedSubscriptions: Array<{
      subId: string;
      customerName: string;
      customerPhone?: string;
      planTitle?: string;
      pauseStartDate?: string;
      pauseEndDate?: string;
      reason: string;
    }> = [];

    // Pre-populate subscriptions explicitly set to 'Paused'
    for (const p of inactiveSubs) {
      if (p.status === 'Paused') {
        const pStart = p.pauseStartDate ? String(p.pauseStartDate).split('T')[0] : '';
        const pEnd = p.pauseEndDate ? String(p.pauseEndDate).split('T')[0] : '';
        const reason = pStart && pEnd
          ? `Paused from ${pStart} until ${pEnd}`
          : pStart
          ? `Paused starting from ${pStart}`
          : 'Subscription status is currently Paused';

        pausedSubscriptions.push({
          subId: p.subId || 'SUB',
          customerName: p.customerName || 'Customer',
          customerPhone: p.customerPhone || '',
          planTitle: p.planTitle || 'Meal Plan',
          pauseStartDate: pStart || undefined,
          pauseEndDate: pEnd || undefined,
          reason
        });
      }
    }

    const getLocalISODate = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const now = new Date();
    const todayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayISO = getLocalISODate(todayObj);

    const tomorrowObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowISO = getLocalISODate(tomorrowObj);

    // Clean up legacy order IDs without date slugs (e.g. ORD-785-B, ORD-785-M-D)
    await Order.deleteMany({
      orderId: { $regex: /^ORD-[0-9A-Za-z]+(-M)?-[BLD]$/ }
    });

    // Ensure all skipped dates across active subscriptions have their pending orders purged
    for (const sub of activeSubs) {
      if (sub.status !== 'Active') continue;
      const cleanId = (sub.subId || '').replace(/^SUB-/, '') || 'SUB';
      if (Array.isArray(sub.skippedDates) && sub.skippedDates.length > 0) {
        for (const sd of sub.skippedDates) {
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
      }
    }

    // Varied daily meal options per slot for realistic dispatch
    const breakfastVarieties = [
      'Chef Breakfast',
      'Protein Oatmeal & Fresh Berries',
      'Scrambled Eggs & Sourdough Toast',
      'Greek Yogurt Protein Parfait',
      'Avocado Spinach Egg Omelette',
      'Chia Seed High-Protein Pudding',
      'Whole Grain High-Protein Toast'
    ];
    const lunchVarieties = [
      'Power Lunch',
      'Grilled Herb Chicken & Quinoa',
      'Pan-Seared Salmon Teriyaki Bowl',
      'Lean Beef Steak Strips & Steamed Greens',
      'Mediterranean Chickpea & Grain Bowl',
      'Lemon Herb Roasted Chicken Breast',
      'High-Protein Tofu & Avocado Crunch Bowl'
    ];
    const dinnerVarieties = [
      'Balanced Dinner',
      'Roasted Salmon & Steamed Asparagus',
      'Herb Crusted Grilled Chicken Breast',
      'Pan-Seared Protein Medallions & Sweet Potato',
      'Low-Carb Zucchini & Ricotta Lasagna',
      'Hearty Grilled Steak Salad',
      'Garlic Basil Chicken with Brown Rice'
    ];

    const subIds = activeSubs.map(s => s.subId).filter(Boolean);
    const existingOrders = await Order.find({ subscriptionId: { $in: subIds } });
    const existingOrderMap = new Map<string, any>();
    for (const ord of existingOrders) {
      existingOrderMap.set(ord.orderId, ord);
    }

    const ordersToInsert: any[] = [];
    const bulkUpdates: any[] = [];

    for (const sub of activeSubs) {
      const cleanId = (sub.subId || '').replace(/^SUB-/, '') || 'SUB';
      const mealsPerDay = parseInt(sub.mealsPerDay as any) || 3;
      const slot = (sub.slot || 'all').toLowerCase();

      const durationDays = Number(sub.durationDays) || 7;
      const perMealCost = Math.round(Number(sub.totalPrice || 0) / (durationDays * mealsPerDay)) || 150;

      const slotsToGenerate: Array<{
        suffix: string;
        type: 'Breakfast' | 'Lunch' | 'Dinner';
        time: string;
      }> = [];

      if (mealsPerDay === 3 || slot === 'all') {
        slotsToGenerate.push(
          { suffix: 'B', type: 'Breakfast', time: '07:30 AM - 08:30 AM' },
          { suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM' },
          { suffix: 'D', type: 'Dinner', time: '07:30 PM - 08:30 PM' }
        );
      } else if (mealsPerDay === 2) {
        if (slot.includes('dinner')) {
          slotsToGenerate.push(
            { suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM' },
            { suffix: 'D', type: 'Dinner', time: '07:30 PM - 08:30 PM' }
          );
        } else {
          slotsToGenerate.push(
            { suffix: 'B', type: 'Breakfast', time: '07:30 AM - 08:30 AM' },
            { suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM' }
          );
        }
      } else {
        if (slot.includes('breakfast')) {
          slotsToGenerate.push({ suffix: 'B', type: 'Breakfast', time: '07:30 AM - 08:30 AM' });
        } else if (slot.includes('dinner')) {
          slotsToGenerate.push({ suffix: 'D', type: 'Dinner', time: '07:30 PM - 08:30 PM' });
        } else {
          slotsToGenerate.push({ suffix: 'L', type: 'Lunch', time: '12:00 PM - 01:00 PM' });
        }
      }

      // Determine start date cleanly in local time
      let subStartDate = new Date(todayObj);
      if (sub.startDate) {
        const cleanStart = String(sub.startDate).split('T')[0];
        const parts = cleanStart.split('-');
        if (parts.length === 3) {
          subStartDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else {
          const parsed = new Date(sub.startDate);
          if (!isNaN(parsed.getTime())) {
            subStartDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
          }
        }
      }

      // Generate orders for today only
      const totalDays = Math.min(Math.max(durationDays, 1), 60);

      for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
        const orderDate = new Date(subStartDate.getFullYear(), subStartDate.getMonth(), subStartDate.getDate() + dayIdx);
        const orderISO = getLocalISODate(orderDate); // e.g. "2026-10-23"

        // Generate orders for target date (default Today)
        const targetDate = options?.targetDateISO || todayISO;
        if (orderISO !== targetDate) {
          continue;
        }

        const shortDate = orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Skip dates explicitly skipped by customer (supports both 1-indexed '2026-10-25' and 0-indexed '2026-9-25')
        const isSkipped = isDateSkipped(sub.skippedDates, orderISO);
        if (isSkipped) {
          // If orders already exist in MongoDB for this skipped date, remove pending/preparing ones!
          const dateSlug = orderISO.replace(/-/g, '');
          for (const s of slotsToGenerate) {
            const dateOrderId = `ORD-${cleanId}-${dateSlug}-${s.suffix}`;
            await Order.deleteMany({ orderId: dateOrderId, status: { $ne: 'Delivered' } });
          }
          if (!skippedSubscriptions.some(x => x.subId === sub.subId)) {
            skippedSubscriptions.push({
              subId: sub.subId || 'SUB',
              customerName: sub.customerName || 'Customer',
              customerPhone: sub.customerPhone || '',
              planTitle: sub.planTitle || 'Meal Plan',
              skippedDate: orderISO,
              reason: `Customer opted out / skipped delivery on ${orderISO}`
            });
          }
          continue;
        }

        // Skip dates if subscription is paused (range or indefinite)
        if (sub.status === 'Paused') {
          continue;
        }

        if (sub.pauseStartDate) {
          const pStartISO = String(sub.pauseStartDate).trim().split('T')[0];
          const pEndISO = sub.pauseEndDate ? String(sub.pauseEndDate).trim().split('T')[0] : null;
          const isPaused = pEndISO
            ? (orderISO >= pStartISO && orderISO <= pEndISO)
            : (orderISO >= pStartISO);

          if (isPaused) {
            const dateSlug = orderISO.replace(/-/g, '');
            for (const s of slotsToGenerate) {
              const dateOrderId = `ORD-${cleanId}-${dateSlug}-${s.suffix}`;
              await Order.deleteMany({ orderId: dateOrderId, status: { $ne: 'Delivered' } });
            }
            if (!pausedSubscriptions.some(x => x.subId === sub.subId)) {
              pausedSubscriptions.push({
                subId: sub.subId || 'SUB',
                customerName: sub.customerName || 'Customer',
                customerPhone: sub.customerPhone || '',
                planTitle: sub.planTitle || 'Meal Plan',
                pauseStartDate: pStartISO,
                pauseEndDate: pEndISO || undefined,
                reason: pEndISO ? `Paused from ${pStartISO} until ${pEndISO}` : `Paused starting ${pStartISO}`
              });
            }
            continue;
          }
        }

        const isToday = orderISO === todayISO;
        const isTomorrow = orderISO === tomorrowISO;
        const isPast = orderISO < todayISO;

        let labelPrefix = shortDate;
        if (isToday) {
          labelPrefix = `Today, ${shortDate}`;
        } else if (isTomorrow) {
          labelPrefix = `Tomorrow, ${shortDate}`;
        }
        const fullDeliveryDate = `${labelPrefix} (${orderISO})`;

        let defaultStatus: 'Delivered' | 'Preparing' | 'Pending' = 'Pending';
        if (isPast) {
          defaultStatus = 'Delivered';
        } else if (isToday) {
          defaultStatus = 'Preparing';
        }

        const dateSlug = orderISO.replace(/-/g, '');

        const activeSlots = options?.slot
          ? slotsToGenerate.filter(s => s.type.toLowerCase() === options.slot!.toLowerCase())
          : slotsToGenerate;

        for (const s of activeSlots) {
          // Check if this specific meal slot was skipped
          const mealSkipped = isMealSkipped(sub.skippedDates, (sub as any).skippedMeals, orderISO, s.type);
          if (mealSkipped) {
            const dateOrderId = `ORD-${cleanId}-${dateSlug}-${s.suffix}`;
            await Order.deleteMany({ orderId: dateOrderId, status: { $ne: 'Delivered' } });

            if (!skippedSubscriptions.some(x => x.subId === sub.subId && (x as any).skippedSlot === s.type && x.skippedDate === orderISO)) {
              skippedSubscriptions.push({
                subId: sub.subId || 'SUB',
                customerName: sub.customerName || 'Customer',
                customerPhone: sub.customerPhone || '',
                planTitle: sub.planTitle || 'Meal Plan',
                skippedDate: orderISO,
                reason: `Customer skipped ${s.type} on ${orderISO}`
              });
            }
            continue;
          }

          const mealTitle = s.type === 'Breakfast'
            ? `${sub.planTitle} - ${breakfastVarieties[dayIdx % breakfastVarieties.length]}`
            : s.type === 'Lunch'
            ? `${sub.planTitle} - ${lunchVarieties[dayIdx % lunchVarieties.length]}`
            : `${sub.planTitle} - ${dinnerVarieties[dayIdx % dinnerVarieties.length]}`;

          // Format ID: e.g. ORD-785-20261023-B
          const dateOrderId = `ORD-${cleanId}-${dateSlug}-${s.suffix}`;

          const existingOrder = existingOrderMap.get(dateOrderId);

          if (!existingOrder) {
            ordersToInsert.push({
              orderId: dateOrderId,
              subscriptionId: sub.subId,
              customerName: sub.customerName,
              customerPhone: sub.customerPhone,
              customerEmail: sub.customerEmail,
              planTitle: sub.planTitle,
              mealName: mealTitle,
              mealType: s.type,
              deliveryDate: fullDeliveryDate,
              deliveryTimeSlot: s.time,
              address: sub.address || 'Address on file',
              coordinates: (sub as any).coordinates || (sub.latitude && sub.longitude ? { lat: sub.latitude, lng: sub.longitude } : undefined),
              latitude: sub.latitude || (sub as any).coordinates?.lat,
              longitude: sub.longitude || (sub as any).coordinates?.lng,
              status: defaultStatus,
              amount: perMealCost,
              paymentMethod: 'Online / Subscription',
              allergies: Array.isArray(sub.allergies) ? sub.allergies : [],
              deliveredAt: defaultStatus === 'Delivered' ? new Date() : undefined
            });
          } else {
            const updates: any = {};
            if (existingOrder.deliveryDate !== fullDeliveryDate) {
              updates.deliveryDate = fullDeliveryDate;
              // If order was pending and date has arrived today, update to Preparing
              if (isToday && existingOrder.status === 'Pending') {
                updates.status = 'Preparing';
              } else if (isPast && existingOrder.status === 'Pending') {
                updates.status = 'Delivered';
              }
            }

            if (sub.customerName && existingOrder.customerName !== sub.customerName) {
              updates.customerName = sub.customerName;
            }
            if (sub.customerPhone && existingOrder.customerPhone !== sub.customerPhone) {
              updates.customerPhone = sub.customerPhone;
            }
            if (sub.address && existingOrder.address !== sub.address) {
              updates.address = sub.address;
            }
            const subLat = typeof sub.latitude === 'number' ? sub.latitude : (sub as any).coordinates?.lat;
            const subLng = typeof sub.longitude === 'number' ? sub.longitude : (sub as any).coordinates?.lng;
            if (typeof subLat === 'number' && typeof subLng === 'number' && !isNaN(subLat) && !isNaN(subLng)) {
              if (existingOrder.latitude !== subLat || existingOrder.longitude !== subLng || !existingOrder.coordinates || existingOrder.coordinates.lat !== subLat) {
                updates.coordinates = { lat: subLat, lng: subLng };
                updates.latitude = subLat;
                updates.longitude = subLng;
              }
            }

            if (Object.keys(updates).length > 0) {
              bulkUpdates.push({
                updateOne: {
                  filter: { _id: existingOrder._id },
                  update: { $set: updates }
                }
              });
            }
          }
        }
      }
    }

    if (ordersToInsert.length > 0) {
      await Order.insertMany(ordersToInsert, { ordered: false });
    }
    if (bulkUpdates.length > 0) {
      await Order.bulkWrite(bulkUpdates);
    }

    const targetDate = options?.targetDateISO || todayISO;
    return {
      targetDateISO: targetDate,
      slot: options?.slot,
      generatedOrdersCount: ordersToInsert.length,
      activeSubscriptionsCount: activeSubs.length,
      skippedSubscriptions,
      pausedSubscriptions
    };
  } catch (err) {
    console.warn('[OrderSync] Error syncing orders from subscriptions:', err);
    return {
      targetDateISO: options?.targetDateISO || '',
      slot: options?.slot,
      generatedOrdersCount: 0,
      activeSubscriptionsCount: 0,
      skippedSubscriptions: [],
      pausedSubscriptions: []
    };
  }
};

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

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

/**
 * On-demand manual order generation triggered by the Admin "Generate Orders" button
 */
export const generateOrdersFromSubscriptions = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const slot = (req.body?.slot || req.query?.slot) as 'Breakfast' | 'Lunch' | 'Dinner' | undefined;
    const targetDateISO = (req.body?.date || req.query?.date || req.body?.targetDateISO || req.query?.targetDateISO) as string | undefined;
    const summary = await syncOrdersFromSubscriptions({ slot, targetDateISO });

    const dbOrders = await Order.find({}).sort({ createdAt: -1 });
    const filtered = dbOrders.filter(o => 
      !DUMMY_ORDER_IDS.has(o.orderId || (o as any).id) && 
      !DUMMY_CUSTOMERS.has(o.customerName)
    );

    return res.json({ 
      success: true, 
      count: filtered.length, 
      data: filtered, 
      summary,
      message: slot 
        ? `Successfully generated ${slot} orders for Today!` 
        : `Successfully generated dispatch orders for Today!` 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete all orders from database
 */
export const deleteAllOrders = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const result = await Order.deleteMany({});
    return res.json({ 
      success: true, 
      deletedCount: result.deletedCount, 
      message: 'All orders have been deleted successfully.' 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single order by orderId or _id
 */
export const deleteOrderById = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const conditions: any[] = [{ orderId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const deleted = await Order.findOneAndDelete({ $or: conditions });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.json({ success: true, message: 'Order deleted successfully', data: deleted });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Bulk delete orders by array of orderIds or _ids
 */
export const deleteOrdersBulk = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array is required' });
    }

    const validObjectIds = ids.filter(id => mongoose.isValidObjectId(id));
    const result = await Order.deleteMany({
      $or: [
        { orderId: { $in: ids } },
        { _id: { $in: validObjectIds } }
      ]
    });

    return res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} orders deleted successfully`
    });
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
    const { status, distanceFromHub, distanceFromPrevOrder, deliveredAt } = req.body;

    const validStatuses = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    const conditions: any[] = [{ orderId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updateFields: any = { status };
    if (typeof distanceFromHub === 'number' && !isNaN(distanceFromHub)) {
      updateFields.distanceFromHub = distanceFromHub;
    }
    if (typeof distanceFromPrevOrder === 'number' && !isNaN(distanceFromPrevOrder)) {
      updateFields.distanceFromPrevOrder = distanceFromPrevOrder;
    }
    if (deliveredAt) {
      updateFields.deliveredAt = new Date(deliveredAt);
    } else if (status === 'Delivered') {
      updateFields.deliveredAt = new Date();
    } else {
      updateFields.deliveredAt = null;
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { $or: conditions },
      { $set: updateFields },
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

/**
 * Assign a driver to an order
 */
export const assignDriverToOrder = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { driverId, driverName, driverPhone, driverVehicle, updateStatusToOutForDelivery, stopIndex } = req.body;

    const conditions: any[] = [{ orderId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    let updateDoc: any = {};
    if (driverId) {
      updateDoc = {
        $set: {
          driverId,
          driverName: driverName || '',
          driverPhone: driverPhone || '',
          driverVehicle: driverVehicle || '',
          assignedAt: new Date(),
          ...(typeof stopIndex === 'number' ? { stopIndex } : {}),
          ...(updateStatusToOutForDelivery ? { status: 'Out for Delivery' } : {})
        }
      };
    } else {
      // Unassign driver
      updateDoc = {
        $unset: {
          driverId: 1,
          driverName: 1,
          driverPhone: 1,
          driverVehicle: 1,
          assignedAt: 1,
          stopIndex: 1
        }
      };
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { $or: conditions },
      updateDoc,
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.json({ 
      success: true, 
      data: updatedOrder, 
      message: driverId 
        ? `Order successfully assigned to driver ${driverName || driverId}` 
        : 'Driver unassigned from order' 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Bulk assign a driver to multiple orders
 */
export const bulkAssignDriverToOrders = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { orderIds, driverId, driverName, driverPhone, driverVehicle, updateStatusToOutForDelivery } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderIds array is required' });
    }

    const validObjectIds = orderIds.filter(id => mongoose.isValidObjectId(id));
    const filter = {
      $or: [
        { orderId: { $in: orderIds } },
        { _id: { $in: validObjectIds } }
      ]
    };

    let updateDoc: any = {};
    if (driverId) {
      updateDoc = {
        $set: {
          driverId,
          driverName: driverName || '',
          driverPhone: driverPhone || '',
          driverVehicle: driverVehicle || '',
          assignedAt: new Date(),
          ...(updateStatusToOutForDelivery ? { status: 'Out for Delivery' } : {})
        }
      };
    } else {
      updateDoc = {
        $unset: {
          driverId: 1,
          driverName: 1,
          driverPhone: 1,
          driverVehicle: 1,
          assignedAt: 1
        }
      };
    }

    const result = await Order.updateMany(filter, updateDoc);

    return res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: driverId
        ? `Successfully assigned ${result.modifiedCount} orders to ${driverName || driverId}`
        : `Successfully unassigned driver from ${result.modifiedCount} orders`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update route sequence (stop order & road distances) for assigned driver orders
 */
export const updateRouteSequence = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { sequence } = req.body;
    if (!Array.isArray(sequence) || sequence.length === 0) {
      return res.status(400).json({ success: false, message: 'sequence array is required' });
    }

    const bulkOps = sequence.map((item: any) => ({
      updateOne: {
        filter: {
          $or: [
            { orderId: item.orderId },
            ...(mongoose.isValidObjectId(item.orderId) ? [{ _id: item.orderId }] : [])
          ]
        },
        update: {
          $set: {
            stopIndex: item.stopIndex,
            ...(typeof item.distanceFromHub === 'number' ? { distanceFromHub: item.distanceFromHub } : {}),
            ...(typeof item.distanceFromPrevOrder === 'number' ? { distanceFromPrevOrder: item.distanceFromPrevOrder } : {})
          }
        }
      }
    }));

    await Order.bulkWrite(bulkOps);

    return res.json({
      success: true,
      message: `Updated route sequence for ${sequence.length} orders`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
