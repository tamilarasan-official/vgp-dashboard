// Loads the VGP phone line -> property mapping for the Zoho CRM section (source: VGP Smartflo number list).
// Run: node scripts/load-zoho-lines.js   (safe to re-run; updates existing rows)
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const rows = [
  ['+918065061094', 'WW', 'Wonder World 1 · Manoj'],
  ['+918065061095', 'WW', 'Wonder World 2 · Manoj'],
  ['+918065061096', 'WW', 'Wonder World 3 · Manoj'],
  ['+918065061097', 'WW', 'Wonder World 4 · Manoj'],
  ['+918065077090', 'WW', 'Wonder World additional · Manoj'],
  ['+918065060563', 'IR', 'Ice Rink 1 · Pavithra'],
  ['+918065060564', 'IR', 'Ice Rink 2 · Pavithra'],
  ['+918065060566', 'IR', 'Ice Rink 3 · Pavithra'],
  ['+918065077689', 'IR', 'Ice Rink additional · Pavithra'],
  ['+918065061098', 'FLY', 'Fly Dining 1 · Anitha'],
  ['+918065060561', 'FLY', 'Fly Dining 2 · Anitha'],
  ['+918065060562', 'FLY', 'Fly Dining 3 · Anitha'],
];
(async () => {
  for (const [number, propertyCode, label] of rows)
    await p.zohoLine.upsert({ where: { number }, create: { number, propertyCode, label }, update: { propertyCode, label } });
  const q = (s) => p.$queryRawUnsafe(s);
  const LEADS = `SELECT l.*, COALESCE(CASE l.industry WHEN 'VGP Wonder World' THEN 'WW' WHEN 'VGP Wonder Ice Rink' THEN 'IR' WHEN 'VGP Fly Dining' THEN 'FLY' END, ln.property_code, 'UNASSIGNED') AS prop FROM zoho_lead l LEFT JOIN zoho_line ln ON ln.number = l.vgp_line WHERE NOT l.is_deleted`;
  console.log('lines saved:', await p.zohoLine.count());
  console.log('leads by property:', await q(`SELECT prop, COUNT(*)::int n FROM (${LEADS}) x GROUP BY 1 ORDER BY 2 DESC`));
  console.log('calls by property:', await q(`SELECT COALESCE(ln.property_code, lp.prop, 'UNASSIGNED') prop, COUNT(*)::int n FROM zoho_call c LEFT JOIN zoho_line ln ON ln.number = c.vgp_line LEFT JOIN (${LEADS}) lp ON lp.id = c.lead_id WHERE NOT c.is_deleted GROUP BY 1 ORDER BY 2 DESC`));
  console.log('still unassigned leads by source:', await q(`SELECT COALESCE(lead_source, 'Not set') src, COUNT(*)::int n FROM (${LEADS}) x WHERE prop = 'UNASSIGNED' GROUP BY 1 ORDER BY 2 DESC`));
  await p.$disconnect();
})();
