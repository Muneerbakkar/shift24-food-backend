import mongoose, { Schema, Model, Document } from 'mongoose';

export interface INotification extends Document {
  notificationId: string;
  role: 'customer' | 'admin' | 'driver' | 'all';
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  driverId?: string;
  driverName?: string;
  subscriptionId?: string;
  orderId?: string;
  title: string;
  message: string;
  type: 'order' | 'delivery' | 'kitchen' | 'dispatch' | 'system' | 'driver' | 'success' | 'alert' | 'calendar' | 'promo';
  status?: string;
  unread: boolean;
  isDeleted: boolean;
  link?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    notificationId: { type: String, required: true, unique: true },
    role: { 
      type: String, 
      enum: ['customer', 'admin', 'driver', 'all'], 
      default: 'customer',
      index: true 
    },
    customerEmail: { type: String, default: '', index: true, lowercase: true, trim: true },
    customerPhone: { type: String, default: '' },
    customerName: { type: String, default: '' },
    driverId: { type: String, default: '', index: true },
    driverName: { type: String, default: '' },
    subscriptionId: { type: String, default: '' },
    orderId: { type: String, default: '' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['order', 'delivery', 'kitchen', 'dispatch', 'system', 'driver', 'success', 'alert', 'calendar', 'promo'], 
      default: 'order' 
    },
    status: { type: String, default: '' },
    unread: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    link: { type: String, default: '/profile' }
  },
  { timestamps: true }
);

NotificationSchema.index({ role: 1, isDeleted: 1, createdAt: -1 });
NotificationSchema.index({ customerEmail: 1, isDeleted: 1, createdAt: -1 });
NotificationSchema.index({ driverId: 1, isDeleted: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
