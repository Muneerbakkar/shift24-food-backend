import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IDevicePushSubscription extends Document {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  role: 'customer' | 'admin' | 'driver';
  email?: string;
  userId?: string;
  name?: string;
  device?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DevicePushSubscriptionSchema = new Schema<IDevicePushSubscription>(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    },
    role: { 
      type: String, 
      enum: ['customer', 'admin', 'driver'], 
      required: true,
      index: true 
    },
    email: { type: String, default: '', index: true, lowercase: true, trim: true },
    userId: { type: String, default: '' },
    name: { type: String, default: '' },
    device: { type: String, default: 'Mobile Device' }
  },
  { timestamps: true }
);

DevicePushSubscriptionSchema.index({ role: 1, email: 1 });

export const DevicePushSubscription: Model<IDevicePushSubscription> =
  mongoose.models.DevicePushSubscription ||
  mongoose.model<IDevicePushSubscription>('DevicePushSubscription', DevicePushSubscriptionSchema);
