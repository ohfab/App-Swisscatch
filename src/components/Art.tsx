/**
 * Grafische Bausteine im Tinte-und-Pfirsich-Stil:
 * tropfende Kanten und das Blob-Maskottchen «Blobi».
 */

const DRIP_PATH =
  'M0 0 L0 12 L28 12 C34 12 37 14 37 19 L37 31 A9 9 0 0 0 55 31 L55 19 C55 14 58 12 64 12 ' +
  'L116 12 C120 12 122 13 122 16 L122 20 A6 6 0 0 0 134 20 L134 16 C134 13 136 12 140 12 ' +
  'C165 12 175 19 190 19 C205 19 212 12 228 12 ' +
  'L244 12 C249 12 251 14 251 19 L251 31 A11 11 0 0 0 273 31 L273 19 C273 14 275 12 280 12 ' +
  'L325 12 C329 12 331 13 331 17 L331 24 A7 7 0 0 0 345 24 L345 17 C345 13 347 12 351 12 L400 12 L400 0 Z';

/** Tropfende Unterkante. Farbe über `color` (CSS currentColor). */
export function Drips({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg className={`drips ${flip ? 'flip' : ''} ${className}`} viewBox="0 0 400 46" preserveAspectRatio="none" aria-hidden="true">
      <path d={DRIP_PATH} fill="currentColor" />
      <circle className="drop d1" cx="46" cy="42" r="3.2" fill="currentColor" />
      <circle className="drop d2" cx="128" cy="30" r="2.6" fill="currentColor" />
      <circle className="drop d3" cx="262" cy="44" r="3.6" fill="currentColor" />
      <circle className="drop d4" cx="338" cy="35" r="2.8" fill="currentColor" />
    </svg>
  );
}

type BlobColor = 'ink' | 'peach' | 'white';

const BODY =
  'M18 60 C18 29 38 10 60 10 C82 10 102 29 102 60 L102 90 C102 97 97 99 94 95 C91 91 89 103 84 103 ' +
  'C78 103 79 91 74 91 C69 91 70 109 63 109 C56 109 58 94 53 94 C48 94 49 100 44 100 C38 100 40 89 35 89 ' +
  'C30 89 31 97 26 97 C21 97 18 93 18 88 Z';

/**
 * Blobi, das Maskottchen. Blinzelt und schaut umher.
 * `hiding`: Augen zu (Verstecker), `magnifier`: mit Lupe (Fänger).
 */
export function Blob({
  size = 96,
  color = 'ink',
  hiding = false,
  magnifier = false,
  className = '',
}: {
  size?: number;
  color?: BlobColor;
  hiding?: boolean;
  magnifier?: boolean;
  className?: string;
}) {
  const eye = color === 'white' ? 'var(--ink)' : '#fff';
  const pupil = color === 'white' ? '#fff' : 'var(--ink)';
  return (
    <svg className={`blob blob-${color} ${className}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <g className="blob-body">
        <path d={BODY} className="blob-fill" />
        {hiding ? (
          <g className="blob-closed" style={{ stroke: eye }} strokeWidth="4.5" strokeLinecap="round" fill="none">
            <path d="M36 54 Q45 46 54 54" />
            <path d="M66 54 Q75 46 84 54" />
          </g>
        ) : (
          <g className="blob-eyes">
            <ellipse cx="45" cy="52" rx="12" ry="13" style={{ fill: eye }} />
            <ellipse cx="75" cy="52" rx="12" ry="13" style={{ fill: eye }} />
            <g className="blob-pupils" style={{ fill: pupil }}>
              <circle cx="47" cy="54" r="6" />
              <circle cx="77" cy="54" r="6" />
            </g>
          </g>
        )}
        <ellipse cx="33" cy="70" rx="6" ry="4" className="blob-cheek" />
        <ellipse cx="87" cy="70" rx="6" ry="4" className="blob-cheek" />
        <path d="M53 72 Q60 79 67 72" style={{ stroke: eye }} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>
      {magnifier && (
        <g className="blob-magnifier">
          <line x1="99" y1="96" x2="112" y2="110" style={{ stroke: 'var(--ink)' }} strokeWidth="7" strokeLinecap="round" />
          <circle cx="91" cy="86" r="14" fill="rgba(255,255,255,0.55)" style={{ stroke: 'var(--ink)' }} strokeWidth="5" />
        </g>
      )}
    </svg>
  );
}
