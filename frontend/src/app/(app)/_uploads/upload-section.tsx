import { apiGet, fmtDate, fmtDateTime, fmtInt, getMe } from '@/lib/api';
import { deleteUpload } from './actions';
import { UploadForm } from './upload-form';

type Cell = string | number | null;
type Latest = {
  id: number;
  reportType: string;
  company: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  fileName: string;
  rowCount: number;
  uploadedAt: string;
  readable: boolean;
  uploadedBy: { name: string };
  sheets: { name: string; totalRows: number; rows: Cell[][] }[];
};
type Row = Omit<Latest, 'sheets' | 'readable'> & { size: number; note: string | null };

type Props = {
  source: 'tally' | 'thoughtmetrics';
  path: string;
  title: string;
  subtitle: string;
  uploaderRole: string;
  reportTypes: { value: string; label: string }[];
  companies: string[];
  hint: string;
  emptyText: string;
};

const fmtCell = (c: Cell) => (c == null ? '' : typeof c === 'number' ? c.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : c);
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export async function UploadSection(p: Props) {
  const [me, latest, history] = await Promise.all([getMe(), apiGet<Latest[]>(`/uploads/${p.source}/latest`), apiGet<Row[]>(`/uploads/${p.source}`)]);
  const canUpload = me?.role === 'admin' || me?.role === p.uploaderRole;
  const label = (t: string) => p.reportTypes.find((r) => r.value === t)?.label ?? t;
  const last = history?.[0];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <p className="text-sm text-muted">
          {p.subtitle} · last upload {last ? `${fmtDateTime(last.uploadedAt)} by ${last.uploadedBy.name}` : 'not yet received'}
        </p>
      </div>

      {canUpload && <UploadForm source={p.source} reportTypes={p.reportTypes} companies={p.companies} hint={p.hint} />}

      {!latest?.length ? (
        <p className="rounded-xl border border-dashed border-line bg-card p-8 text-center text-sm text-muted">{p.emptyText}</p>
      ) : (
        latest.map((u) => (
          <section key={u.id} className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-4">
              <div>
                <h2 className="font-semibold">
                  {label(u.reportType)}
                  {u.company ? <span className="font-normal text-muted"> · {u.company}</span> : null}
                </h2>
                <p className="text-xs text-muted">
                  {u.periodFrom || u.periodTo ? `Period ${fmtDate(u.periodFrom)} – ${fmtDate(u.periodTo)} · ` : ''}
                  Uploaded {fmtDateTime(u.uploadedAt)} by {u.uploadedBy.name} · {u.fileName}
                </p>
              </div>
              <a href={`/files/${u.id}`} className="rounded border border-line px-3 py-1 text-sm hover:bg-subtle">Download</a>
            </div>
            {!u.readable ? (
              <p className="p-4 text-sm text-muted">File saved. A preview is shown for Excel (.xlsx) and CSV files; use Download to open this file.</p>
            ) : (
              u.sheets.map((s) => (
                <div key={s.name} className="overflow-x-auto">
                  {u.sheets.length > 1 && <div className="bg-subtle px-4 py-2 text-xs font-medium">Sheet: {s.name}</div>}
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-line tabular-nums">
                      {s.rows.map((r, i) => (
                        <tr key={i} className={i === 0 ? 'bg-subtle font-medium' : ''}>
                          {r.map((c, j) => (
                            <td key={j} className={`whitespace-nowrap px-3 py-1.5 ${typeof c === 'number' ? 'text-right' : ''}`}>{fmtCell(c)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {s.totalRows > s.rows.length && (
                    <p className="border-t border-line px-4 py-2 text-xs text-muted">Showing first {s.rows.length} of {fmtInt(s.totalRows)} rows.</p>
                  )}
                </div>
              ))
            )}
          </section>
        ))
      )}

      {!!history?.length && (
        <section className="overflow-x-auto rounded-xl border border-line bg-card">
          <h2 className="border-b border-line p-4 font-semibold">Upload history</h2>
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs text-muted">
              <tr>
                <th className="p-3">Uploaded</th>
                <th className="p-3">Report</th>
                <th className="p-3">Period</th>
                <th className="p-3">File</th>
                <th className="p-3 text-right">Rows</th>
                <th className="p-3">By</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap p-3">{fmtDateTime(h.uploadedAt)}</td>
                  <td className="p-3">{label(h.reportType)}{h.company ? <span className="block text-xs text-muted">{h.company}</span> : null}</td>
                  <td className="whitespace-nowrap p-3 text-xs">{h.periodFrom || h.periodTo ? `${fmtDate(h.periodFrom)} – ${fmtDate(h.periodTo)}` : '–'}</td>
                  <td className="p-3"><a href={`/files/${h.id}`} className="text-accent hover:underline">{h.fileName}</a><span className="block text-xs text-muted">{size(h.size)}{h.note ? ` · ${h.note}` : ''}</span></td>
                  <td className="p-3 text-right tabular-nums">{h.rowCount ? fmtInt(h.rowCount) : '–'}</td>
                  <td className="p-3">{h.uploadedBy.name}</td>
                  <td className="p-3 text-right">
                    {me?.role === 'admin' && (
                      <form action={deleteUpload}>
                        <input type="hidden" name="id" value={h.id} />
                        <input type="hidden" name="path" value={p.path} />
                        <button className="text-xs text-rose-600 hover:underline dark:text-rose-400">Delete</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
