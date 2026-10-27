import { env } from '../config/env';
import { HttpError } from '../lib/http';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

// Every field here is billed. phone/website/rating push the request to the
// "Text Search Enterprise" SKU, which is what lead generation needs.
const FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'primaryType',
  'primaryTypeDisplayName',
  'types',
  'businessStatus',
  'googleMapsUri',
  'location',
  'priceLevel',
];
const FIELD_MASK = [...FIELDS.map((f) => `places.${f}`), 'nextPageToken'].join(',');

export const PRICE_LEVELS = [
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
] as const;
export type PriceLevel = (typeof PRICE_LEVELS)[number];

export interface PlaceSnapshot {
  placeId: string;
  name: string;
  address?: string;
  phone?: string;
  intlPhone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  mapsUrl?: string;
  location?: { lat: number; lng: number };
  priceLevel?: string;
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  businessStatus?: string;
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
  priceLevel?: string;
}

export interface TextSearchInput {
  textQuery: string;
  regionCode?: string;
  languageCode?: string;
  minRating?: number;
  openNow?: boolean;
  priceLevels?: PriceLevel[];
  /** 20, 40 or 60. Google caps a single query at 60 results; each 20 is one billed request. */
  maxResults: number;
}

function normalize(p: GooglePlace): PlaceSnapshot {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? 'Unnamed business',
    address: p.formattedAddress,
    phone: p.nationalPhoneNumber,
    intlPhone: p.internationalPhoneNumber,
    website: p.websiteUri,
    rating: p.rating,
    reviewCount: p.userRatingCount,
    category: p.primaryTypeDisplayName?.text,
    primaryType: p.primaryType,
    types: p.types,
    businessStatus: p.businessStatus,
    mapsUrl: p.googleMapsUri,
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
    priceLevel: p.priceLevel,
  };
}

export async function searchPlaces(input: TextSearchInput): Promise<{ places: PlaceSnapshot[]; requests: number }> {
  const maxPages = Math.min(3, Math.max(1, Math.ceil(input.maxResults / 20)));
  const seen = new Set<string>();
  const places: PlaceSnapshot[] = [];
  let pageToken: string | undefined;
  let requests = 0;

  do {
    const body: Record<string, unknown> = {
      textQuery: input.textQuery,
      pageSize: 20,
      languageCode: input.languageCode ?? 'en',
    };
    if (input.regionCode) body.regionCode = input.regionCode.toLowerCase();
    // Google accepts minRating in 0.5 steps
    if (input.minRating) body.minRating = Math.floor(input.minRating * 2) / 2;
    if (input.openNow) body.openNow = true;
    if (input.priceLevels?.length) body.priceLevels = input.priceLevels;
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    requests++;

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = err?.error?.message ?? `request failed with status ${res.status}`;
      console.error('Google Places error', res.status, message);
      throw new HttpError(
        res.status === 429 ? 429 : 502,
        res.status === 429
          ? 'Google Places is rate limiting this key. Wait a minute and search again.'
          : `Google Places couldn't run this search: ${message}`,
      );
    }

    const data = (await res.json()) as { places?: GooglePlace[]; nextPageToken?: string };
    for (const p of data.places ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      places.push(normalize(p));
    }
    pageToken = data.nextPageToken;
  } while (pageToken && requests < maxPages);

  return { places: places.slice(0, input.maxResults), requests };
}
