import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { isConnectedToDb } from '../config/db';
import { ADMIN_PERMISSION_KEYS } from './authController';

/**
 * Role templates: a named set of admin-panel sections. A user's `role` stores
 * the roleId; their `permissions` mirror the role (and can be tweaked per user).
 */

const RESERVED_ROLE_IDS = ['customer', 'driver'];

const sanitizePermissions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(v => String(v).trim().toLowerCase())))
    .filter(p => ADMIN_PERMISSION_KEYS.includes(p));
};

const slugify = (value: string): string =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const DEFAULT_ROLES = [
  {
    roleId: 'admin',
    name: 'Super Administrator',
    description: 'Full access to every section, including team and settings.',
    permissions: ADMIN_PERMISSION_KEYS,
    isSystem: true
  },
  {
    roleId: 'manager',
    name: 'Operations Manager',
    description: 'Runs day-to-day operations; no team management, roles or settings.',
    permissions: ADMIN_PERMISSION_KEYS.filter(k => !['users', 'settings', 'roles'].includes(k)),
    isSystem: false
  },
  {
    roleId: 'staff',
    name: 'Staff Administrator',
    description: 'Orders, customers, menu and kitchen work.',
    permissions: ['dashboard', 'orders', 'subscriptions', 'customers', 'menu', 'kitchen'],
    isSystem: false
  },
  {
    roleId: 'kitchen',
    name: 'Kitchen Manager',
    description: 'Kitchen board, orders and ingredient purchases.',
    permissions: ['dashboard', 'kitchen', 'orders', 'menu', 'purchases'],
    isSystem: false
  }
];

async function ensureDefaultRoles() {
  const count = await Role.countDocuments({});
  if (count > 0) return;
  await Role.insertMany(DEFAULT_ROLES.map(r => ({ ...r, permissions: sanitizePermissions(r.permissions) })));
  console.log('[Roles] Seeded default role templates');
}

export const getRoles = async (_req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline', data: [] });
    }
    await ensureDefaultRoles();

    const roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean();
    const counts = await User.aggregate([
      { $match: { role: { $ne: 'customer' } } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((c: any) => [c._id, c.count]));

    return res.json({
      success: true,
      data: roles.map(r => ({ ...r, userCount: countMap.get(r.roleId) || 0 }))
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message, data: [] });
  }
};

export const createRole = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }

    const { name, description, permissions } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required' });
    }

    const roleId = slugify(String(name));
    if (!roleId) {
      return res.status(400).json({ success: false, message: 'Role name must contain letters or numbers' });
    }
    if (RESERVED_ROLE_IDS.includes(roleId)) {
      return res.status(400).json({ success: false, message: `"${roleId}" is reserved` });
    }

    const existing = await Role.findOne({ roleId });
    if (existing) {
      return res.status(400).json({ success: false, message: `A role named "${existing.name}" already exists` });
    }

    const role = await Role.create({
      roleId,
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
      permissions: sanitizePermissions(permissions),
      isSystem: false
    });

    return res.status(201).json({
      success: true,
      message: `Role "${role.name}" created`,
      data: { ...role.toObject(), userCount: 0 }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }

    const { id } = req.params;
    const { name, description, permissions } = req.body;

    const query: Record<string, any> = mongoose.isValidObjectId(id)
      ? { $or: [{ roleId: id }, { _id: id }] }
      : { roleId: String(id).trim().toLowerCase() };

    const role = await Role.findOne(query);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    if (name !== undefined && String(name).trim()) {
      if (role.isSystem) {
        return res.status(400).json({ success: false, message: 'The built-in Admin role cannot be renamed' });
      }
      role.name = String(name).trim();
    }
    if (description !== undefined) role.description = String(description).trim();
    if (permissions !== undefined) role.permissions = sanitizePermissions(permissions);

    await role.save();

    // Keep users on this role in sync with its permissions.
    let updatedUsers = 0;
    if (permissions !== undefined) {
      const result = await User.updateMany({ role: role.roleId }, { $set: { permissions: role.permissions } });
      updatedUsers = result.modifiedCount || 0;
    }

    return res.json({
      success: true,
      message: `Role "${role.name}" updated${updatedUsers ? ` — applied to ${updatedUsers} user(s)` : ''}`,
      data: role,
      updatedUsers
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }

    const { id } = req.params;
    const query: Record<string, any> = mongoose.isValidObjectId(id)
      ? { $or: [{ roleId: id }, { _id: id }] }
      : { roleId: String(id).trim().toLowerCase() };

    const role = await Role.findOne(query);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    if (role.isSystem) {
      return res.status(400).json({ success: false, message: 'The built-in Admin role cannot be deleted' });
    }

    const inUse = await User.countDocuments({ role: role.roleId });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `${inUse} user${inUse === 1 ? ' still has' : 's still have'} the "${role.name}" role. Reassign them first.`
      });
    }

    await Role.deleteOne({ _id: role._id });
    return res.json({ success: true, message: `Role "${role.name}" deleted` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
