import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const ServerSchema = new Schema(
  {
    host: { type: String, trim: true },
    port: Number,
    secure: Boolean,
    user: { type: String, trim: true },
    passEnc: String, // AES-256-GCM, see lib/crypto
  },
  { _id: false },
);

/** A sending inbox connected over SMTP (sending) and IMAP (reply and bounce detection). */
const MailboxSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    provider: { type: String, enum: ['gmail', 'zoho', 'zoho_in', 'outlook', 'custom'], default: 'custom' },
    fromName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    smtp: { type: ServerSchema, required: true },
    imap: ServerSchema,
    dailyLimit: { type: Number, default: 30, min: 1, max: 200 },
    status: { type: String, enum: ['active', 'paused', 'error'], default: 'active' },
    lastError: String,
    lastSentAt: Date,
    nextAllowedAt: Date,
    imapLastUid: Number,
    imapCheckedAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        const strip = (s?: Record<string, unknown>) => {
          if (s) {
            s.hasPassword = Boolean(s.passEnc);
            delete s.passEnc;
          }
        };
        strip(ret.smtp as Record<string, unknown>);
        strip(ret.imap as Record<string, unknown>);
        return ret;
      },
    },
  },
);

MailboxSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

export type MailboxAttrs = InferSchemaType<typeof MailboxSchema>;
export type MailboxDoc = HydratedDocument<MailboxAttrs>;
export const Mailbox = model('Mailbox', MailboxSchema);
