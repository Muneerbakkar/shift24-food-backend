import mongoose, { Schema, Model, Document } from 'mongoose';

export interface INotification extends Document {
  notificationId: string;
  customerEmail: string;
  customerPhone?: string;
  customerName?: string;
  subscriptionId?: string;
  orderId?: string;
  title: string;
  message: string;
  type: 'order' | 'delivery' | 'kitchen' | 'success' | 'alert' | 'calendar' | 'promo';
  unread: boolean;
  isDeleted: boolean;
  link?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    notificationId: { type: String, required: true, unique: true },
    customerEmail: { type: String, required: true, index: true, lowercase: true, trim: true },
    customerPhone: { type: String, default: '' },
    customerName: { type: String, default: '' },
    subscriptionId: { type: String, default: '' },
    orderId: { type: String, default: '' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['order', 'delivery', 'kitchen', 'success', 'alert', 'calendar', 'promo'], 
      default: 'order' 
    },
    unread: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    link: { type: String, default: '/profile' }
  },
  { timestamps: true }
);

NotificationSchema.index({ customerEmail: 1, isDeleted: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
