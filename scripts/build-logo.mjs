// Erzeugt das Zeitgeist-Logo: Geisti mit zwei Nachbildern (die Zeit zieht vorbei).
// Schreibt die SVG-Icons in public/icons und die Android-Vektoren in native/android/res.
// Danach mit «npm run icons» die PNG-Dateien rendern.
import { writeFileSync } from 'node:fs';

const INK = '#1F1C35';
const PEACH = '#F9B07E';
const PLUM = '#5B4A6B';
const BODY =
  'M24 56 C24 32 40 15 60 15 C80 15 96 32 96 56 C96 72 98 84 101 95 A10.25 10.25 0 0 1 80.5 95 A10.25 10.25 0 0 1 60 95 A10.25 10.25 0 0 1 39.5 95 A10.25 10.25 0 0 1 19 95 C22 84 24 72 24 56 Z';
const EYES = [
  [47.5, 53],
  [72.5, 53],
];
const ellipse = (cx, cy, rx, ry) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
const EYE_PATH = EYES.map(([x, y]) => ellipse(x, y, 7.6, 9.8)).join(' ');
const SHINE_PATH = EYES.map(([x, y]) => ellipse(x + 2.8, y - 4, 3, 3)).join(' ');
const CHEEK_PATH = [ellipse(37.5, 66, 5.6, 3.5), ellipse(82.5, 66, 5.6, 3.5)].join(' ');
const MOUTH = 'M53 65 Q60 72.5 67 65';
const ECHOES = [
  { dx: -34, dy: 9, color: PLUM },
  { dx: -17, dy: 4.5, color: PEACH },
];

// ---------- SVG ----------
function svgMark(scale, cx, cy, rot = -8) {
  const tx = (cx - 60 * scale).toFixed(1);
  const ty = (cy - 60 * scale).toFixed(1);
  const echoes = ECHOES.map((e) => `<path transform="translate(${e.dx} ${e.dy})" d="${BODY}" fill="${e.color}"/>`).join('');
  return (
    `<g transform="rotate(${rot} ${cx} ${cy}) translate(${tx} ${ty}) scale(${scale})">${echoes}` +
    `<path d="${BODY}" fill="#FFFFFF"/><path d="${EYE_PATH}" fill="${INK}"/><path d="${SHINE_PATH}" fill="#FFFFFF"/>` +
    `<path d="${CHEEK_PATH}" fill="${PEACH}"/><path d="${MOUTH}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/></g>`
  );
}
const svg = (bg, mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n  ${bg}\n  ${mark}\n</svg>\n`;
writeFileSync('public/icons/icon.svg', svg(`<rect width="512" height="512" rx="116" fill="${INK}"/>`, svgMark(3.25, 282, 262)));
writeFileSync('public/icons/icon-maskable.svg', svg(`<rect width="512" height="512" fill="${INK}"/>`, svgMark(2.45, 278, 262)));
// Rundes Symbol für alte Android-Versionen
writeFileSync('public/icons/icon-round.svg', svg(`<circle cx="256" cy="256" r="256" fill="${INK}"/>`, svgMark(2.7, 280, 262)));

// ---------- Android-Vektoren ----------
const head = (size, viewport) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="${size}dp"\n    android:height="${size}dp"\n    android:viewportWidth="${viewport}"\n    android:viewportHeight="${viewport}">\n`;
function vectorGroup(scale, cx, cy, rot, inner) {
  return (
    `    <group android:rotation="${rot}" android:pivotX="${cx}" android:pivotY="${cy}">\n` +
    `        <group android:translateX="${(cx - 60 * scale).toFixed(3)}" android:translateY="${(cy - 60 * scale).toFixed(3)}" android:scaleX="${scale}" android:scaleY="${scale}">\n` +
    inner +
    `        </group>\n    </group>\n`
  );
}
const p = (d, attrs) => `            <path ${attrs} android:pathData="${d}" />\n`;
const echoGroups = (fill) =>
  ECHOES.map(
    (e, i) =>
      `            <group android:translateX="${e.dx}" android:translateY="${e.dy}">\n    ${p(BODY, fill(e, i))}            </group>\n`,
  ).join('');

// Farbiger Vordergrund des adaptiven Symbols (sichere Zone: 66 dp von 108 dp)
const fg =
  head(108, 108) +
  vectorGroup(
    0.4,
    56,
    55,
    -8,
    echoGroups((e) => `android:fillColor="${e.color}"`) +
      p(BODY, 'android:fillColor="#FFFFFF"') +
      p(EYE_PATH, `android:fillColor="${INK}"`) +
      p(SHINE_PATH, 'android:fillColor="#FFFFFF"') +
      p(CHEEK_PATH, `android:fillColor="${PEACH}"`) +
      p(MOUTH, `android:strokeColor="${INK}" android:strokeWidth="3.4" android:strokeLineCap="round"`),
  ) +
  '</vector>\n';
// Einfarbig (Android 13 «Designsymbole»): Augen als Löcher
const mono =
  head(108, 108) +
  vectorGroup(
    0.4,
    56,
    55,
    -8,
    echoGroups((_, i) => `android:fillColor="#FFFFFF" android:fillAlpha="${i === 0 ? 0.3 : 0.6}"`) +
      p(`${BODY} ${EYE_PATH}`, 'android:fillColor="#FFFFFF" android:fillType="evenOdd"'),
  ) +
  '</vector>\n';
// Benachrichtigungssymbol: weisse Silhouette, 24 dp
const stat =
  head(24, 24) +
  vectorGroup(0.215, 12, 12.4, 0, p(`${BODY} ${EYE_PATH}`, 'android:fillColor="#FFFFFF" android:fillType="evenOdd"')) +
  '</vector>\n';
const res = 'native/android/res/drawable/';
writeFileSync(res + 'ic_launcher_fg.xml', fg.replace('<vector', '<!-- Zeitgeist-Logo, erzeugt von scripts/build-logo.mjs -->\n<vector'));
writeFileSync(res + 'ic_launcher_mono.xml', mono);
writeFileSync(res + 'ic_stat_zeitgeist.xml', stat);
console.log('Logo geschrieben');
