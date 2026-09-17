import { Trash2, Video as VideoIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorMessage, uploadFile } from '../lib/api';
import type { UploadedImage } from './ImageUploader';
import { Alert } from './ui';

const ACCEPT = 'video/mp4,video/quicktime';

export function VideoUploader({
  videos,
  onChange,
  max = 1,
}: {
  videos: UploadedImage[];
  onChange: (videos: UploadedImage[]) => void;
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number }>();
  const [error, setError] = useState<string>();

  async function addFile(file: File) {
    setError(undefined);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Choose an MP4 or MOV video');
      return;
    }
    if (file.size > 64 * 1024 * 1024) {
      setError('Video is larger than 64 MB');
      return;
    }
    setUploading({ name: file.name, progress: 0 });
    try {
      const { key, publicUrl } = await uploadFile(file, 'product-video', (p) => setUploading({ name: file.name, progress: p }));
      onChange([...videos, { key, url: publicUrl ?? '' }].slice(0, max));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(undefined);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {videos.map((v) => (
          <div key={v.key} className="group relative aspect-video overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
            <video src={v.url} className="size-full object-cover" muted playsInline preload="metadata" />
            <button
              type="button"
              aria-label="Remove video"
              onClick={() => onChange(videos.filter((x) => x.key !== v.key))}
              className="absolute top-1 right-1 rounded bg-slate-900/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {uploading && (
          <div className="flex aspect-video flex-col items-center justify-center rounded-lg bg-slate-50 p-2 text-center text-xs text-slate-500 ring-1 ring-slate-200">
            <span className="line-clamp-2 break-all">{uploading.name}</span>
            <div className="mt-2 h-1.5 w-full rounded bg-slate-200">
              <div className="h-1.5 rounded bg-brand-500" style={{ width: `${Math.round(uploading.progress * 100)}%` }} />
            </div>
          </div>
        )}
        {videos.length < max && !uploading && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-slate-400"
          >
            <VideoIcon className="size-5" />
            Add video
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addFile(file);
          e.target.value = '';
        }}
      />
      {error && <Alert className="mt-2">{error}</Alert>}
      {videos.length === 0 && !uploading && (
        <p className="mt-1 text-xs text-slate-500">Optional. A short demo clip (MP4/MOV, up to 64 MB).</p>
      )}
    </div>
  );
}
