import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const StepSchema = new Schema(
  {
    delayDays: { type: Number, default: 0, min: 0, max: 60 },
    subject: { type: String, trim: true, maxlength: 200, default: '' },
    body: { type: String, required: true, maxlength: 5000 },
  },
  { _id: false },
);

const CampaignSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
    pausedReason: String,
    mailboxIds: [{ type: Schema.Types.ObjectId, ref: 'Mailbox' }],
    // steps[0] is the first email; later steps are follow-ups sent in the same thread
    steps: { type: [StepSchema], default: [] },
    ai: {
      enabled: { type: Boolean, default: true },
      instructions: { type: String, maxlength: 2000, default: '' },
      useWebsite: { type: Boolean, default: true },
    },
    schedule: {
      timezone: { type: String, default: 'UTC' },
      days: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0 = Sunday
      startHour: { type: Number, default: 9, min: 0, max: 23 },
      endHour: { type: Number, default: 17, min: 1, max: 24 },
      minGapSec: { type: Number, default: 180, min: 60 },
      maxGapSec: { type: Number, default: 420, min: 60 },
    },
    requireVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type CampaignAttrs = InferSchemaType<typeof CampaignSchema>;
export type CampaignDoc = HydratedDocument<CampaignAttrs>;
export const Campaign = model('Campaign', CampaignSchema);
