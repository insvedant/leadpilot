import { Router } from 'express';
import mongoose, { type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { asyncHandler, escapeRegex, HttpError } from '../lib/http';
import { Lead, LEAD_STATUSES, ENRICH_STATUSES, type LeadAttrs } from '../models/Lead';
import { Search } from '../models/Search';
import type { PlaceSnapshot } from '../services/places';
import { toCsv, toXlsx } from '../services/exporter';
import { InProcessQueue, queueEnrichment } from '../services/queue';
import { verificationAvailable, verifyEmail } from '../services/verify';
import { consume, getWorkspace } from '../services/usage';
import { logFromRequest } from '../services/activity';
import type { SearchParams } from './search';

const router = Router();

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

// --- Save from search -------------------------------------------------------

const fromSearchSchema = z.object({
  searchId: objectId,
  placeIds: z.array(z.string().min(1)).min(1, 'Select at least one business').max(60),
  enrich: z.boolean().default(false),
});

router.post(
  '/from-search',
  asyncHandler(async (req, res) => {
    const { searchId, placeIds, enrich } = fromSearchSchema.parse(req.body);
    const { workspaceId } = req.auth!;

    const search = await Search.findOne({ _id: searchId, workspaceId }).lean();
    if (!search) throw new HttpError(404, 'This search has expired. Run it again, then save.');

    const wanted = new Set(placeIds);
    const places = (search.results as PlaceSnapshot[]).filter((p) => wanted.has(p.placeId));
    if (!places.length) throw new HttpError(400, 'None of the selected businesses are in this search.');

    const params = search.params as SearchParams;
    const context = {
      businessType: params.businessType,
      country: params.country,
      countryCode: params.countryCode,
      state: params.state,
      city: params.city,
      locality: params.locality,
    };
    const now = new Date();
    const wsOid = new mongoose.Types.ObjectId(workspaceId);

    await Lead.bulkWrite(
      places.map((p) => ({
        updateOne: {
          filter: { workspaceId: wsOid, placeId: p.placeId },
          update: {
            $set: {
              name: p.name,
              address: p.address,
              phone: p.phone,
              intlPhone: p.intlPhone,
              website: p.website,
              rating: p.rating,
              reviewCount: p.reviewCount,
              category: p.category,
              primaryType: p.primaryType,
              types: p.types,
              businessStatus: p.businessStatus,
              mapsUrl: p.mapsUrl,
              location: p.location,
              priceLevel: p.priceLevel,
              placesFetchedAt: now,
            },
            $setOnInsert: { workspaceId: wsOid, placeId: p.placeId, context, status: 'new' as const },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const leads = await Lead.find(
      { workspaceId, placeId: { $in: places.map((p) => p.placeId) } },
      { _id: 1, website: 1, 'enrich.status': 1 },
    ).lean();
    const leadIds = leads.map((l) => String(l._id));

    let queued = 0;
    if (enrich) {
      const toScan = leads.filter((l) => !['queued', 'running'].includes(l.enrich?.status ?? 'idle'));
      if (toScan.length) {
        const ws = await getWorkspace(workspaceId);
        await consume(ws, 'enrichments', toScan.length);
        await Lead.updateMany({ _id: { $in: toScan.map((l) => l._id) } }, { $set: { 'enrich.status': 'queued' } });
        queueEnrichment(toScan.map((l) => String(l._id)));
        queued = toScan.length;
      }
    }

    logFromRequest(req, 'leads.saved', `Saved ${leadIds.length} leads from "${search.textQuery}"${queued ? `, scanning ${queued} websites` : ''}`, {
      searchId,
      saved: leadIds.length,
      queued,
    });
    res.json({ saved: leadIds.length, leadIds, queued });
  }),
);

// --- List & filter ------------------------------------------------------------

const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  enrich: z.enum(ENRICH_STATUSES).optional(),
  hasEmail: boolish.optional(),
  hasWebsite: boolish.optional(),
  hasPhone: boolish.optional(),
  city: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(['recent', 'rating', 'reviews', 'name']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
type ListFilters = z.infer<typeof listSchema>;

function buildQuery(workspaceId: string, f: Partial<ListFilters>): FilterQuery<LeadAttrs> {
  const query: FilterQuery<LeadAttrs> = { workspaceId };
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), 'i');
    query.$or = [{ name: rx }, { address: rx }, { category: rx }, { emails: rx }, { website: rx }];
  }
  if (f.status) query.status = f.status;
  if (f.enrich) query['enrich.status'] = f.enrich;
  if (f.hasEmail !== undefined) query['emails.0'] = { $exists: f.hasEmail };
  if (f.hasWebsite !== undefined) query.website = f.hasWebsite ? { $nin: [null, ''] } : { $in: [null, ''] };
  if (f.hasPhone !== undefined) query.phone = f.hasPhone ? { $nin: [null, ''] } : { $in: [null, ''] };
  if (f.city) query['context.city'] = new RegExp(`^${escapeRegex(f.city)}$`, 'i');
  if (f.category) query.category = new RegExp(escapeRegex(f.category), 'i');
  if (f.minRating) query.rating = { $gte: f.minRating };
  return query;
}

const SORTS: Record<ListFilters['sort'], Record<string, 1 | -1>> = {
  recent: { createdAt: -1 },
  rating: { rating: -1, reviewCount: -1 },
  reviews: { reviewCount: -1 },
  name: { name: 1 },
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = listSchema.parse(req.query);
    const query = buildQuery(req.auth!.workspaceId, f);
    const [items, total] = await Promise.all([
      Lead.find(query, { types: 0, location: 0 })
        .sort(SORTS[f.sort])
        .skip((f.page - 1) * f.limit)
        .limit(f.limit)
        .lean(),
      Lead.countDocuments(query),
    ]);
    res.json({ items, total, page: f.page, pages: Math.max(1, Math.ceil(total / f.limit)) });
  }),
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const workspaceId = new mongoose.Types.ObjectId(req.auth!.workspaceId);
    const [row] = await Lead.aggregate([
      { $match: { workspaceId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withEmail: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$emails', []] } }, 0] }, 1, 0] } },
          withWebsite: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$website', ''] } }, 0] }, 1, 0] } },
          scanning: { $sum: { $cond: [{ $in: ['$enrich.status', ['queued', 'running']] }, 1, 0] } },
          cities: { $addToSet: '$context.city' },
        },
      },
    ]);
    res.json({
      total: row?.total ?? 0,
      withEmail: row?.withEmail ?? 0,
      withWebsite: row?.withWebsite ?? 0,
      scanning: row?.scanning ?? 0,
      cities: ((row?.cities ?? []) as (string | null)[]).filter(Boolean).sort(),
    });
  }),
);

// --- Update, delete, enrich ---------------------------------------------------

const idsSchema = z.object({ ids: z.array(objectId).min(1, 'Select at least one lead').max(500) });

router.post(
  '/enrich',
  asyncHandler(async (req, res) => {
    const { ids } = idsSchema.parse(req.body);
    const { workspaceId } = req.auth!;
    const leads = await Lead.find(
      { _id: { $in: ids }, workspaceId, 'enrich.status': { $nin: ['queued', 'running'] } },
      { _id: 1 },
    ).lean();
    if (!leads.length) {
      res.json({ queued: 0 });
      return;
    }
    const ws = await getWorkspace(workspaceId);
    await consume(ws, 'enrichments', leads.length);
    await Lead.updateMany({ _id: { $in: leads.map((l) => l._id) } }, { $set: { 'enrich.status': 'queued' } });
    queueEnrichment(leads.map((l) => String(l._id)));
    logFromRequest(req, 'leads.enrich', `Started website scans for ${leads.length} leads`, { count: leads.length });
    res.json({ queued: leads.length });
  }),
);

const verifyQueue = new InProcessQueue(5);

router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    if (!verificationAvailable()) throw new HttpError(400, 'Add MILLIONVERIFIER_API_KEY to the server to check emails.');
    const { ids } = idsSchema.parse(req.body);
    const { workspaceId } = req.auth!;
    const leads = await Lead.find({ _id: { $in: ids }, workspaceId, 'emails.0': { $exists: true } }, { emails: 1, emailChecks: 1 }).lean();
    // Only check addresses that haven't been checked yet
    const jobs = leads.flatMap((l) => {
      const done = new Set((l.emailChecks ?? []).filter((c) => c.result !== 'error').map((c) => c.email));
      return l.emails.filter((e) => !done.has(e)).map((email) => ({ leadId: l._id, email }));
    });
    if (!jobs.length) {
      res.json({ queued: 0 });
      return;
    }
    const ws = await getWorkspace(workspaceId);
    await consume(ws, 'verifications', jobs.length);
    for (const job of jobs) {
      verifyQueue.push(async () => {
        let result: Awaited<ReturnType<typeof verifyEmail>> = 'error';
        try {
          result = await verifyEmail(job.email);
        } catch {
          result = 'error';
        }
        await Lead.updateOne({ _id: job.leadId }, { $pull: { emailChecks: { email: job.email } } });
        await Lead.updateOne({ _id: job.leadId }, { $push: { emailChecks: { email: job.email, result, at: new Date() } } });
      });
    }
    logFromRequest(req, 'leads.verify', `Checked ${jobs.length} email addresses`, { count: jobs.length });
    res.json({ queued: jobs.length });
  }),
);

const patchSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().max(4000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  emails: z.array(z.string().trim().toLowerCase().email()).max(10).optional(),
});

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    objectId.parse(req.params.id);
    const update = patchSchema.parse(req.body);
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.auth!.workspaceId },
      { $set: update },
      { new: true },
    ).lean();
    if (!lead) throw new HttpError(404, 'Lead not found.');
    res.json(lead);
  }),
);

router.post(
  '/bulk-status',
  asyncHandler(async (req, res) => {
    const { ids, status } = idsSchema.extend({ status: z.enum(LEAD_STATUSES) }).parse(req.body);
    const result = await Lead.updateMany({ _id: { $in: ids }, workspaceId: req.auth!.workspaceId }, { $set: { status } });
    res.json({ updated: result.modifiedCount });
  }),
);

router.post(
  '/delete',
  asyncHandler(async (req, res) => {
    const { ids } = idsSchema.parse(req.body);
    const result = await Lead.deleteMany({ _id: { $in: ids }, workspaceId: req.auth!.workspaceId });
    logFromRequest(req, 'leads.delete', `Deleted ${result.deletedCount} leads`, { count: result.deletedCount });
    res.json({ deleted: result.deletedCount });
  }),
);

// --- Export -------------------------------------------------------------------

const exportSchema = z.object({
  format: z.enum(['xlsx', 'csv']),
  ids: z.array(objectId).max(10000).optional(),
  filters: listSchema.partial().optional(),
});

router.post(
  '/export',
  asyncHandler(async (req, res) => {
    const { format, ids, filters } = exportSchema.parse(req.body);
    const { workspaceId } = req.auth!;
    const query = ids?.length ? { workspaceId, _id: { $in: ids } } : buildQuery(workspaceId, filters ?? {});
    const leads = await Lead.find(query).sort({ createdAt: -1 }).limit(10000).lean();
    if (!leads.length) throw new HttpError(400, 'There are no leads to export with these filters.');

    logFromRequest(req, 'leads.export', `Exported ${leads.length} leads as ${format.toUpperCase()}`, { count: leads.length, format });
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `leadpilot-leads-${stamp}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(await toXlsx(leads));
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(toCsv(leads));
    }
  }),
);

export default router;
