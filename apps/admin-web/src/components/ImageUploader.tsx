import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorMessage, uploadFile, type UploadPurpose } from '../lib/api';
import { Alert, cx } from './ui';

export interface UploadedImage {
  key: string;
  url: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export function ImageUploader({
  images,
  onChange,
  max = 12,
  purpose = 'product-image',
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  max?: number;
  purpose?: UploadPurpose;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Array<{ name: string; progress: number }>>([]);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  async function addFiles(files: FileList | File[]) {
    setError(undefined);
    const list = [...files].filter((f) => ACCEPT.split(',').includes(f.type)).slice(0, max - images.length);
    if (list.length === 0) {
      setError(images.length >= max ? `You can add up to ${max} images` : 'Choose JPEG, PNG, WebP or GIF images');
      return;
    }
    setUploads(list.map((f) => ({ name: f.name, progress: 0 })));
    const results = await Promise.allSettled(
      list.map((file, i) =>
        uploadFile(file, purpose, (p) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, progress: p } : x)))),
      ),
    );
    const added = results.flatMap((r) => (r.status === 'fulfilled' ? [{ key: r.value.key, url: r.value.publicUrl ?? '' }] : []));
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length) setError(failed.map((f) => errorMessage(f.reason)).join('. '));
    onChange([...images, ...added]);
    setUploads([]);
  }

  const move = (from: number, to: number) => {
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {images.map((img, i) => (
          <div key={img.key} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
            <img src={img.url} alt="" className="size-full object-cover" />
            {i === 0 && <span className="absolute top-1 left-1 rounded bg-brand-600 px-1.5 text-[10px] font-semibold text-white">Cover</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-slate-900/60 p-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" aria-label="Move left" disabled={i === 0} onClick={() => move(i, i - 1)} className="rounded p-1 text-white disabled:opacity-30">
                <ArrowLeft className="size-3.5" />
              </button>
              <button type="button" aria-label="Make cover" disabled={i === 0} onClick={() => move(i, 0)} className="rounded p-1 text-white disabled:opacity-30">
                <Star className="size-3.5" />
              </button>
              <button type="button" aria-label="Move right" disabled={i === images.length - 1} onClick={() => move(i, i + 1)} className="rounded p-1 text-white disabled:opacity-30">
                <ArrowRight className="size-3.5" />
              </button>
              <button type="button" aria-label="Remove image" onClick={() => onChange(images.filter((_, j) => j !== i))} className="rounded p-1 text-red-200">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        {uploads.map((u) => (
          <div key={u.name} className="flex aspect-square flex-col items-center justify-center rounded-lg bg-slate-50 p-2 text-center text-xs text-slate-500 ring-1 ring-slate-200">
            <span className="line-clamp-2 break-all">{u.name}</span>
            <div className="mt-2 h-1.5 w-full rounded bg-slate-200">
              <div className="h-1.5 rounded bg-brand-500" style={{ width: `${Math.round(u.progress * 100)}%` }} />
            </div>
          </div>
        ))}
        {images.length + uploads.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={cx(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-slate-500',
              dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400',
            )}
          >
            <ImagePlus className="size-5" />
            Add images
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={max > 1}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {error && <Alert className="mt-2">{error}</Alert>}
    </div>
  );
}
