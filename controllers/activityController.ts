import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ActivityLog } from '../models/ActivityLog';
import { isConnectedToDb } from '../config/db';

/** Date helpers: accept "2026-11-02" or a full ISO timestamp. */
function parseBoundary(value: unknown, endOfDay: boolean): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.includes('T')) {
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function buildFilter(query: any) {
  const filter: Record<string, any> = {};

  const from = parseBoundary(query.from, false);
  const to = parseBoundary(query.to, true);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  if (query.entity && query.entity !== 'all') filter.entity = String(query.entity);
  if (query.actor) {
    const rx = new RegExp(String(query.actor).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ actorEmail: rx }, { actorName: rx }];
  }
  if (query.q) {
    const rx = new RegExp(String(query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [
      { $or: [{ action: rx }, { target: rx }, { path: rx }, { actorEmail: rx }, { actorName: rx }] }
    ];
  }

  return filter;
}

export const getActivityLogs = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline', data: [] });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const filter = buildFilter(req.query);

    const [entries, total] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ActivityLog.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: entries,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit
    });
  } catch (error: any) {
    console.error('[Activity] List error:', error);
    return res.status(500).json({ success: false, message: error.message, data: [] });
  }
};

export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.json({ success: true, data: [] });
    }
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 8));
    const entries = await ActivityLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, data: entries });
  } catch (error: any) {
    return res.json({ success: false, message: error.message, data: [] });
  }
};

export const deleteActivityLog = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid activity id' });
    }
    const deleted = await ActivityLog.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Activity entry not found' });
    }
    return res.json({ success: true, message: 'Activity entry deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** DELETE /api/activity?from=YYYY-MM-DD&to=YYYY-MM-DD — clears a date range. */
export const purgeActivityLogs = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }
    if (!req.query.from && !req.query.to && (!req.query.entity || req.query.entity === 'all')) {
      return res.status(400).json({
        success: false,
        message: 'Choose a date range or a section before deleting — the whole log cannot be wiped in one click'
      });
    }

    const filter = buildFilter(req.query);
    const result = await ActivityLog.deleteMany(filter);
    return res.json({
      success: true,
      message: `${result.deletedCount} activity ${result.deletedCount === 1 ? 'entry' : 'entries'} deleted`,
      deletedCount: result.deletedCount
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
