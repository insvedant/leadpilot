import { Schema, model } from 'mongoose';

export const ACTIVITY_TYPES = [
  'auth.register',
  'auth.login',
  'search.run',
  'leads.saved',
  'leads.enrich',
  'leads.verify',
  'leads.export',
  'leads.delete',
  'campaign.created',
  'campaign.leads_added',
  'campaign.started',
  'campaign.paused',
  'campaign.auto_paused',
  'email.sent',
  'email.replied',
  'email.bounced',
  'admin.approved',
  'admin.rejected',
  'admin.suspended',
  'admin.reactivated',
  'admin.plan_changed',
  'admin.bounce_override',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** What each user did and when. Kept for 180 days, then removed automatically. */
const ActivitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace' },
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  summary: { type: String, required: true, maxlength: 500 },
  meta: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 },
});

ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ workspaceId: 1, createdAt: -1 });
ActivitySchema.index({ type: 1, createdAt: -1 });

export const Activity = model('Activity', ActivitySchema);
