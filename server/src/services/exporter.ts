import ExcelJS from 'exceljs';
import type { LeadAttrs } from '../models/Lead';

type ExportLead = Partial<LeadAttrs> & { createdAt?: Date };

const COLUMNS: { header: string; width: number; value: (l: ExportLead) => string | number | null | undefined }[] = [
  { header: 'Business', width: 34, value: (l) => l.name },
  { header: 'Category', width: 20, value: (l) => l.category },
  { header: 'Email', width: 32, value: (l) => l.emails?.[0] },
  { header: 'Email check', width: 12, value: (l) => l.emailChecks?.find((c) => c.email === l.emails?.[0])?.result ?? undefined },
  { header: 'Other emails', width: 36, value: (l) => l.emails?.slice(1).join(', ') },
  { header: 'Phone', width: 18, value: (l) => l.phone },
  { header: 'International phone', width: 20, value: (l) => l.intlPhone },
  { header: 'Website', width: 32, value: (l) => l.website },
  { header: 'Address', width: 44, value: (l) => l.address },
  { header: 'Locality', width: 16, value: (l) => l.context?.locality },
  { header: 'City', width: 16, value: (l) => l.context?.city },
  { header: 'State / province', width: 18, value: (l) => l.context?.state },
  { header: 'Country', width: 16, value: (l) => l.context?.country },
  { header: 'Rating', width: 8, value: (l) => l.rating },
  { header: 'Reviews', width: 9, value: (l) => l.reviewCount },
  { header: 'Lead status', width: 14, value: (l) => l.status },
  { header: 'Facebook', width: 30, value: (l) => l.socials?.facebook },
  { header: 'Instagram', width: 30, value: (l) => l.socials?.instagram },
  { header: 'LinkedIn', width: 30, value: (l) => l.socials?.linkedin },
  { header: 'WhatsApp', width: 24, value: (l) => l.socials?.whatsapp },
  { header: 'Google Maps', width: 30, value: (l) => l.mapsUrl },
  { header: 'Notes', width: 30, value: (l) => l.notes },
  { header: 'Saved on', width: 12, value: (l) => (l.createdAt ? l.createdAt.toISOString().slice(0, 10) : undefined) },
];

/**
 * Spreadsheet apps execute cells that start with = + - @ as formulas. A business
 * name like "=HYPERLINK(...)" from scraped data could run on open. Prefix with '.
 */
function neutralize(value: string | number | null | undefined): string | number {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function toXlsx(leads: ExportLead[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LeadPilot';
  wb.created = new Date();
  const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  for (const lead of leads) ws.addRow(COLUMNS.map((c) => neutralize(c.value(lead))));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FF0F1A2B' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2C68E' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toCsv(leads: ExportLead[]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.map((c) => escape(c.header)).join(',')];
  for (const lead of leads) lines.push(COLUMNS.map((c) => escape(neutralize(c.value(lead)))).join(','));
  // BOM so Excel opens UTF-8 names (é, ñ, ü) correctly
  return '\uFEFF' + lines.join('\r\n');
}
