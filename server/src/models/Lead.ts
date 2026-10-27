import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const LEAD_STATUSES = ['new', 'contacted', 'replied', 'won', 'lost', 'do_not_contact'] as const;
export const ENRICH_STATUSES = ['idle', 'queued', 'running', 'done', 'failed', 'skipped'] as const;

const LeadSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    placeId: { type: String, required: true },

    // From Google Places (refresh after 30 days, see placesFetchedAt)
    name: { type: String, required: true },
    address: String,
    phone: String,
    intlPhone: String,
    website: String,
    rating: Number,
    reviewCount: Number,
    category: String,
    primaryType: String,
    types: [String],
    businessStatus: String,
    mapsUrl: String,
    location: { lat: Number, lng: Number },
    priceLevel: String,
    placesFetchedAt: Date,

    // Where the lead came from
    context: {
      businessType: String,
      country: String,
      countryCode: String,
      state: String,
      city: String,
      locality: String,
    },

    // From scanning the business's own website
    emails: { type: [String], default: [] },
    // Results from the email verification service, one per address checked
    emailChecks: {
      type: [
        new Schema(
          {
            email: String,
            result: { type: String, enum: ['ok', 'catch_all', 'unknown', 'invalid', 'disposable', 'error'] },
            at: Date,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    socials: {
      facebook: String,
      instagram: String,
      linkedin: String,
      twitter: String,
      youtube: String,
      tiktok: String,
      whatsapp: String,
    },
    enrich: {
      status: { type: String, enum: ENRICH_STATUSES, default: 'idle' },
      error: String,
      pagesScanned: Number,
      at: Date,
    },

    // Pipeline
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    notes: { type: String, maxlength: 4000 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

LeadSchema.index({ workspaceId: 1, placeId: 1 }, { unique: true });
LeadSchema.index({ workspaceId: 1, createdAt: -1 });
LeadSchema.index({ workspaceId: 1, status: 1 });
LeadSchema.index({ 'enrich.status': 1 });
LeadSchema.index({ workspaceId: 1, emails: 1 });

export type LeadAttrs = InferSchemaType<typeof LeadSchema>;
export type LeadDoc = HydratedDocument<LeadAttrs>;
export const Lead = model('Lead', LeadSchema);
