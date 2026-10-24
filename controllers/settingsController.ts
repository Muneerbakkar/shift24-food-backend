import { Request, Response } from 'express';
import { Settings, IKitchenSettings } from '../models/Settings';
import { isConnectedToDb } from '../config/db';

const DEFAULT_KITCHEN_SETTINGS: IKitchenSettings = {
  kitchenName: 'Shift24 Cloud Kitchen',
  address: 'Infopark Expressway, Kakkanad, Kochi, Kerala 682042',
  email: 'kitchen@shift24.food',
  phone: '+91 98470 12345',
  latitude: 10.01586,
  longitude: 76.36306,
  operatingHours: '06:00 AM - 10:30 PM',
  deliveryRadiusKm: 25
};

// In-memory fallback if DB is disconnected
let inMemoryKitchenSettings: IKitchenSettings = { ...DEFAULT_KITCHEN_SETTINGS };

/**
 * GET /api/settings/kitchen (or /api/settings)
 * Returns the current cloud kitchen location and contact settings
 */
export const getKitchenSettings = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.json({
        success: true,
        data: inMemoryKitchenSettings,
        source: 'memory'
      });
    }

    let doc = await Settings.findOne({ key: 'global' });
    if (!doc) {
      doc = await Settings.create({
        key: 'global',
        kitchen: DEFAULT_KITCHEN_SETTINGS
      });
    }

    return res.json({
      success: true,
      data: doc.kitchen || DEFAULT_KITCHEN_SETTINGS,
      source: 'database'
    });
  } catch (error: any) {
    console.warn('[Settings] Failed to fetch settings, returning fallback:', error.message);
    return res.json({
      success: true,
      data: inMemoryKitchenSettings,
      source: 'fallback'
    });
  }
};

/**
 * PUT/POST /api/settings/kitchen (or /api/settings)
 * Updates the cloud kitchen location and contact settings
 */
export const updateKitchenSettings = async (req: Request, res: Response) => {
  try {
    const {
      kitchenName,
      address,
      email,
      phone,
      latitude,
      longitude,
      operatingHours,
      deliveryRadiusKm
    } = req.body;

    const parsedLat = typeof latitude === 'number' ? latitude : parseFloat(latitude);
    const parsedLng = typeof longitude === 'number' ? longitude : parseFloat(longitude);

    const updatedKitchen: IKitchenSettings = {
      kitchenName: (kitchenName || inMemoryKitchenSettings.kitchenName || DEFAULT_KITCHEN_SETTINGS.kitchenName).trim(),
      address: (address || inMemoryKitchenSettings.address || DEFAULT_KITCHEN_SETTINGS.address).trim(),
      email: (email || inMemoryKitchenSettings.email || DEFAULT_KITCHEN_SETTINGS.email).trim(),
      phone: (phone || inMemoryKitchenSettings.phone || DEFAULT_KITCHEN_SETTINGS.phone).trim(),
      latitude: !isNaN(parsedLat) ? parsedLat : inMemoryKitchenSettings.latitude,
      longitude: !isNaN(parsedLng) ? parsedLng : inMemoryKitchenSettings.longitude,
      operatingHours: operatingHours || inMemoryKitchenSettings.operatingHours,
      deliveryRadiusKm: !isNaN(Number(deliveryRadiusKm)) ? Number(deliveryRadiusKm) : inMemoryKitchenSettings.deliveryRadiusKm
    };

    inMemoryKitchenSettings = { ...updatedKitchen };

    if (!isConnectedToDb) {
      return res.json({
        success: true,
        data: inMemoryKitchenSettings,
        message: 'Kitchen location settings updated (local mode)',
        source: 'memory'
      });
    }

    const doc = await Settings.findOneAndUpdate(
      { key: 'global' },
      { $set: { kitchen: updatedKitchen } },
      { new: true, upsert: true }
    );

    return res.json({
      success: true,
      data: doc.kitchen,
      message: 'Cloud kitchen location settings saved successfully!',
      source: 'database'
    });
  } catch (error: any) {
    console.error('[Settings] Error updating settings:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update kitchen settings'
    });
  }
};
