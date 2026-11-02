import mongoose, { Schema, Model } from 'mongoose';

export interface IOtpCode {
  identifier: string;
  channel: 'sms' | 'email';
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const OtpCodeSchema = new Schema<IOtpCode>({
  // Normalised phone digits (e.g. "9876543210") or a lower-cased email
  identifier: { type: String, required: true, index: true },
  channel: { type: String, enum: ['sms', 'email'], default: 'sms' },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Mongo drops the document automatically once the code has expired.
OtpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCode: Model<IOtpCode> =
  (mongoose.models.OtpCode as Model<IOtpCode>) || mongoose.model<IOtpCode>('OtpCode', OtpCodeSchema);
