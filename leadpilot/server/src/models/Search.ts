import { Schema, model } from 'mongoose';

/**
 * Cached search results. Saving leads reads from here (not from the browser),
 * so clients can't inject fake business data. Expires after 30 days, in line
 * with Google's limits on caching Places content.
 */
const SearchSchema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  params: { type: Schema.Types.Mixed, required: true },
  textQuery: { type: String, required: true },
  results: { type: [Schema.Types.Mixed], default: [] },
  placesRequests: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});

export const Search = model('Search', SearchSchema);
