import { Types } from 'mongoose';
import { Lead } from '../models/Lead';
import { Message } from '../models/Message';
import { Suppression } from '../models/Suppression';

const PENDING = ['pending', 'generating', 'draft', 'approved'];

/** Adds an address to the do-not-contact list and stops anything still queued to it. */
export async function suppressEmail(
  workspaceId: string | Types.ObjectId,
  email: string,
  reason: 'unsubscribed' | 'bounced' | 'manual' | 'complaint',
  note?: string,
): Promise<void> {
  const address = email.trim().toLowerCase();
  await Suppression.updateOne(
    { workspaceId, email: address },
    { $setOnInsert: { workspaceId, email: address, reason, note } },
    { upsert: true },
  );
  await Message.updateMany(
    { workspaceId, toEmail: address, status: { $in: PENDING } },
    { $set: { status: 'cancelled', error: `Stopped: address ${reason === 'manual' ? 'added to do-not-contact' : reason}` } },
  );
  if (reason === 'unsubscribed' || reason === 'complaint') {
    await Lead.updateMany({ workspaceId, emails: address }, { $set: { status: 'do_not_contact' } });
  }
}

/** Stops the rest of a lead's sequence in one campaign (after a reply or bounce). */
export async function stopSequence(campaignId: Types.ObjectId, leadId: Types.ObjectId, why: string): Promise<void> {
  await Message.updateMany(
    { campaignId, leadId, status: { $in: PENDING } },
    { $set: { status: 'cancelled', error: why } },
  );
}
