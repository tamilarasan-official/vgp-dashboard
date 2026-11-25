'use client';

import { useActionState, useRef } from 'react';
import { uploadFile, type UploadState } from './actions';

type Props = {
  source: 'tally' | 'thoughtmetrics';
  reportTypes: { value: string; label: string }[];
  companies: string[];
  hint: string;
};

const field = 'mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent';

export function UploadForm({ source, reportTypes, companies, hint }: Props) {
  const [state, action, pending] = useActionState<UploadState, FormData>(async (prev, form) => {
    const r = await uploadFile(prev, form);
    if (r.ok) formRef.current?.reset();
    return r;
  }, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-semibold">Upload a report</h2>
      <p className="mb-4 text-xs text-muted">{hint}</p>
      <input type="hidden" name="source" value={source} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="text-muted">Report</span>
          <select name="reportType" className={field} required>
            {reportTypes.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
        {companies.length > 0 && (
          <label className="text-sm">
            <span className="text-muted">Company</span>
            <select name="company" className={field} required>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="text-muted">Period from</span>
          <input type="date" name="periodFrom" className={field} />
        </label>
        <label className="text-sm">
          <span className="text-muted">Period to</span>
          <input type="date" name="periodTo" className={field} />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_3fr_auto] sm:items-end">
        <label className="text-sm">
          <span className="text-muted">File (.xlsx, .xls, .csv, .pdf – max 15 MB)</span>
          <input type="file" name="file" accept=".xlsx,.xls,.csv,.pdf" required className={`${field} file:mr-3 file:rounded file:border-0 file:bg-subtle file:px-2 file:py-1`} />
        </label>
        <label className="text-sm">
          <span className="text-muted">Note (optional)</span>
          <input type="text" name="note" maxLength={300} className={field} />
        </label>
        <button type="submit" disabled={pending} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60">
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {state.error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{state.error}</p>}
      {state.ok && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>}
    </form>
  );
}
