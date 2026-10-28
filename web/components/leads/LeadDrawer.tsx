'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Globe, Mail, MapPin, Phone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { LEAD_STATUS_LABELS } from '@/lib/constants';
import { domainOf } from '@/lib/format';
import type { Lead, LeadStatus } from '@/lib/types';
import { Button, Rating, Select } from '../ui';
import { EnrichBadge } from './EnrichBadge';
import { EmailCheck } from '../outreach/MessageCard';

const SOCIAL_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
};

export function LeadDrawer({ lead, onClose, onChanged }: { lead: Lead | null; onClose: () => void; onChanged: (lead: Lead) => void }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(lead?.notes ?? '');
  }, [lead?._id, lead?.notes]);

  useEffect(() => {
    if (!lead) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lead, onClose]);

  const patch = async (body: Partial<Pick<Lead, 'status' | 'notes'>>, message: string) => {
    if (!lead) return;
    setSaving(true);
    try {
      const updated = await api<Lead>(`/leads/${lead._id}`, { method: 'PATCH', body });
      onChanged(updated);
      toast.success(message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const socials = Object.entries(lead?.socials ?? {}).filter(([, url]) => url);
  const place = [lead?.context?.locality, lead?.context?.city, lead?.context?.state].filter(Boolean).join(', ');

  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-deep/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={lead.name}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-ink pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-lift"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line p-6">
              <div className="min-w-0">
                <h2 className="font-display text-3xl leading-tight text-ivory">{lead.name}</h2>
                <p className="mt-1 text-sm text-muted">{[lead.category, place].filter(Boolean).join(' in ')}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <Rating rating={lead.rating} count={lead.reviewCount} />
                  <EnrichBadge status={lead.enrich?.status} error={lead.enrich?.error} emailCount={lead.emails.length} />
                </div>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ivory" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-7 overflow-y-auto p-6">
              <section className="space-y-3 text-sm">
                {lead.emails.length > 0 ? (
                  lead.emails.map((e) => (
                    <div key={e} className="flex flex-wrap items-center gap-3">
                      <a href={`mailto:${e}`} className="flex items-center gap-3 text-ivory hover:text-brass-strong">
                        <Mail className="h-4 w-4 text-muted" /> {e}
                      </a>
                      <EmailCheck result={lead.emailChecks?.find((c) => c.email === e)?.result} />
                    </div>
                  ))
                ) : (
                  <p className="flex items-center gap-3 text-muted">
                    <Mail className="h-4 w-4" /> {lead.enrich?.status === 'failed' ? lead.enrich.error : 'No email found yet'}
                  </p>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.intlPhone ?? lead.phone}`} className="flex items-center gap-3 tabular-nums text-ivory hover:text-brass-strong">
                    <Phone className="h-4 w-4 text-muted" /> {lead.phone}
                  </a>
                )}
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sky hover:underline">
                    <Globe className="h-4 w-4 text-muted" /> {domainOf(lead.website)}
                  </a>
                )}
                {lead.address && (
                  <p className="flex gap-3 text-muted">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {lead.address}
                  </p>
                )}
                {lead.mapsUrl && (
                  <a href={lead.mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-muted hover:text-ivory">
                    <ExternalLink className="h-4 w-4" /> Open in Google Maps
                  </a>
                )}
              </section>

              {socials.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-medium text-muted">Social profiles</h3>
                  <div className="flex flex-wrap gap-2">
                    {socials.map(([name, url]) => (
                      <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-3 py-1 text-xs text-ivory hover:border-brass/60">
                        {SOCIAL_LABELS[name] ?? name}
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <label className="mb-2 block text-xs font-medium text-muted" htmlFor="lead-status">
                  Lead status
                </label>
                <Select
                  id="lead-status"
                  value={lead.status}
                  disabled={saving}
                  onChange={(e) => patch({ status: e.target.value as LeadStatus }, 'Status updated.')}
                >
                  {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </section>

              <section>
                <label className="mb-2 block text-xs font-medium text-muted" htmlFor="lead-notes">
                  Notes
                </label>
                <textarea
                  id="lead-notes"
                  rows={5}
                  maxLength={4000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Who you spoke to, what they need, when to follow up"
                  className="w-full rounded-lg border border-line bg-surface/50 p-3 text-base text-ivory md:text-sm outline-none placeholder:text-muted/70 focus:border-brass"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  loading={saving}
                  disabled={notes === (lead.notes ?? '')}
                  onClick={() => patch({ notes }, 'Notes saved.')}
                >
                  Save notes
                </Button>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
