import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IKitchenSettings {
  kitchenName: string;
  address: string;
  email: string;
  phone: string;
  latitude: number;
  longitude: number;
  operatingHours?: string;
  deliveryRadiusKm?: number;
}

export interface ISettingsDocument extends Document {
  key: string;
  kitchen: IKitchenSettings;
  createdAt: Date;
  updatedAt: Date;
}

const KitchenSettingsSchema = new Schema<IKitchenSettings>(
  {
    kitchenName: { type: String, default: 'Shift24 Cloud Kitchen' },
    address: { type: String, default: 'Infopark Expressway, Kakkanad, Kochi, Kerala 682042' },
    email: { type: String, default: 'kitchen@shift24.food' },
    phone: { type: String, default: '+91 98470 12345' },
    latitude: { type: Number, default: 10.01586 },
    longitude: { type: Number, default: 76.36306 },
    operatingHours: { type: String, default: '06:00 AM - 10:30 PM' },
    deliveryRadiusKm: { type: Number, default: 25 }
  },
  { _id: false }
);

const SettingsSchema = new Schema<ISettingsDocument>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    kitchen: { type: KitchenSettingsSchema, default: () => ({}) }
  },
  { timestamps: true }
);

export const Settings: Model<ISettingsDocument> = 
  (mongoose.models.Settings as Model<ISettingsDocument>) || 
  mongoose.model<ISettingsDocument>('Settings', SettingsSchema);

export default Settings;
