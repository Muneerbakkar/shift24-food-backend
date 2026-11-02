import mongoose, { Schema, Model } from 'mongoose';

export interface IActivityLog {
  actorEmail: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  entity: string;
  method: string;
  path: string;
  target?: string;
  statusCode?: number;
  ip?: string;
  createdAt?: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>({
  actorEmail: { type: String, default: 'guest', index: true },
  actorName: { type: String, default: '' },
  actorRole: { type: String, default: 'guest' },
  action: { type: String, required: true },
  entity: { type: String, default: 'system', index: true },
  method: { type: String, default: '' },
  path: { type: String, default: '' },
  target: { type: String, default: '' },
  statusCode: { type: Number, default: 0 },
  ip: { type: String, default: '' }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

ActivityLogSchema.index({ createdAt: -1 });

export const ActivityLog: Model<IActivityLog> =
  (mongoose.models.ActivityLog as Model<IActivityLog>) || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
