import mongoose, { Schema, Model } from 'mongoose';

export interface IDriver {
  driverId: string;
  name: string;
  phone: string;
  email?: string;
  password?: string;
  vehicleType: 'Motorcycle' | 'Scooter' | 'Car' | 'Van' | 'Bicycle';
  vehicleNumber: string;
  licenseNumber?: string;
  status: 'Available' | 'On Delivery' | 'Off Duty' | 'Inactive';
  currentZone?: string;
  notes?: string;
  avatar?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DriverSchema = new Schema<IDriver>({
  driverId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  password: { type: String, default: 'driver123' },
  vehicleType: { 
    type: String, 
    enum: ['Motorcycle', 'Scooter', 'Car', 'Van', 'Bicycle'], 
    default: 'Motorcycle' 
  },
  vehicleNumber: { type: String, required: true, trim: true },
  licenseNumber: { type: String, trim: true },
  status: { 
    type: String, 
    enum: ['Available', 'On Delivery', 'Off Duty', 'Inactive'], 
    default: 'Available' 
  },
  currentZone: { type: String, default: 'Kakkanad & Infopark' },
  notes: { type: String },
  avatar: { type: String }
}, {
  timestamps: true
});

export const Driver: Model<IDriver> = (mongoose.models.Driver as Model<IDriver>) || mongoose.model<IDriver>('Driver', DriverSchema);
