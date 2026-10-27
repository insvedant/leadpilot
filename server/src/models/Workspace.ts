import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A workspace is the billing and data boundary. Every lead and search belongs
 * to one. Today each user gets their own; later, teams and paid plans hang off this.
 */
const WorkspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    plan: { type: String, enum: ['free', 'pro', 'internal'], default: 'free' },
    // Shown in every email footer; the law in most countries requires a real business name and postal address
    sender: {
      companyName: { type: String, trim: true, maxlength: 120 },
      postalAddress: { type: String, trim: true, maxlength: 300 },
      website: { type: String, trim: true, maxlength: 200 },
    },
    // Reserved for the payments phase
    billing: {
      customerId: String,
      subscriptionId: String,
      status: String,
      currentPeriodEnd: Date,
    },
    usage: {
      periodStart: { type: Date, default: () => startOfMonth(new Date()) },
      searches: { type: Number, default: 0 },
      placesRequests: { type: Number, default: 0 },
      enrichments: { type: Number, default: 0 },
      emails: { type: Number, default: 0 },
      aiGenerations: { type: Number, default: 0 },
      verifications: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type WorkspaceAttrs = InferSchemaType<typeof WorkspaceSchema>;
export type WorkspaceDoc = HydratedDocument<WorkspaceAttrs>;
export const Workspace = model('Workspace', WorkspaceSchema);
