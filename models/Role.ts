import mongoose, { Schema, Model } from 'mongoose';

export interface IRole {
  roleId: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const RoleSchema = new Schema<IRole>({
  // Slug stored on the user's `role` field (e.g. "manager")
  roleId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  permissions: { type: [String], default: [] },
  isSystem: { type: Boolean, default: false }
}, {
  timestamps: true
});

export const Role: Model<IRole> =
  (mongoose.models.Role as Model<IRole>) || mongoose.model<IRole>('Role', RoleSchema);
