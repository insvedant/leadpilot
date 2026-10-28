import { Schema, model } from 'mongoose';

/** Addresses that must never be emailed again from this workspace. Checked right before every send. */
const SuppressionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    reason: { type: String, enum: ['unsubscribed', 'bounced', 'manual', 'complaint'], default: 'manual' },
    note: String,
  },
  { timestamps: true },
);

SuppressionSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

export const Suppression = model('Suppression', SuppressionSchema);
