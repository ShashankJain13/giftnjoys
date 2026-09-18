export type DateOrder = 'DMY' | 'MDY';

export interface ChatMessage {
  index: number;
  timestamp: Date;
  sender: string;
  text: string;
  /** Attachment file names referenced by the message (basename as found in the export). */
  attachments: string[];
  /** Count of omitted-media markers found in this message (usually 0 or 1, occasionally more). */
  mediaOmitted: number;
  system: boolean;
}

export interface ChatExport {
  chatFileName: string;
  chatText: string;
  /** basename → bytes */
  media: Map<string, Uint8Array>;
  warnings: string[];
}

export interface ExtractedFields {
  name?: string;
  description: string;
  price?: number;
  mrp?: number;
  moq?: number;
  colors: string[];
  sizes: string[];
  tags: string[];
  warnings: string[];
}

export interface CandidateImage {
  filename: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Uint8Array;
}

export interface CandidateVideo {
  filename: string;
  contentType: 'video/mp4' | 'video/quicktime';
  bytes: Uint8Array;
}

export interface ImportCandidate {
  postedAt: string;
  name?: string;
  description: string;
  price?: number;
  mrp?: number;
  moq?: number;
  colors: string[];
  sizes: string[];
  tags: string[];
  categoryId?: string;
  images: CandidateImage[];
  videos: CandidateVideo[];
  /** Referenced images that were omitted from the export or could not be used. */
  missingImages: number;
  rawText: string;
  sourceHash: string;
  confidence: number;
  warnings: string[];
}

export interface BuildOptions {
  dateOrder?: DateOrder | 'auto';
  groupWindowMinutes?: number;
  categoryKeywords?: Record<string, string[]>;
  maxImagesPerProduct?: number;
}

export interface BuildResult {
  messages: number;
  candidates: ImportCandidate[];
  warnings: string[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}
