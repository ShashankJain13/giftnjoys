/** Simple original placeholder artwork (gradient + gift box + label) for seed data. */

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, maxChars - 1)}…`;
    return kept;
  }
  return lines;
}

export function productSvg(title: string, hue: number, variant = 0): string {
  const accent = (hue + 45) % 360;
  const lines = wrap(title, 22, 2);
  const text = lines
    .map(
      (l, i) =>
        `<text x="400" y="${640 + i * 52}" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="700" text-anchor="middle" fill="hsl(${hue},45%,22%)">${escapeXml(l)}</text>`,
    )
    .join('');
  const tilt = variant % 2 === 0 ? -6 : 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},85%,94%)"/><stop offset="1" stop-color="hsl(${accent},80%,84%)"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#bg)"/>
<circle cx="${variant % 2 ? 640 : 160}" cy="140" r="90" fill="hsl(${accent},90%,90%)" opacity="0.7"/>
<g transform="translate(400 330) rotate(${tilt})">
  <rect x="-150" y="-40" width="300" height="210" rx="18" fill="hsl(${hue},62%,56%)"/>
  <rect x="-172" y="-95" width="344" height="72" rx="14" fill="hsl(${hue},62%,47%)"/>
  <rect x="-20" y="-95" width="40" height="265" fill="hsl(${accent},88%,66%)"/>
  <path d="M0 -95 C -60 -170 -130 -130 -70 -95 Z M0 -95 C 60 -170 130 -130 70 -95 Z" fill="hsl(${accent},88%,60%)"/>
</g>
${text}
</svg>`;
}

export function categorySvg(title: string, hue: number): string {
  const accent = (hue + 30) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<defs><radialGradient id="c" cx="0.3" cy="0.3" r="0.9"><stop offset="0" stop-color="hsl(${hue},90%,93%)"/><stop offset="1" stop-color="hsl(${accent},75%,80%)"/></radialGradient></defs>
<rect width="600" height="600" fill="url(#c)"/>
<g transform="translate(300 260)">
  <rect x="-90" y="-20" width="180" height="130" rx="14" fill="hsl(${hue},60%,52%)"/>
  <rect x="-105" y="-60" width="210" height="48" rx="10" fill="hsl(${hue},60%,44%)"/>
  <rect x="-14" y="-60" width="28" height="170" fill="hsl(${accent},90%,70%)"/>
</g>
<text x="300" y="500" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="700" text-anchor="middle" fill="hsl(${hue},45%,22%)">${escapeXml(title)}</text>
</svg>`;
}
