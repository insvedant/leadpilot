import { Schema, model, type InferSchemaType } from 'mongoose';

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    role: { type: String, enum: ['owner', 'member'], default: 'owner' },
    // New sign-ups wait for a platform admin. Accounts created before approval existed are migrated to active on boot.
    status: { type: String, enum: ['pending', 'active', 'suspended', 'rejected'], default: 'pending', index: true },
    statusReason: { type: String, maxlength: 300 },
    statusChangedAt: Date,
    approvedAt: Date,
    lastSeenAt: { type: Date, index: true },
    lastLoginAt: Date,
    resetTokenHash: { type: String, index: true },
    resetTokenExpires: Date,
  },
  { timestamps: true },
);

export type UserAttrs = InferSchemaType<typeof UserSchema>;
export const User = model('User', UserSchema);
