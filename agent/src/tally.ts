import { XMLParser } from 'fast-xml-parser';

/**
 * Read-only Tally client. Sends ONLY "Export" requests to Tally's XML interface (port 9000).
 * It never sends Import requests, so it cannot create, change or delete anything in Tally.
 */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, trimValues: true });

// Tally exports can contain control characters that are invalid in XML.
const clean = (s: string) =>
  s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&#(x0*[0-8bcef]|x0*1[0-9a-f]|0*([0-8]|1[124-9]|2[0-9]|3[01]));/gi, '');

export const arr = <T = any>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
export const txt = (x: any): string => (x == null ? '' : typeof x === 'object' ? String(x['#text'] ?? '') : String(x));
export const yes = (x: any) => txt(x).toLowerCase() === 'yes';
export const amount = (x: any) => Number(txt(x).replace(/,/g, '')) || 0;
export const tallyDateToIso = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '');
export const isoToTally = (d: string) => d.replace(/-/g, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class TallyClient {
  constructor(private readonly url: string) {}

  private async request(xml: string): Promise<any> {
    if (!/<TALLYREQUEST>Export<\/TALLYREQUEST>/.test(xml) || /<TALLYREQUEST>Import/i.test(xml)) {
      throw new Error('Safety stop: only Tally Export requests are allowed');
    }
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xml,
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`Tally HTTP ${res.status}`);
    return parser.parse(clean(await res.text()));
  }

  private collection(opts: { type: string; fetch: string; company?: string; from?: string; to?: string; filter?: string }) {
    const vars = [
      '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>',
      opts.company ? `<SVCURRENTCOMPANY>${esc(opts.company)}</SVCURRENTCOMPANY>` : '',
      opts.from ? `<SVFROMDATE>${isoToTally(opts.from)}</SVFROMDATE>` : '',
      opts.to ? `<SVTODATE>${isoToTally(opts.to)}</SVTODATE>` : '',
    ].join('');
    const filter = opts.filter
      ? `<FILTERS>VgpFilter</FILTERS></COLLECTION><SYSTEM TYPE="Formulae" NAME="VgpFilter">${esc(opts.filter)}</SYSTEM><COLLECTION NAME="VgpUnused"><TYPE>Ledger</TYPE>`
      : '';
    return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VgpColl</ID></HEADER><BODY><DESC><STATICVARIABLES>${vars}</STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="VgpColl"><TYPE>${opts.type}</TYPE><FETCH>${opts.fetch}</FETCH>${filter}</COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  }

  private async rows(opts: Parameters<TallyClient['collection']>[0], tag: string): Promise<any[]> {
    const doc = await this.request(this.collection(opts));
    return arr(doc?.ENVELOPE?.BODY?.DATA?.COLLECTION?.[tag]);
  }

  /** Companies currently open in Tally. */
  async companies(): Promise<{ name: string; booksFrom: string }[]> {
    const rows = await this.rows({ type: 'Company', fetch: 'NAME, BOOKSFROM, STARTINGFROM' }, 'COMPANY');
    return rows.map((c) => ({ name: c['@NAME'] ?? txt(c.NAME), booksFrom: tallyDateToIso(txt(c.BOOKSFROM) || txt(c.STARTINGFROM)) }));
  }

  async groups(company: string) {
    const rows = await this.rows({ type: 'Group', fetch: 'NAME, PARENT, ISREVENUE, AFFECTSGROSSPROFIT, ISDEEMEDPOSITIVE', company }, 'GROUP');
    return rows.map((g) => ({
      name: g['@NAME'] ?? txt(g.NAME),
      parent: txt(g.PARENT) || null,
      isRevenue: yes(g.ISREVENUE),
      affectsGrossProfit: yes(g.AFFECTSGROSSPROFIT),
      isDeemedPositive: yes(g.ISDEEMEDPOSITIVE),
    }));
  }

  async ledgers(company: string, from: string, to: string) {
    const rows = await this.rows(
      { type: 'Ledger', fetch: 'NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ALTERID', company, from, to },
      'LEDGER',
    );
    return rows.map((l) => ({
      name: l['@NAME'] ?? txt(l.NAME),
      parent: txt(l.PARENT) || null,
      openingBalance: amount(l.OPENINGBALANCE),
      closingBalance: amount(l.CLOSINGBALANCE),
      alterId: Number(txt(l.ALTERID)) || 0,
    }));
  }

  /** Light list: AlterID (+ GUID, DATE) of vouchers, optionally only those changed after `afterAlterId`. */
  async voucherIndex(company: string, from: string, to: string, afterAlterId?: number) {
    const rows = await this.rows(
      { type: 'Voucher', fetch: 'GUID, DATE, ALTERID', company, from, to, filter: afterAlterId != null ? `$AlterID > ${afterAlterId}` : undefined },
      'VOUCHER',
    );
    return rows.map((v) => ({ guid: txt(v.GUID), date: tallyDateToIso(txt(v.DATE)), alterId: Number(txt(v.ALTERID)) || 0 }));
  }

  /** Full vouchers with ledger lines for an AlterID window (lo, hi]. */
  async vouchers(company: string, from: string, to: string, lo: number, hi: number) {
    const rows = await this.rows(
      {
        type: 'Voucher',
        fetch: 'DATE, VOUCHERTYPENAME, VOUCHERNUMBER, PARTYLEDGERNAME, GUID, ALTERID, MASTERID, ISCANCELLED, ISOPTIONAL, ALLLEDGERENTRIES.LIST',
        company,
        from,
        to,
        filter: `$AlterID > ${lo} AND $AlterID <= ${hi}`,
      },
      'VOUCHER',
    );
    return rows.map((v) => ({
      guid: txt(v.GUID),
      alterId: Number(txt(v.ALTERID)) || 0,
      masterId: Number(txt(v.MASTERID)) || null,
      date: tallyDateToIso(txt(v.DATE)),
      voucherType: txt(v.VOUCHERTYPENAME) || v['@VCHTYPE'] || 'Unknown',
      voucherNumber: txt(v.VOUCHERNUMBER) || null,
      partyLedger: txt(v.PARTYLEDGERNAME) || null,
      isCancelled: yes(v.ISCANCELLED),
      isOptional: yes(v.ISOPTIONAL),
      lines: arr(v['ALLLEDGERENTRIES.LIST'])
        .map((l: any) => ({
          ledgerName: txt(l.LEDGERNAME),
          amount: amount(l.AMOUNT),
          isDeemedPositive: yes(l.ISDEEMEDPOSITIVE),
          costCentres: arr(l['CATEGORYALLOCATIONS.LIST']).flatMap((c: any) =>
            arr(c['COSTCENTREALLOCATIONS.LIST']).map((cc: any) => ({
              category: txt(c.CATEGORY) || null,
              name: txt(cc.NAME),
              amount: amount(cc.AMOUNT),
            })),
          ),
        }))
        .filter((l) => l.ledgerName),
    }));
  }
}
