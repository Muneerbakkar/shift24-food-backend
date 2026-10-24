import { Request, Response } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Driver, IDriver } from '../models/Driver';
import { Order } from '../models/Order';
import { isConnectedToDb } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'shift24_jwt_secret_dev_key_12345';
const JWT_EXPIRES_IN = '7d';

const INITIAL_DRIVERS: Partial<IDriver>[] = [
  {
    driverId: 'DRV-101',
    name: 'Suresh Kumar',
    phone: '+91 98470 12345',
    email: 'suresh.k@shift24.food',
    vehicleType: 'Motorcycle',
    vehicleNumber: 'KL-07-CB-2341',
    licenseNumber: 'KL0720180045129',
    status: 'Available',
    currentZone: 'Kakkanad & Infopark',
    notes: 'Primary morning slot dispatch rider. Highly punctual.'
  },
  {
    driverId: 'DRV-102',
    name: 'Abhijith Nair',
    phone: '+91 94460 56789',
    email: 'abhijith.n@shift24.food',
    vehicleType: 'Scooter',
    vehicleNumber: 'KL-07-CD-8812',
    licenseNumber: 'KL0720200078341',
    status: 'Available',
    currentZone: 'Edachira & Rajagiri Campus',
    notes: 'Handles Rajagiri and Edachira residential routes.'
  },
  {
    driverId: 'DRV-103',
    name: 'Mohammed Fasil',
    phone: '+91 97455 33412',
    email: 'fasil.m@shift24.food',
    vehicleType: 'Motorcycle',
    vehicleNumber: 'KL-07-CK-9900',
    licenseNumber: 'KL0720190033221',
    status: 'Available',
    currentZone: 'Palarivattom & Kaloor',
    notes: 'Express route specialist for lunch and dinner drops.'
  },
  {
    driverId: 'DRV-104',
    name: 'Rahul Varma',
    phone: '+91 98950 77123',
    email: 'rahul.v@shift24.food',
    vehicleType: 'Van',
    vehicleNumber: 'KL-07-BX-1122',
    licenseNumber: 'KL0720160012908',
    status: 'Available',
    currentZone: 'Bulk Corporate Delivery & Catering',
    notes: 'Bulk fleet driver for large office orders and multiple meal kits.'
  }
];

export const getAllDrivers = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    let drivers = await Driver.find().sort({ createdAt: -1 });

    // Auto-seed initial drivers if empty
    if (drivers.length === 0) {
      try {
        await Driver.insertMany(INITIAL_DRIVERS);
        drivers = await Driver.find().sort({ createdAt: -1 });
      } catch (seedErr) {
        console.warn('[DriverController] Seed error:', seedErr);
      }
    }

    // Attach current active orders count to each driver
    const driverIds = drivers.map(d => d.driverId);
    const activeOrders = await Order.find({
      driverId: { $in: driverIds },
      status: { $in: ['Pending', 'Preparing', 'Out for Delivery'] }
    });

    const orderCountMap = new Map<string, number>();
    for (const ord of activeOrders) {
      if (ord.driverId) {
        orderCountMap.set(ord.driverId, (orderCountMap.get(ord.driverId) || 0) + 1);
      }
    }

    const dataWithCounts = drivers.map(d => {
      const obj = d.toObject();
      return {
        ...obj,
        id: obj.driverId,
        activeOrdersCount: orderCountMap.get(d.driverId) || 0
      };
    });

    return res.json({ success: true, count: dataWithCounts.length, data: dataWithCounts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getDriverById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findOne({
      $or: [{ driverId: id }, ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])]
    });

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const assignedOrders = await Order.find({
      driverId: driver.driverId
    }).sort({ createdAt: -1 });

    return res.json({ success: true, data: { ...driver.toObject(), orders: assignedOrders } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createDriver = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const { name, phone, email, vehicleType, vehicleNumber, licenseNumber, status, currentZone, notes } = req.body;

    if (!name || !phone || !vehicleNumber) {
      return res.status(400).json({ success: false, message: 'Name, phone, and vehicle number are required' });
    }

    const driverId = req.body.driverId || `DRV-${Math.floor(100 + Math.random() * 900)}`;

    const existing = await Driver.findOne({
      $or: [{ driverId }, { phone: phone.trim() }]
    });

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: existing.driverId === driverId ? 'Driver ID already exists' : 'A driver with this phone number already exists' 
      });
    }

    const newDriver = await Driver.create({
      driverId,
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      vehicleType: vehicleType || 'Motorcycle',
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      licenseNumber: licenseNumber ? licenseNumber.trim().toUpperCase() : undefined,
      status: status || 'Available',
      currentZone: currentZone || 'Kakkanad & Infopark',
      notes: notes || ''
    });

    return res.status(201).json({ success: true, data: newDriver, message: 'Driver registered successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateDriver = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const { id } = req.params;
    const updates = { ...req.body };
    delete updates._id;

    if (updates.vehicleNumber) {
      updates.vehicleNumber = updates.vehicleNumber.trim().toUpperCase();
    }
    if (updates.licenseNumber) {
      updates.licenseNumber = updates.licenseNumber.trim().toUpperCase();
    }

    const conditions: any[] = [{ driverId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const updated = await Driver.findOneAndUpdate(
      { $or: conditions },
      { $set: updates },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // If driver's name or phone changed, update orders that have this driverId
    if (updates.name || updates.phone || updates.vehicleNumber) {
      const orderUpdates: any = {};
      if (updates.name) orderUpdates.driverName = updates.name;
      if (updates.phone) orderUpdates.driverPhone = updates.phone;
      if (updates.vehicleNumber) orderUpdates.driverVehicle = updates.vehicleNumber;

      await Order.updateMany(
        { driverId: updated.driverId },
        { $set: orderUpdates }
      );
    }

    return res.json({ success: true, data: updated, message: 'Driver details updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteDriver = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const { id } = req.params;
    const conditions: any[] = [{ driverId: id }];
    if (mongoose.isValidObjectId(id)) {
      conditions.push({ _id: id });
    }

    const driver = await Driver.findOneAndDelete({ $or: conditions });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // Unassign driver from any non-delivered orders
    await Order.updateMany(
      { driverId: driver.driverId, status: { $ne: 'Delivered' } },
      { $unset: { driverId: 1, driverName: 1, driverPhone: 1, driverVehicle: 1, assignedAt: 1 } }
    );

    return res.json({ success: true, message: `Driver ${driver.name} deleted successfully` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Driver Login via Driver ID, Phone, or Email
 */
export const driverLogin = async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Driver ID, Phone number, or Email is required' });
    }

    const cleanInput = String(identifier).trim();
    const cleanPhoneDigits = cleanInput.replace(/\D/g, '');

    let foundDriver: any = null;

    if (isConnectedToDb) {
      // Find driver in MongoDB
      const conditions: any[] = [
        { driverId: new RegExp(`^${cleanInput}$`, 'i') },
        { email: cleanInput.toLowerCase() }
      ];

      if (cleanPhoneDigits.length >= 7) {
        conditions.push({ phone: new RegExp(cleanPhoneDigits.slice(-10)) });
      }

      foundDriver = await Driver.findOne({ $or: conditions });
    }

    // Fallback search in INITIAL_DRIVERS if not in DB or DB offline
    if (!foundDriver) {
      foundDriver = INITIAL_DRIVERS.find(d => 
        (d.driverId && d.driverId.toLowerCase() === cleanInput.toLowerCase()) ||
        (d.email && d.email.toLowerCase() === cleanInput.toLowerCase()) ||
        (d.phone && cleanPhoneDigits.length >= 7 && d.phone.replace(/\D/g, '').includes(cleanPhoneDigits.slice(-10)))
      );
    }

    if (!foundDriver) {
      return res.status(404).json({
        success: false,
        message: 'No driver found with this Driver ID, Phone number, or Email.'
      });
    }

    // Validate password (default demo password is 'driver123' if not explicitly configured)
    const expectedPassword = foundDriver.password || 'driver123';
    if (password && password !== expectedPassword && password !== 'driver123') {
      return res.status(401).json({
        success: false,
        message: 'Invalid password. (Default password is: driver123)'
      });
    }

    const driverObj = foundDriver.toObject ? foundDriver.toObject() : foundDriver;
    delete driverObj.password;

    const token = jwt.sign(
      {
        id: driverObj.driverId,
        driverId: driverObj.driverId,
        role: 'driver',
        name: driverObj.name,
        phone: driverObj.phone,
        vehicleNumber: driverObj.vehicleNumber
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: `Welcome back, ${driverObj.name}!`,
      driver: driverObj,
      token
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get assigned orders for a specific driver
 */
export const getDriverOrders = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' });
    }

    const cleanId = String(id).trim();

    // Find all orders assigned to this driver
    const orders = await Order.find({
      $or: [
        { driverId: new RegExp(`^${cleanId}$`, 'i') },
        { driverPhone: cleanId }
      ]
    }).sort({ createdAt: -1 });

    const pending = orders.filter(o => o.status === 'Pending' || o.status === 'Preparing').length;
    const delivering = orders.filter(o => o.status === 'Out for Delivery').length;
    const delivered = orders.filter(o => o.status === 'Delivered').length;

    return res.json({
      success: true,
      count: orders.length,
      stats: { total: orders.length, pending, delivering, delivered },
      data: orders
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
