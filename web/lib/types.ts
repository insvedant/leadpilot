export type PriceLevel =
  | 'PRICE_LEVEL_INEXPENSIVE'
  | 'PRICE_LEVEL_MODERATE'
  | 'PRICE_LEVEL_EXPENSIVE'
  | 'PRICE_LEVEL_VERY_EXPENSIVE';

export interface Place {
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
  businessStatus?: string;
  mapsUrl?: string;
  priceLevel?: string;
  saved?: boolean;
}

export interface SearchResponse {
  searchId: string;
  textQuery: string;
  fetched: number;
  filteredOut: number;
  results: Place[];
}

export interface SearchFilters {
  businessType: string;
  keyword: string;
  countryCode: string;
  country: string;
  stateCode: string;
  state: string;
  city: string;
  locality: string;
  minRating: number;
  minReviews: number;
  openNow: boolean;
  priceLevels: PriceLevel[];
  maxResults: 20 | 40 | 60;
  hasWebsite: boolean;
  hasPhone: boolean;
  operationalOnly: boolean;
  excludeSaved: boolean;
}

export interface HistoryItem {
  _id: string;
  textQuery: string;
  count: number;
  createdAt: string;
}

export type LeadStatus = 'new' | 'contacted' | 'replied' | 'won' | 'lost' | 'do_not_contact';
export type EnrichStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'skipped';

export interface Lead {
  _id: string;
  placeId: string;
  name: string;
  address?: string;
  phone?: string;
  intlPhone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  mapsUrl?: string;
  context?: { businessType?: string; country?: string; state?: string; city?: string; locality?: string };
  emails: string[];
  emailChecks?: { email: string; result: string; at?: string }[];
  socials?: Partial<Record<'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'youtube' | 'tiktok' | 'whatsapp', string>>;
  enrich?: { status: EnrichStatus; error?: string; at?: string; pagesScanned?: number };
  status: LeadStatus;
  notes?: string;
  createdAt: string;
}

export interface LeadsPage {
  items: Lead[];
  total: number;
  page: number;
  pages: number;
}

export interface LeadsSummary {
  total: number;
  withEmail: number;
  withWebsite: number;
  scanning: number;
  cities: string[];
}

export interface Meter {
  used: number;
  limit: number | null;
}

export interface Me {
  user: { id: string; name: string; email: string; role: string; isAdmin?: boolean };
  workspace: {
    id: string;
    name: string;
    usage: {
      plan: string;
      searches: Meter;
      enrichments: Meter;
      emails: Meter;
      aiGenerations: Meter;
      verifications: Meter;
      placesRequests: number;
    };
  };
}

// --- Outreach -------------------------------------------------------------------

export interface ServerConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  hasPassword?: boolean;
}

export type MailProvider = 'gmail' | 'zoho' | 'zoho_in' | 'outlook' | 'custom';

export interface Mailbox {
  _id: string;
  provider: MailProvider;
  fromName: string;
  email: string;
  smtp: ServerConfig;
  imap?: ServerConfig;
  dailyLimit: number;
  status: 'active' | 'paused' | 'error';
  lastError?: string;
  lastSentAt?: string;
  imapCheckedAt?: string;
}

export interface MailboxTest {
  smtp: string | null;
  imap: string | null;
}

export interface CampaignStep {
  delayDays: number;
  subject: string;
  body: string;
}

export interface CampaignStats {
  leads: number;
  review: number;
  writing: number;
  queued: number;
  sent: number;
  replied: number;
  bounced: number;
  failed: number;
}

export interface Campaign {
  _id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  pausedReason?: string;
  mailboxIds: string[];
  steps: CampaignStep[];
  ai: { enabled: boolean; instructions: string; useWebsite: boolean };
  schedule: { timezone: string; days: number[]; startHour: number; endHour: number; minGapSec: number; maxGapSec: number };
  requireVerified: boolean;
  stats: CampaignStats | null;
  updatedAt: string;
}

export type MessageStatus =
  | 'pending'
  | 'generating'
  | 'draft'
  | 'approved'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface OutMessage {
  _id: string;
  step: number;
  toEmail: string;
  subject: string;
  body: string;
  aiLine: string;
  status: MessageStatus;
  error?: string;
  scheduledAt?: string;
  sentAt?: string;
  repliedAt?: string;
  replyFrom?: string;
  bouncedAt?: string;
  lead: {
    _id: string;
    name: string;
    category?: string;
    context?: { city?: string };
    website?: string;
    emails: string[];
    emailChecks?: { email: string; result: string }[];
    rating?: number;
    reviewCount?: number;
  } | null;
  mailbox: { _id: string; email: string; fromName: string } | null;
}

export interface MessagesPage {
  items: OutMessage[];
  total: number;
  page: number;
  pages: number;
}

export interface AddLeadsResult {
  added: number;
  alreadyAdded: number;
  noEmail: number;
  unverified: number;
  doNotContact: number;
  aiQueued: number;
  aiAvailable: boolean;
}

export interface SettingsData {
  workspace: { name: string; sender: { companyName?: string; postalAddress?: string; website?: string } };
  usage: Me['workspace']['usage'];
  features: { ai: boolean; verification: boolean };
}

export interface SuppressionEntry {
  _id: string;
  email: string;
  reason: 'unsubscribed' | 'bounced' | 'manual' | 'complaint';
  createdAt: string;
}

// --- Admin ---------------------------------------------------------------------

export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type Plan = 'free' | 'pro' | 'internal';

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  status: UserStatus;
  statusReason?: string;
  createdAt: string;
  approvedAt?: string;
  lastLoginAt?: string;
  lastSeenAt?: string;
  isAdmin: boolean;
  plan?: Plan;
  usage?: Me['workspace']['usage'] | null;
}

export interface ActivityItem {
  _id: string;
  type: string;
  summary: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  user: { _id: string; name: string; email: string } | null;
}

export interface AdminOverview {
  users: { pending: number; active: number; suspended: number; rejected: number; total: number; online: number; activeToday: number };
  online: AdminUser[];
  pending: AdminUser[];
  today: { searches: number; emailsSent: number; replies: number; bounces: number };
  flagged: { user: AdminUser | null; sent: number; bounced: number; rate: number }[];
  recent: ActivityItem[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface AdminUserDetail {
  user: AdminUser;
  workspace: {
    _id: string;
    name: string;
    plan: Plan;
    sender: { companyName?: string; postalAddress?: string; website?: string };
    usage: Me['workspace']['usage'];
    bounceOverrideUntil?: string;
  } | null;
  totals: { leads: number; leadsWithEmail: number; campaigns: number; sent: number; replied: number; bounced: number };
  bounce7: { sent: number; bounced: number; rate: number };
  mailboxes: { _id: string; email: string; fromName: string; provider: string; status: string; dailyLimit: number; lastError?: string; lastSentAt?: string }[];
}

export interface AdminEmail {
  _id: string;
  step: number;
  toEmail: string;
  subject: string;
  body: string;
  status: MessageStatus;
  error?: string;
  sentAt?: string;
  repliedAt?: string;
  bouncedAt?: string;
  createdAt: string;
  lead: { _id: string; name: string; category?: string; context?: { city?: string } } | null;
  mailbox: { _id: string; email: string; fromName: string } | null;
  campaign: { _id: string; name: string } | null;
}
