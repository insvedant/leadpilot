'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { renderTemplate, SAMPLE_VARS, VARIABLES } from '@/lib/template';
import type { Campaign, CampaignStep } from '@/lib/types';
import { Button, Field, Input, Switch } from '../ui';
import { stepLabel } from './labels';

type FieldRef = { step: number; field: 'subject' | 'body' };

export function EmailsTab({
  campaign,
  aiAvailable,
  sender,
  onSaved,
}: {
  campaign: Campaign;
  aiAvailable: boolean;
  sender: { companyName?: string; postalAddress?: string };
  onSaved: (c: Campaign) => void;
}) {
  const [steps, setSteps] = useState<CampaignStep[]>(campaign.steps);
  const [ai, setAi] = useState(campaign.ai);
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState<FieldRef>({ step: 0, field: 'body' });
  const refs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  const updateStep = (i: number, patch: Partial<CampaignStep>) => setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));

  const insertVar = (key: string) => {
    const token = `{{${key}}}`;
    const el = refs.current[`${focus.step}-${focus.field}`];
    const current = steps[focus.step]?.[focus.field] ?? '';
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    updateStep(focus.step, { [focus.field]: current.slice(0, start) + token + current.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api<{ campaign: Campaign; rerendered: number }>(`/campaigns/${campaign._id}`, {
        method: 'PATCH',
        body: { steps, ai },
      });
      onSaved(res.campaign);
      toast.success(res.rerendered ? `Saved. Updated ${res.rerendered} drafts to match.` : 'Saved.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const preview = steps[0]
    ? {
        subject: renderTemplate(steps[0].subject, { ...SAMPLE_VARS, sender_name: 'Your name', sender_company: sender.companyName || 'Your company' }),
        body: renderTemplate(steps[0].body, {
          ...SAMPLE_VARS,
          ai_line: ai.enabled ? SAMPLE_VARS.ai_line : '',
          sender_name: 'Your name',
          sender_company: sender.companyName || 'Your company',
        }),
      }
    : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <div className="sticky top-14 z-10 -mx-4 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-xl md:border md:px-4">
          <p className="mb-2 text-xs text-muted">Insert into the field you last clicked</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertVar(v.key)}
                className="h-7 rounded-md border border-line px-2 text-xs text-muted transition-colors hover:border-brass/60 hover:text-ivory"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {steps.map((step, i) => (
          <section key={i} className="rounded-2xl border border-line bg-surface/40 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-display text-2xl text-ivory">{stepLabel(i)}</h3>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-coral"
                  aria-label={`Remove ${stepLabel(i)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="space-y-4">
              {i > 0 && (
                <Field label="Send if there's no reply after this many days">
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={step.delayDays}
                    onChange={(e) => updateStep(i, { delayDays: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-28"
                  />
                </Field>
              )}
              <Field label={i === 0 ? 'Subject' : 'Subject (leave empty to reply in the same thread)'}>
                <Input
                  ref={(el) => {
                    refs.current[`${i}-subject`] = el;
                  }}
                  value={step.subject}
                  maxLength={200}
                  onFocus={() => setFocus({ step: i, field: 'subject' })}
                  onChange={(e) => updateStep(i, { subject: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <textarea
                  ref={(el) => {
                    refs.current[`${i}-body`] = el;
                  }}
                  value={step.body}
                  maxLength={5000}
                  rows={i === 0 ? 14 : 7}
                  onFocus={() => setFocus({ step: i, field: 'body' })}
                  onChange={(e) => updateStep(i, { body: e.target.value })}
                  className="w-full rounded-lg border border-line bg-ink p-4 text-base leading-relaxed text-ivory outline-none hover:border-brass/50 focus:border-brass md:text-sm"
                />
              </Field>
            </div>
          </section>
        ))}

        {steps.length < 4 && (
          <Button
            variant="secondary"
            onClick={() => setSteps((s) => [...s, { delayDays: 4, subject: '', body: 'Hi again,\n\n\n\n{{sender_name}}' }])}
          >
            <Plus className="h-4 w-4" /> Add a follow-up
          </Button>
        )}
        <p className="text-sm text-muted">
          Follow-ups go out automatically in the same thread, and stop the moment someone replies, bounces or unsubscribes. You approve the first email for each business; follow-ups use the text above.
        </p>

        <section className="rounded-2xl border border-line bg-surface/40 p-5">
          <h3 className="font-display text-2xl text-ivory">Personal line</h3>
          <div className="mt-2 divide-y divide-line">
            <Switch
              checked={ai.enabled && aiAvailable}
              onChange={(v) => setAi({ ...ai, enabled: v })}
              label="Have Claude write a line about each business"
              hint={aiAvailable ? 'Fills the Personal line (AI) variable. You review every one before it sends.' : 'Add ANTHROPIC_API_KEY to the server to turn this on.'}
            />
            <Switch
              checked={ai.useWebsite}
              onChange={(v) => setAi({ ...ai, useWebsite: v })}
              label="Read their website first"
              hint="Gives Claude real details to mention. Slower, and much better."
            />
          </div>
          <div className="mt-4">
            <Field label="What you offer, and anything the line should consider" hint="Context for Claude, not text that gets pasted in. Example: we build booking websites for dental clinics.">
              <textarea
                value={ai.instructions}
                maxLength={2000}
                rows={4}
                onChange={(e) => setAi({ ...ai, instructions: e.target.value })}
                className="w-full rounded-lg border border-line bg-ink p-3 text-base text-ivory outline-none hover:border-brass/50 focus:border-brass md:text-sm"
              />
            </Field>
          </div>
        </section>

        <div className="flex justify-end">
          <Button size="lg" loading={saving} onClick={save}>
            Save emails
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-10 lg:self-start">
        <p className="mb-3 text-sm text-muted">Preview with a sample business</p>
        {preview && (
          <div className="rounded-2xl border border-line bg-[#F7F4EE] p-6 text-[#1B2333] shadow-lift">
            <p className="text-xs text-[#5B6578]">Subject</p>
            <p className="mt-1 font-semibold">{preview.subject || 'No subject'}</p>
            <hr className="my-4 border-[#E2DCCF]" />
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{preview.body}</pre>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[#5B6578]">
              {`--\n${[sender.companyName || 'Your company', sender.postalAddress || 'Your postal address'].join(', ')}\nDon't want emails like this? Unsubscribe: (link)`}
            </pre>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Plain text, no images or tracking pixels. That keeps your emails out of spam folders. Use {'{{city|your area}}'} to set a fallback when a value is missing.
        </p>
      </aside>
    </div>
  );
}
