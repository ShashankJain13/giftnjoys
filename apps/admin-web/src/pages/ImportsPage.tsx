import { formatDateTimeIST } from '@gnj/core/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileArchive, Smartphone, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, cx, type Tone } from '../components/ui';
import { api, errorMessage, uploadFile } from '../lib/api';
import type { ImportJobDto } from '../lib/types';

const STATUS_TONE: Record<ImportJobDto['status'], Tone> = { QUEUED: 'slate', PROCESSING: 'blue', DONE: 'green', FAILED: 'red' };

export function ImportsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number>();
  const [dragging, setDragging] = useState(false);

  const jobs = useQuery({
    queryKey: ['imports'],
    queryFn: () => api<{ items: ImportJobDto[] }>('/imports'),
    refetchInterval: (q) => (q.state.data?.items.some((j) => j.status === 'QUEUED' || j.status === 'PROCESSING') ? 2000 : false),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.zip') && !lower.endsWith('.txt')) throw new Error('Choose the .zip (or .txt) file exported from WhatsApp');
      setProgress(0);
      const { key } = await uploadFile(file, 'import', setProgress);
      return api<ImportJobDto>('/imports', { method: 'POST', body: { key, filename: file.name } });
    },
    onSuccess: (job) => {
      void qc.invalidateQueries({ queryKey: ['imports'] });
      navigate(`/imports/${job.id}`);
    },
    onSettled: () => setProgress(undefined),
  });

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload.mutate(file);
  };

  return (
    <>
      <PageHeader title="WhatsApp import" subtitle="Turn product posts from a WhatsApp group into draft products" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <button
            type="button"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            className={cx(
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-white px-6 py-12 text-center',
              dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400',
            )}
          >
            {upload.isPending ? (
              <>
                <Spinner />
                <span className="text-sm text-slate-600">
                  {progress !== undefined && progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Starting import…'}
                </span>
                {progress !== undefined && (
                  <div className="h-2 w-64 rounded bg-slate-200">
                    <div className="h-2 rounded bg-brand-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                )}
              </>
            ) : (
              <>
                <UploadCloud className="size-10 text-brand-500" />
                <span className="font-medium">Drop the WhatsApp export here, or click to choose</span>
                <span className="text-sm text-slate-500">.zip with media (recommended) or .txt · up to 200 MB</span>
              </>
            )}
          </button>
          <input ref={input} type="file" accept=".zip,.txt,application/zip,text/plain" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
          {upload.error && <Alert className="mt-3">{errorMessage(upload.error)}</Alert>}

          <Card title="Import history" className="mt-6" padded={false}>
            {jobs.isLoading ? (
              <div className="p-6 text-center">
                <Spinner />
              </div>
            ) : !jobs.data?.items.length ? (
              <EmptyState title="No imports yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {jobs.data.items.map((j) => (
                  <li key={j.id}>
                    <Link to={`/imports/${j.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <FileArchive className="size-5 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{j.filename}</div>
                        <div className="text-xs text-slate-500">
                          {formatDateTimeIST(j.createdAt)} · {j.createdBy}
                        </div>
                      </div>
                      {j.stats && (
                        <span className="text-xs text-slate-500">
                          {j.stats.created} new · {j.stats.duplicates} duplicate
                        </span>
                      )}
                      <Badge tone={STATUS_TONE[j.status]}>{j.status.toLowerCase()}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title={<span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" /> How to export a chat</span>}>
          <div className="space-y-4 text-sm text-slate-600">
            <div>
              <p className="font-medium text-slate-800">Android</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Open the group → tap ⋮ → More → Export chat</li>
                <li>Choose <strong>Include media</strong></li>
                <li>Save the .zip (e.g. to Drive or email it to yourself)</li>
              </ol>
            </div>
            <div>
              <p className="font-medium text-slate-800">iPhone</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Open the group → tap the group name</li>
                <li>Scroll down → Export Chat → <strong>Attach Media</strong></li>
                <li>Save to Files, then upload the .zip here</li>
              </ol>
            </div>
            <Alert tone="blue">
              Every post becomes a <strong>draft</strong>. Nothing goes live until you review and publish it. Posts already imported are skipped automatically.
            </Alert>
          </div>
        </Card>
      </div>
    </>
  );
}
