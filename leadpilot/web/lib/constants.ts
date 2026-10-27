import type { LeadStatus, PriceLevel } from './types';

export const QUICK_TYPES = ['Dentists', 'Restaurants', 'Hair salons', 'Gyms', 'Real estate agents', 'Plumbers', 'Law firms', 'Cafés'];

export const BUSINESS_TYPES = [
  'Accountants', 'Architects', 'Auto repair shops', 'Bakeries', 'Barbershops', 'Beauty salons', 'Boutiques',
  'Car dealerships', 'Cafés', 'Caterers', 'Chiropractors', 'Cleaning services', 'Clinics', 'Construction companies',
  'Daycares', 'Dentists', 'Dermatologists', 'Driving schools', 'Electricians', 'Event venues', 'Florists',
  'Furniture stores', 'Gyms', 'Hair salons', 'Hotels', 'HVAC contractors', 'Insurance agencies', 'Interior designers',
  'IT services', 'Jewelers', 'Landscapers', 'Law firms', 'Marketing agencies', 'Moving companies', 'Nail salons',
  'Opticians', 'Pet groomers', 'Pharmacies', 'Photographers', 'Physiotherapists', 'Plumbers', 'Real estate agents',
  'Restaurants', 'Roofers', 'Spas', 'Tutoring centers', 'Veterinarians', 'Wedding planners', 'Yoga studios',
];

export const PRICE_OPTIONS: { value: PriceLevel; label: string }[] = [
  { value: 'PRICE_LEVEL_INEXPENSIVE', label: '$' },
  { value: 'PRICE_LEVEL_MODERATE', label: '$$' },
  { value: 'PRICE_LEVEL_EXPENSIVE', label: '$$$' },
  { value: 'PRICE_LEVEL_VERY_EXPENSIVE', label: '$$$$' },
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  won: 'Won',
  lost: 'Lost',
  do_not_contact: 'Do not contact',
};
