import { KIND_COLOR, type LineColor, type LineKind } from '../lib/transport';

interface Props {
  line: string;
  kind: LineKind;
  color: LineColor | null;
  small?: boolean;
}

/** Linien-Abzeichen in den Originalfarben (z.B. rot für IC, blau für S-Bahn) */
export function LineBadge({ line, kind, color, small }: Props) {
  const c = color ?? KIND_COLOR[kind];
  // Sehr helle Hintergründe (z.B. gelbe Trams) bekommen einen Rand
  const light = /^#(f|e)[0-9a-f]{2}/i.test(c.bg) || /^#fff/i.test(c.bg);
  return (
    <span
      className={`line ${small ? 'small' : ''}`}
      style={{ background: c.bg, color: c.fg, boxShadow: light ? 'inset 0 0 0 1px rgba(0,0,0,.18)' : undefined }}
    >
      {line}
    </span>
  );
}
