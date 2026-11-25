'use server';

import { revalidatePath } from 'next/cache';
import { apiSend } from '@/lib/api';

export type UploadState = { ok?: string; error?: string };

const MAX_BYTES = 15 * 1024 * 1024;

export async function uploadFile(_prev: UploadState, form: FormData): Promise<UploadState> {
  const source = String(form.get('source') ?? '');
  if (!['tally', 'thoughtmetrics'].includes(source)) return { error: 'Unknown section.' };
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  if (file.size > MAX_BYTES) return { error: 'File is larger than 15 MB.' };
  if (!/\.(xlsx|xls|csv|pdf)$/i.test(file.name)) return { error: 'Only Excel (.xlsx / .xls), CSV or PDF files.' };

  const res = await apiSend<{ id: number; rowCount: number; readable: boolean }>('POST', `/uploads/${source}`, {
    fileName: file.name,
    contentBase64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    reportType: String(form.get('reportType') ?? 'other'),
    company: String(form.get('company') ?? '') || undefined,
    periodFrom: String(form.get('periodFrom') ?? '') || undefined,
    periodTo: String(form.get('periodTo') ?? '') || undefined,
    note: String(form.get('note') ?? '') || undefined,
  });
  if (!res.ok) return { error: (res.data as { message?: string }).message ?? `Upload failed (${res.status}).` };
  const d = res.data as { rowCount: number; readable: boolean };
  revalidatePath(source === 'tally' ? '/tally' : '/feedback');
  return { ok: d.readable ? `Uploaded – ${d.rowCount.toLocaleString('en-IN')} rows read.` : 'Uploaded – file saved (preview is available for .xlsx and .csv files).' };
}

export async function deleteUpload(form: FormData) {
  const id = Number(form.get('id'));
  const path = String(form.get('path') ?? '/tally');
  if (Number.isInteger(id)) await apiSend('DELETE', `/uploads/file/${id}`);
  revalidatePath(path);
}
