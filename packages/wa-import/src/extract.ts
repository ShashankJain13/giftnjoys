import type { ExtractedFields } from './types';

const CURRENCY = String.raw`(?:₹|\brs\b\.?|\binr\b|\brupees?\b)`;
const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?`;
const SEP = String.raw`(?:\s*(?:[:=\-–@]|is)\s*|\s+)?`;

const MRP_RE = new RegExp(String.raw`\bm\.?\s?r\.?\s?p\.?${SEP}${CURRENCY}?\s*${NUM}`, 'gi');
const LABELLED_PRICE_RE = new RegExp(
  String.raw`(?:\b(?:offer\s*price|selling\s*price|sale\s*price|special\s*price|our\s*price|best\s*price|wholesale\s*price|price|rate|offer|cost)|@)${SEP}${CURRENCY}?\s*${NUM}` +
    String.raw`|\b(?:only|just|at)\s*${CURRENCY}\s*${NUM}`,
  'gi',
);
const CURRENCY_PREFIX_RE = new RegExp(String.raw`${CURRENCY}\s*${NUM}`, 'gi');
const CURRENCY_SUFFIX_RE = new RegExp(String.raw`${NUM}\s*(?:\/-|₹|\brs\b\.?|\brupees?\b|\binr\b)`, 'gi');
const MOQ_RE =
  /\b(?:moq|min(?:imum)?\.?\s*(?:order|qty|quantity))\s*(?:[:=\-–]|is|of)?\s*(\d{1,6})/i;
// Only matches an explicit "Colour: ..." / "Size: ..." label — sellers rarely phrase these any
// other way reliably enough to extract safely, so unlabelled mentions are left for the admin to fill in.
const COLOR_RE = /\bcolou?rs?\s*(?:available)?\s*[:\-]\s*([^\n#]{2,60})/i;
const SIZE_RE = /\bsizes?\s*(?:available)?\s*[:\-]\s*([^\n#]{2,60})/i;
const HASHTAG_RE = /#([\p{L}\p{N}_]{2,40})/gu;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const NAME_LABEL_RE = /^(?:product\s*name|item\s*name|product|item|name|title)\s*[:\-–]\s*/i;
const FILLER_LINE_RE =
  /^(?:new\s*(?:arrival|launch|stock)s?(?:\s*alert)?|new\s*product\s*alert|most\s*(?:in\s*)?demanding\s*product|we\s*are\s*excited\s*to\s*(?:launch|introduce|announce)(?:\s+our\s+latest\s+product)?|available(?:\s*now)?|in\s*stock|restocked|limited\s*stock(?:\s*available)?|hot\s*selling|best\s*sell(?:er|ing)|trending(?:\s*now)?|sale|offer|combo|wholesale|retail|dm\s*(?:for|to)\s*order|order\s*now|book\s*now|grab\s*(?:it|yours?)\s*now|don.t\s*miss\s*it|attention|good\s*news|exciting\s*news|big\s*news)[!.\s]*$/i;

function toNumber(intPart: string, fraction?: string): number {
  return Number(`${intPart.replace(/,/g, '')}${fraction ? `.${fraction}` : ''}`);
}

function allMatches(re: RegExp, text: string): Array<{ value: number; index: number; length: number }> {
  const out: Array<{ value: number; index: number; length: number }> = [];
  for (const m of text.matchAll(re)) {
    // The first numeric capture group pair present in the match
    const groups = m.slice(1);
    const intIdx = groups.findIndex((g) => g !== undefined);
    if (intIdx < 0) continue;
    const value = toNumber(groups[intIdx]!, groups[intIdx + 1]);
    if (Number.isFinite(value) && value > 0) out.push({ value, index: m.index ?? 0, length: m[0].length });
  }
  return out;
}

export function stripFormatting(line: string): string {
  return line
    .replace(EMOJI_RE, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/^[\s•▪►➡→✓✔☑\-–>|]+/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Masks MRP segments so they are not mistaken for the selling price. */
function maskMrp(text: string): string {
  return text.replace(MRP_RE, (s) => ' '.repeat(s.length));
}

export function hasPrice(text: string): boolean {
  const masked = maskMrp(text);
  return (
    new RegExp(MRP_RE.source, 'i').test(text) ||
    new RegExp(LABELLED_PRICE_RE.source, 'i').test(masked) ||
    new RegExp(CURRENCY_PREFIX_RE.source, 'i').test(masked) ||
    new RegExp(CURRENCY_SUFFIX_RE.source, 'i').test(masked)
  );
}

function removePriceSegments(line: string): string {
  return line
    .replace(new RegExp(MRP_RE.source, 'gi'), ' ')
    .replace(new RegExp(LABELLED_PRICE_RE.source, 'gi'), ' ')
    .replace(new RegExp(CURRENCY_PREFIX_RE.source, 'gi'), ' ')
    .replace(new RegExp(CURRENCY_SUFFIX_RE.source, 'gi'), ' ')
    .replace(new RegExp(MOQ_RE.source, 'gi'), ' ')
    .replace(HASHTAG_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:|@\-–/]+|[\s,;:|@\-–/]+$/g, '')
    .trim();
}

function letterCount(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length;
}

export function extractFields(text: string): ExtractedFields {
  const warnings: string[] = [];

  const mrps = allMatches(new RegExp(MRP_RE.source, 'gi'), text);
  let mrp = mrps[0]?.value;

  const masked = maskMrp(text);
  let prices = allMatches(new RegExp(LABELLED_PRICE_RE.source, 'gi'), masked);
  if (!prices.length) prices = allMatches(new RegExp(CURRENCY_PREFIX_RE.source, 'gi'), masked);
  if (!prices.length) prices = allMatches(new RegExp(CURRENCY_SUFFIX_RE.source, 'gi'), masked);
  let price = prices[0]?.value;

  const distinct = [...new Set(prices.map((p) => p.value))];
  if (distinct.length > 1) warnings.push(`Multiple prices found (${distinct.join(', ')}); using ${price}`);
  if (price === undefined && mrp !== undefined) {
    price = mrp;
    warnings.push('Only MRP found; price set to MRP');
  }
  if (price !== undefined && mrp !== undefined && price > mrp) {
    warnings.push(`Price ${price} is higher than MRP ${mrp}; MRP ignored`);
    mrp = undefined;
  }
  if (price === undefined) warnings.push('No price found');

  const moqMatch = MOQ_RE.exec(text);
  const moq = moqMatch ? Number(moqMatch[1]) : undefined;

  const trimLabelValue = (v: string) => v.replace(/[.!\s]+$/, '').trim();
  // Sellers list several options on one label line, e.g. "Colours: Red, Blue & Multicolor" or
  // "Size - S/M/L" — split on the common separators so each option becomes its own value.
  const splitOptions = (v: string): string[] =>
    [...new Set(v.split(/\s*(?:,|\/|&|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean))];
  const colorMatch = COLOR_RE.exec(text);
  const colors = colorMatch ? splitOptions(trimLabelValue(colorMatch[1]!)) : [];
  const sizeMatch = SIZE_RE.exec(text);
  const sizes = sizeMatch ? splitOptions(trimLabelValue(sizeMatch[1]!)) : [];

  const tags = [...new Set([...text.matchAll(HASHTAG_RE)].map((m) => m[1]!.toLowerCase()))];

  const lines = text.split('\n');
  let name: string | undefined;
  let nameLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const cleaned = stripFormatting(lines[i]!);
    if (!cleaned || FILLER_LINE_RE.test(cleaned)) continue;
    const candidate = removePriceSegments(cleaned.replace(NAME_LABEL_RE, ''));
    if (letterCount(candidate) < 3) continue;
    name = truncateWords(candidate, 120);
    nameLineIndex = i;
    break;
  }
  if (!name) warnings.push('No product name found');

  const description = lines
    .filter((_, i) => i !== nameLineIndex)
    .map((l) => stripFormatting(l))
    .filter((l) => l && letterCount(removePriceSegments(l)) >= 2 && !FILLER_LINE_RE.test(l))
    .map((l) => l.replace(HASHTAG_RE, '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);

  return {
    ...(name ? { name } : {}),
    description,
    ...(price !== undefined ? { price } : {}),
    ...(mrp !== undefined ? { mrp } : {}),
    ...(moq !== undefined ? { moq } : {}),
    colors,
    sizes,
    tags,
    warnings,
  };
}

function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Picks the category whose keywords appear most often in the text. */
export function guessCategory(text: string, keywords: Record<string, string[]> = {}): string | undefined {
  const haystack = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  let best: { id: string; hits: number } | undefined;
  for (const [id, words] of Object.entries(keywords)) {
    let hits = 0;
    for (const word of words) {
      const needle = ` ${word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
      if (needle.trim() && haystack.includes(needle)) hits++;
    }
    if (hits > 0 && (!best || hits > best.hits)) best = { id, hits };
  }
  return best?.id;
}
