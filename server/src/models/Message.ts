import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * pending     waiting for Claude to write the personal line
 * generating  Claude is writing it
 * draft       ready for you to review
 * approved    you approved it; the scheduler will send it in the sending window
 * sending     being sent right now
 * sent        delivered to the mail server
 * failed      the mail server refused it (see error)
 * skipped     you chose not to send it
 * cancelled   stopped automatically (reply, bounce, unsubscribe, do-not-contact)
 */
export const MESSAGE_STATUSES = [
  'pending',
  'generating',
  'draft',
  'approved',
  'sending',
  'sent',
  'failed',
  'skipped',
  'cancelled',
] as const;

const MessageSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    mailboxId: { type: Schema.Types.ObjectId, ref: 'Mailbox' },
    step: { type: Number, default: 0 },
    toEmail: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    aiLine: { type: String, default: '' },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'draft' },
    error: String,
    scheduledAt: Date,
    sentAt: Date,
    messageIdHeader: String,
    repliedAt: Date,
    replyFrom: String,
    bouncedAt: Date,
  },
  { timestamps: true },
);

MessageSchema.index({ campaignId: 1, leadId: 1, step: 1 }, { unique: true });
MessageSchema.index({ campaignId: 1, status: 1, createdAt: 1 });
MessageSchema.index({ mailboxId: 1, status: 1, scheduledAt: 1 });
MessageSchema.index({ mailboxId: 1, sentAt: -1 });
MessageSchema.index({ workspaceId: 1, toEmail: 1 });

export type MessageAttrs = InferSchemaType<typeof MessageSchema>;
export type MessageDoc = HydratedDocument<MessageAttrs>;
export const Message = model('Message', MessageSchema);
