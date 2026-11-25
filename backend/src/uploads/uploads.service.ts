import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { toDbDate } from '../common/ist-date';

export const UPLOAD_SOURCES = {
  tally: {
    label: 'Tally',
    reportTypes: ['daybook', 'trial_balance', 'bills_receivable', 'bills_payable', 'other'],
    companies: ['VGP Promoters Private Limited', 'VGP Madras Canteen LLP'],
    roles: ['tally_uploader'],
  },
  thoughtmetrics: {
    label: 'Customer Feedback (Thought Metrics)',
    reportTypes: ['survey_responses', 'nps_summary', 'other'],
    companies: [] as string[],
    roles: ['feedback_uploader'],
  },
} as const;
export type UploadSource = keyof typeof UPLOAD_SOURCES;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 20_000; // per sheet kept for preview / processing
const MAX_COLS = 80;
type Cell = string | number | null;

/** Turn an exceljs cell value into a plain string / number. */
function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim() || null;
    if ('text' in v) return String(v.text).trim() || null;
    if ('error' in v) return null;
  }
  return String(v);
}

function parseCsv(text: string): Cell[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(cur), (cur = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur), rows.push(row), (row = []), (cur = '');
    } else cur += ch;
  }
  if (cur || row.length) row.push(cur), rows.push(row);
  return rows.map((r) => r.slice(0, MAX_COLS).map((c) => {
    const t = c.trim();
    if (!t) return null;
    const num = Number(t.replace(/,/g, ''));
    return /^-?[\d,]+(\.\d+)?$/.test(t) && Number.isFinite(num) ? num : t;
  }));
}

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  private async parse(fileName: string, buf: Buffer): Promise<{ name: string; rows: Cell[][] }[] | null> {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'csv') return [{ name: 'CSV', rows: parseCsv(buf.toString('utf8')).slice(0, MAX_ROWS) }];
    if (ext === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      return wb.worksheets.map((ws) => {
        const rows: Cell[][] = [];
        ws.eachRow({ includeEmpty: false }, (r) => {
          if (rows.length >= MAX_ROWS) return;
          // r.values is sparse (index 0 unused, empty cells are holes) - fill holes with null.
          const raw = r.values as ExcelJS.CellValue[];
          const vals = Array.from({ length: Math.min(Math.max(raw.length - 1, 0), MAX_COLS) }, (_, i) => cellValue(raw[i + 1]));
          if (vals.some((x) => x != null)) rows.push(vals);
        });
        return { name: ws.name, rows };
      });
    }
    return null; // PDF, .xls etc. are stored but not read
  }

  async create(
    source: UploadSource,
    userId: number,
    body: { fileName?: string; mimeType?: string; contentBase64?: string; reportType?: string; company?: string; periodFrom?: string; periodTo?: string; note?: string },
  ) {
    const cfg = UPLOAD_SOURCES[source];
    const fileName = String(body.fileName ?? '').replace(/[^\w.\- ()&]/g, '_').slice(0, 150);
    const ext = fileName.toLowerCase().split('.').pop() ?? '';
    if (!['xlsx', 'xls', 'csv', 'pdf'].includes(ext)) throw new BadRequestException('Only Excel (.xlsx / .xls), CSV or PDF files');
    const buf = Buffer.from(String(body.contentBase64 ?? ''), 'base64');
    if (!buf.length) throw new BadRequestException('Empty file');
    if (buf.length > MAX_BYTES) throw new BadRequestException('File is larger than 15 MB');
    const reportType = (cfg.reportTypes as readonly string[]).includes(String(body.reportType)) ? String(body.reportType) : 'other';
    const company = body.company && (cfg.companies as readonly string[]).includes(body.company) ? body.company : null;
    const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? toDbDate(v) : null);

    let sheets: { name: string; rows: Cell[][] }[] | null = null;
    try {
      sheets = await this.parse(fileName, buf);
    } catch {
      throw new BadRequestException('Could not read this file. Please export it again from the source and re-upload.');
    }
    const rowCount = sheets?.reduce((s, sh) => s + sh.rows.length, 0) ?? 0;
    const created = await this.prisma.upload.create({
      data: {
        source,
        reportType,
        company,
        periodFrom: iso(body.periodFrom),
        periodTo: iso(body.periodTo),
        fileName,
        mimeType: ext === 'pdf' ? 'application/pdf' : ext === 'csv' ? 'text/csv' : 'application/vnd.ms-excel',
        size: buf.length,
        content: buf,
        sheets: (sheets ?? undefined) as Prisma.InputJsonValue | undefined,
        rowCount,
        note: body.note ? String(body.note).slice(0, 300) : null,
        uploadedById: userId,
      },
      select: { id: true },
    });
    await this.prisma.sourceSystem.updateMany({ where: { code: source }, data: { status: 'live' } });
    return { id: created.id, rowCount, readable: sheets != null };
  }

  list(source: UploadSource, take = 50) {
    return this.prisma.upload.findMany({
      where: { source },
      orderBy: { uploadedAt: 'desc' },
      take,
      select: {
        id: true, reportType: true, company: true, periodFrom: true, periodTo: true, fileName: true, size: true,
        rowCount: true, note: true, uploadedAt: true, uploadedBy: { select: { name: true } },
      },
    });
  }

  /** Latest upload per report type (and company) with a preview of its first rows. */
  async latest(source: UploadSource, previewRows = 60) {
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT DISTINCT ON (report_type, COALESCE(company, '')) id FROM upload
      WHERE source = ${source} ORDER BY report_type, COALESCE(company, ''), uploaded_at DESC`;
    const items = await this.prisma.upload.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      orderBy: [{ reportType: 'asc' }, { company: 'asc' }],
      select: {
        id: true, reportType: true, company: true, periodFrom: true, periodTo: true, fileName: true, rowCount: true,
        uploadedAt: true, sheets: true, uploadedBy: { select: { name: true } },
      },
    });
    return items.map(({ sheets, ...u }) => ({
      ...u,
      readable: sheets != null,
      sheets: ((sheets as { name: string; rows: Cell[][] }[] | null) ?? []).map((s) => ({
        name: s.name,
        totalRows: s.rows.length,
        rows: s.rows.slice(0, previewRows),
      })),
    }));
  }

  async file(id: number) {
    const u = await this.prisma.upload.findUnique({ where: { id }, select: { fileName: true, mimeType: true, content: true, source: true } });
    if (!u) throw new NotFoundException();
    return u;
  }

  async remove(id: number) {
    await this.prisma.upload.delete({ where: { id } }).catch(() => {
      throw new NotFoundException();
    });
    return { deleted: id };
  }

  lastUpload(source: UploadSource) {
    return this.prisma.upload.findFirst({
      where: { source },
      orderBy: { uploadedAt: 'desc' },
      select: { uploadedAt: true, fileName: true, uploadedBy: { select: { name: true } } },
    });
  }
}
