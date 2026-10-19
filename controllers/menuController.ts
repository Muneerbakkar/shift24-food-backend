import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Plan } from '../models/Plan';
import { MenuItem } from '../models/MenuItem';
import { isConnectedToDb } from '../config/db';

const sortDurationOptions = (opts: any) => {
  if (!Array.isArray(opts)) return opts;
  return [...opts].sort((a: any, b: any) => (Number(a.days) || 0) - (Number(b.days) || 0));
};

const getPlanSortRank = (p: any): number => {
  const id = String(p?.id || p?.planId || '').toLowerCase();
  const title = String(p?.title || '').toLowerCase();
  if (id.includes('loss') || title.includes('loss')) return 1;
  if (id.includes('gain') || title.includes('gain')) return 2;
  if (id.includes('balance') || title.includes('balance') || id.includes('maintain') || title.includes('maintain')) return 3;
  return Number(p?.order) || 99;
};

export const getPlans = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const plans = await Plan.find().sort({ order: 1, pricePerWeek: 1 });
    const normalized = plans
      .map(p => {
        const obj = (p.toObject ? p.toObject() : p) as any;
        return {
          ...obj,
          id: obj.planId || String(obj._id) || obj.id,
          planId: obj.planId || String(obj._id) || obj.id,
          durationOptions: sortDurationOptions(obj.durationOptions)
        };
      })
      .sort((a, b) => getPlanSortRank(a) - getPlanSortRank(b));

    return res.json({ success: true, count: normalized.length, data: normalized });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createPlan = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { planId, title, subtitle, description, pricePerWeek, calories, benefits, durationOptions, mealOptions, popular, badge, order } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Plan title is required' });
    }

    const id = planId || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newPlanObj = {
      planId: id,
      title,
      subtitle: subtitle || 'Customize your daily meal routine and subscription duration. The longer you commit, the more you save.',
      description: description || '',
      pricePerWeek: Number(pricePerWeek) || 3000,
      calories: calories || '1500 - 2000 kcal/day',
      benefits: Array.isArray(benefits) ? benefits : typeof benefits === 'string' ? benefits.split(',').map((b: string) => b.trim()).filter(Boolean) : [],
      durationOptions: sortDurationOptions(durationOptions),
      mealOptions: Array.isArray(mealOptions) ? mealOptions : [],
      active: true,
      popular: Boolean(popular),
      badge: badge || (popular ? 'MOST POPULAR' : ''),
      order: Number(order) || 99
    };

    if (newPlanObj.popular) {
      await Plan.updateMany({}, { popular: false });
    }

    const existing = await Plan.findOne({ planId: id });
    let saved;
    if (existing) {
      saved = await Plan.findOneAndUpdate({ planId: id }, newPlanObj, { new: true });
    } else {
      saved = await Plan.create(newPlanObj);
    }

    return res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePlan = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { title, subtitle, pricePerWeek, calories, description, benefits, durationOptions, mealOptions, active, popular, badge, order } = req.body;

    const updateFields: any = {};
    if (title !== undefined) updateFields.title = title;
    if (subtitle !== undefined) updateFields.subtitle = subtitle;
    if (pricePerWeek !== undefined) updateFields.pricePerWeek = Number(pricePerWeek);
    if (calories !== undefined) updateFields.calories = calories;
    if (description !== undefined) updateFields.description = description;
    if (benefits !== undefined) updateFields.benefits = Array.isArray(benefits) ? benefits : typeof benefits === 'string' ? benefits.split(',').map((b: string) => b.trim()).filter(Boolean) : benefits;
    if (durationOptions !== undefined) updateFields.durationOptions = sortDurationOptions(durationOptions);
    if (mealOptions !== undefined) updateFields.mealOptions = mealOptions;
    if (active !== undefined) updateFields.active = active;
    if (popular !== undefined) updateFields.popular = Boolean(popular);
    if (badge !== undefined) updateFields.badge = badge;
    if (order !== undefined) updateFields.order = Number(order);

    if (updateFields.popular === true) {
      await Plan.updateMany({ planId: { $ne: id } }, { popular: false });
    }

    const query = mongoose.isValidObjectId(id)
      ? { $or: [{ planId: id }, { _id: id }] }
      : { planId: id };

    const updated = await Plan.findOneAndUpdate(
      query,
      { ...updateFields, planId: id },
      { new: true, upsert: true }
    );

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePlan = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const query = mongoose.isValidObjectId(id)
      ? { $or: [{ planId: id }, { _id: id }] }
      : { planId: id };

    await Plan.deleteOne(query);
    return res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getWeeklyMenu = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { planId, day, mealType } = req.query;
    const query: any = {};

    if (planId && planId !== 'all') {
      query.planId = String(planId).toLowerCase().trim();
    }
    if (day) {
      query.day = Number(day);
    }
    if (mealType && mealType !== 'all') {
      query.mealType = String(mealType).toLowerCase().trim();
    }

    const items = await MenuItem.find(query).sort({ day: 1, mealType: 1 });
    return res.json({ success: true, count: items.length, data: items });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const saveMenuItem = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { 
      planId = 'balance', 
      day, 
      mealType, 
      name, 
      calories, 
      description, 
      protein, 
      carbs, 
      fat, 
      benefits, 
      image,
      microNutrients,
      ingredients
    } = req.body;

    if (!day || !mealType || !name) {
      return res.status(400).json({ success: false, message: 'Day, mealType, and food name are required' });
    }

    const normalizedPlanId = String(planId).trim().toLowerCase();
    const normalizedMealType = String(mealType).trim().toLowerCase() as 'breakfast' | 'lunch' | 'dinner';

    const itemObj = {
      planId: normalizedPlanId,
      day: Number(day),
      mealType: normalizedMealType,
      name: String(name).trim(),
      calories: calories ? String(calories).trim() : '400 kcal',
      description: description ? String(description).trim() : '',
      protein: protein ? String(protein).trim() : '20g',
      carbs: carbs ? String(carbs).trim() : '40g',
      fat: fat ? String(fat).trim() : '15g',
      benefits: Array.isArray(benefits) ? benefits : typeof benefits === 'string' ? benefits.split(',').map((b: string) => b.trim()).filter(Boolean) : [],
      image: image ? String(image).trim() : '',
      microNutrients: Array.isArray(microNutrients) ? microNutrients : [],
      ingredients: Array.isArray(ingredients) ? ingredients : []
    };

    const saved = await MenuItem.findOneAndUpdate(
      { planId: normalizedPlanId, day: Number(day), mealType: normalizedMealType },
      itemObj,
      { new: true, upsert: true }
    );

    return res.status(200).json({ success: true, data: saved });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateMenuItem = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { day, mealType } = req.params;
    const { planId = 'balance', ...updateData } = req.body;
    const normalizedPlanId = String(planId).trim().toLowerCase();
    const normalizedMealType = String(mealType).trim().toLowerCase();

    const updated = await MenuItem.findOneAndUpdate(
      { planId: normalizedPlanId, day: Number(day), mealType: normalizedMealType },
      { planId: normalizedPlanId, day: Number(day), mealType: normalizedMealType, ...updateData },
      { new: true, upsert: true }
    );

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteMenuItem = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { planId, day, mealType } = req.query;

    const normalizedPlanId = planId ? String(planId).trim().toLowerCase() : undefined;
    const normalizedMealType = mealType ? String(mealType).trim().toLowerCase() : undefined;

    if (id && id !== 'undefined' && mongoose.isValidObjectId(id)) {
      await MenuItem.findByIdAndDelete(id);
    } else if (normalizedPlanId && day && normalizedMealType) {
      await MenuItem.deleteOne({ planId: normalizedPlanId, day: Number(day), mealType: normalizedMealType });
    }

    return res.json({ success: true, message: 'Menu food item removed successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
