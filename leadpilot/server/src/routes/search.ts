import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../lib/http';
import { Lead } from '../models/Lead';
import { Search } from '../models/Search';
import { PRICE_LEVELS, searchPlaces, type PlaceSnapshot } from '../services/places';
import { consume, getWorkspace } from '../services/usage';

const router = Router();

export const searchSchema = z.object({
  businessType: z.string().trim().min(2, 'Enter a business type').max(80),
  keyword: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().length(2, 'Choose a country'),
  country: z.string().trim().min(1).max(80),
  stateCode: z.string().trim().max(10).optional(),
  state: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(80).optional(),
  // Sent to Google
  minRating: z.number().min(0).max(5).optional(),
  openNow: z.boolean().optional(),
  priceLevels: z.array(z.enum(PRICE_LEVELS)).max(4).optional(),
  maxResults: z.union([z.literal(20), z.literal(40), z.literal(60)]).default(20),
  // Applied after Google returns results
  minReviews: z.number().int().min(0).max(100000).optional(),
  hasWebsite: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  operationalOnly: z.boolean().default(true),
  excludeSaved: z.boolean().optional(),
});
export type SearchParams = z.infer<typeof searchSchema>;

function buildTextQuery(p: SearchParams): string {
  const what = [p.keyword, p.businessType].filter(Boolean).join(' ');
  const where = [p.locality, p.city, p.state, p.country].filter(Boolean).join(', ');
  return `${what} in ${where}`;
}

function applyPostFilters(places: PlaceSnapshot[], p: SearchParams): PlaceSnapshot[] {
  return places.filter((pl) => {
    if (p.operationalOnly && pl.businessStatus && pl.businessStatus !== 'OPERATIONAL') return false;
    if (p.minReviews && (pl.reviewCount ?? 0) < p.minReviews) return false;
    if (p.hasWebsite && !pl.website) return false;
    if (p.hasPhone && !pl.phone && !pl.intlPhone) return false;
    return true;
  });
}

async function withSavedFlags(workspaceId: string, places: PlaceSnapshot[]) {
  const saved = await Lead.find(
    { workspaceId, placeId: { $in: places.map((p) => p.placeId) } },
    { placeId: 1 },
  ).lean();
  const savedIds = new Set(saved.map((s) => s.placeId));
  return places.map((p) => ({ ...p, saved: savedIds.has(p.placeId) }));
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const params = searchSchema.parse(req.body);
    const { workspaceId, userId } = req.auth!;
    const ws = await getWorkspace(workspaceId);
    await consume(ws, 'searches', 1);

    const textQuery = buildTextQuery(params);
    const { places, requests } = await searchPlaces({
      textQuery,
      regionCode: params.countryCode,
      minRating: params.minRating,
      openNow: params.openNow,
      priceLevels: params.priceLevels,
      maxResults: params.maxResults,
    });
    ws.usage!.placesRequests = (ws.usage!.placesRequests ?? 0) + requests;
    await ws.save();

    let results = await withSavedFlags(workspaceId, applyPostFilters(places, params));
    const fetched = places.length;
    if (params.excludeSaved) results = results.filter((r) => !r.saved);

    const search = await Search.create({
      workspaceId,
      userId,
      params,
      textQuery,
      results: results.map(({ saved: _saved, ...r }) => r),
      placesRequests: requests,
    });

    res.json({
      searchId: search._id,
      textQuery,
      fetched,
      filteredOut: fetched - results.length,
      results,
    });
  }),
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const items = await Search.find(
      { workspaceId: req.auth!.workspaceId },
      { params: 1, textQuery: 1, createdAt: 1, count: { $size: '$results' } },
    )
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();
    res.json(items);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const search = await Search.findOne({ _id: req.params.id, workspaceId: req.auth!.workspaceId }).lean();
    if (!search) throw new HttpError(404, 'This search has expired. Run it again to get fresh results.');
    const results = await withSavedFlags(req.auth!.workspaceId, search.results as PlaceSnapshot[]);
    res.json({ searchId: search._id, textQuery: search.textQuery, params: search.params, fetched: results.length, filteredOut: 0, results });
  }),
);

export default router;
