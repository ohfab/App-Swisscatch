/**
 * Grafische Bausteine im Tinte-und-Pfirsich-Stil:
 * tropfende Kanten und Geisti, der Geist von Zeitgeist.
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

export type GhostMood = 'happy' | 'cheer' | 'wink' | 'sad' | 'surprised' | 'think' | 'sleep' | 'hide' | 'love' | 'cool';
export type GhostColor = 'white' | 'peach';

const GHOST_BODY =
  'M24 56 C24 32 40 15 60 15 C80 15 96 32 96 56 C96 72 98 84 101 95 A10.25 10.25 0 0 1 80.5 95 A10.25 10.25 0 0 1 60 95 A10.25 10.25 0 0 1 39.5 95 A10.25 10.25 0 0 1 19 95 C22 84 24 72 24 56 Z';
const HEART = (x: number, y: number) => `M${x} ${y + 6} C${x - 9} ${y} ${x - 7} ${y - 7} ${x} ${y - 3} C${x + 7} ${y - 7} ${x + 9} ${y} ${x} ${y + 6} Z`;

/**
 * Geisti, der Geist von Zeitgeist. Schwebt, blinzelt und schaut umher.
 * `mood` bestimmt das Gesicht, dazu Lupe (Fänger), Partyhut und Winken.
 * `talking` bewegt den Mund (beim Sprechen in der Einführung).
 */
export function Ghost({
  size = 96,
  mood = 'happy',
  color = 'white',
  magnifier = false,
  party = false,
  wave = false,
  talking = false,
  shadow = true,
  className = '',
}: {
  size?: number;
  mood?: GhostMood;
  color?: GhostColor;
  magnifier?: boolean;
  party?: boolean;
  wave?: boolean;
  talking?: boolean;
  shadow?: boolean;
  className?: string;
}) {
  const ink = { fill: 'var(--ink)' };
  const line = { stroke: 'var(--ink)', strokeWidth: 3.2, strokeLinecap: 'round' as const, fill: 'none' };
  const armsUp = mood === 'cheer';
  const openEyes = !['wink', 'sleep', 'hide', 'love', 'cool'].includes(mood);

  let mouth;
  if (mood === 'cheer' || mood === 'love') {
    mouth = (
      <g>
        <path d="M52 64 Q60 78 68 64 Z" style={ink} strokeLinejoin="round" />
        <ellipse cx="60" cy="70.5" rx="4" ry="2.4" className="ghost-tongue" />
      </g>
    );
  } else if (mood === 'sad') mouth = <path d="M54 71 Q60 65 66 71" style={line} />;
  else if (mood === 'surprised') mouth = <ellipse cx="60" cy="69" rx="4" ry="5" style={ink} />;
  else if (mood === 'think') mouth = <path d="M56 69 Q61 67 66 68" style={line} />;
  else if (mood === 'sleep') mouth = <ellipse cx="60" cy="68" rx="2.6" ry="2" style={ink} />;
  else mouth = <path d="M53 65 Q60 72 67 65" style={line} />;

  return (
    <svg className={`ghost ghost-${color} mood-${mood} ${className}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      {shadow && <ellipse className="ghost-shadow" cx="60" cy="114" rx="22" ry="4" />}
      <g className="ghost-float">
        {party && (
          <g className="ghost-hat">
            <path d="M48 22 L60 -6 L72 22 Z" fill="var(--peach)" style={{ stroke: 'var(--ink)' }} strokeWidth="3" strokeLinejoin="round" />
            <path d="M53 11 L67 11 M50.5 17 L69.5 17" style={{ stroke: 'var(--ink)' }} strokeWidth="2.4" />
            <circle cx="60" cy="-7" r="4.5" fill="#fff" style={{ stroke: 'var(--ink)' }} strokeWidth="2.5" />
          </g>
        )}
        {/* Arme hinter dem Körper */}
        <g className="ghost-arms">
          <ellipse className="ghost-fill" cx={armsUp ? 16 : 22} cy={armsUp ? 52 : 70} rx="8" ry="5.5" transform={`rotate(${armsUp ? 35 : -25} ${armsUp ? 16 : 22} ${armsUp ? 52 : 70})`} />
          <g className={wave ? 'ghost-wave' : ''}>
            <ellipse
              className="ghost-fill"
              cx={armsUp || wave ? 104 : 98}
              cy={armsUp || wave ? 52 : 70}
              rx="8"
              ry="5.5"
              transform={`rotate(${armsUp || wave ? -35 : 25} ${armsUp || wave ? 104 : 98} ${armsUp || wave ? 52 : 70})`}
            />
          </g>
        </g>
        <path d={GHOST_BODY} className="ghost-fill ghost-body" />
        <g className="ghost-face">
          {mood === 'sad' && (
            <g style={line} strokeWidth="2.6">
              <path d="M41 45 L53 41.5" />
              <path d="M79 45 L67 41.5" />
            </g>
          )}
          {mood === 'think' && <path d="M66 40 Q72 36 79 40" style={line} strokeWidth="2.6" />}
          {openEyes && (
            <g className="ghost-eyes">
              <g className={mood === 'think' ? 'ghost-look-up' : 'ghost-look'}>
                <ellipse cx="47.5" cy="53" rx="7.4" ry={mood === 'surprised' ? 11 : 9.6} style={ink} />
                <ellipse cx="72.5" cy="53" rx="7.4" ry={mood === 'surprised' ? 11 : 9.6} style={ink} />
                <circle cx="50.3" cy="49" r="2.9" fill="#fff" />
                <circle cx="75.3" cy="49" r="2.9" fill="#fff" />
                <circle cx="45" cy="57.5" r="1.3" fill="#fff" opacity="0.7" />
                <circle cx="70" cy="57.5" r="1.3" fill="#fff" opacity="0.7" />
              </g>
            </g>
          )}
          {mood === 'wink' && (
            <>
              <path d="M42 55 Q48 49 54 55" style={line} />
              <ellipse cx="72.5" cy="53" rx="7.4" ry="9.6" style={ink} />
              <circle cx="75.3" cy="49" r="2.9" fill="#fff" />
            </>
          )}
          {(mood === 'hide' || mood === 'sleep') && (
            <g style={line}>
              <path d={mood === 'hide' ? 'M42 55 Q48 49 54 55' : 'M42 53 Q48 58 54 53'} />
              <path d={mood === 'hide' ? 'M66 55 Q72 49 78 55' : 'M66 53 Q72 58 78 53'} />
            </g>
          )}
          {mood === 'love' && (
            <g className="ghost-hearts" fill="var(--red)">
              <path d={HEART(48, 53)} />
              <path d={HEART(72, 53)} />
            </g>
          )}
          {mood === 'cool' && (
            <g>
              <path d="M38 48 H82" style={line} strokeWidth="3" />
              <rect x="38" y="47" width="19" height="12" rx="5" style={ink} />
              <rect x="63" y="47" width="19" height="12" rx="5" style={ink} />
              <path d="M42 51 L47 51" stroke="var(--peach)" strokeWidth="2" strokeLinecap="round" />
              <path d="M67 51 L72 51" stroke="var(--peach)" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}
          <ellipse cx="38" cy="66" rx="5.5" ry="3.4" className="ghost-cheek" />
          <ellipse cx="82" cy="66" rx="5.5" ry="3.4" className="ghost-cheek" />
          {talking ? (
            <g className="ghost-talk">
              <path className="ghost-talk-a" d="M53 65 Q60 72 67 65" style={line} />
              <path className="ghost-talk-b" d="M54 64 Q60 75 66 64 Z" style={ink} />
            </g>
          ) : (
            mouth
          )}
          {mood === 'sad' && <path className="ghost-tear" d="M37 60 C34 65 34 68 37 68 C40 68 40 65 37 60 Z" fill="#7cc4ff" />}
        </g>
        {mood === 'sleep' && (
          <g className="ghost-zz" style={ink} fontFamily="var(--font)" fontWeight="800">
            <text x="92" y="22" fontSize="14">z</text>
            <text x="102" y="10" fontSize="10">z</text>
          </g>
        )}
        {magnifier && (
          <g className="ghost-magnifier">
            <line x1="100" y1="94" x2="113" y2="108" style={{ stroke: 'var(--ink)' }} strokeWidth="7" strokeLinecap="round" />
            <circle cx="92" cy="84" r="14" fill="rgba(255,255,255,0.55)" style={{ stroke: 'var(--ink)' }} strokeWidth="5" />
          </g>
        )}
      </g>
    </svg>
  );
}
