import { unzipSync } from 'fflate';
import { ImportError, type ChatExport } from './types';

export interface ExportLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}

export const DEFAULT_LIMITS: ExportLimits = {
  maxFiles: 5000,
  maxTotalBytes: 1024 * 1024 * 1024, // 1 GB uncompressed
  maxFileBytes: 64 * 1024 * 1024, // WhatsApp videos run larger than photos
};

const ALLOWED_EXTENSIONS = new Set(['.txt', '.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov']);

const isZip = (bytes: Uint8Array) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

function extension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function basename(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

function isUnsafePath(name: string): boolean {
  return name.startsWith('/') || name.includes('\\') || /^[a-z]:/i.test(name) || name.split('/').includes('..');
}

/**
 * Reads a WhatsApp export: either the .zip ("Export chat → Include media") or a bare .txt.
 * Only the chat text and image files are kept; everything is processed in memory (nothing written to disk).
 */
export function readChatExport(bytes: Uint8Array, limits: ExportLimits = DEFAULT_LIMITS): ChatExport {
  const decoder = new TextDecoder('utf-8');
  if (!isZip(bytes)) {
    return { chatFileName: 'chat.txt', chatText: decoder.decode(bytes), media: new Map(), warnings: [] };
  }

  const warnings: string[] = [];
  let count = 0;
  let total = 0;
  let skippedUnsafe = 0;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.name.endsWith('/')) return false;
        if (isUnsafePath(file.name)) {
          skippedUnsafe++;
          return false;
        }
        if (basename(file.name).startsWith('._') || file.name.startsWith('__MACOSX/')) return false;
        if (!ALLOWED_EXTENSIONS.has(extension(file.name))) return false;
        if (file.originalSize > limits.maxFileBytes) {
          warnings.push(`Skipped ${basename(file.name)}: larger than ${Math.round(limits.maxFileBytes / 1048576)} MB`);
          return false;
        }
        count++;
        total += file.originalSize;
        if (count > limits.maxFiles) throw new ImportError(`Export has more than ${limits.maxFiles} files`);
        if (total > limits.maxTotalBytes) throw new ImportError('Export is too large to process');
        return true;
      },
    });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError(`Could not read zip file: ${(err as Error).message}`);
  }
  if (skippedUnsafe) warnings.push(`Ignored ${skippedUnsafe} file(s) with unsafe paths`);

  const names = Object.keys(files);
  const chatName =
    names.find((n) => basename(n) === '_chat.txt') ??
    names.find((n) => /^whatsapp chat/i.test(basename(n)) && n.toLowerCase().endsWith('.txt')) ??
    names.find((n) => n.toLowerCase().endsWith('.txt'));
  if (!chatName) throw new ImportError('No chat .txt file found in the zip. Use WhatsApp "Export chat".');

  const media = new Map<string, Uint8Array>();
  for (const name of names) {
    if (name === chatName || extension(name) === '.txt') continue;
    media.set(basename(name), files[name]!);
  }

  return { chatFileName: basename(chatName), chatText: decoder.decode(files[chatName]!), media, warnings };
}

/** Detects image type from magic bytes (extensions in exports are not trusted). */
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

/** Detects video type from magic bytes (an MP4/MOV "ftyp" box, or the QuickTime "moov"/"mdat" atoms). */
export function sniffVideoType(bytes: Uint8Array): 'video/mp4' | 'video/quicktime' | undefined {
  if (bytes.length < 12) return undefined;
  const boxType = String.fromCharCode(...bytes.slice(4, 8));
  if (boxType !== 'ftyp') return undefined;
  const brand = String.fromCharCode(...bytes.slice(8, 12));
  return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
}
