import { BottomSheet } from './BottomSheet';
import { CANTON_COLORS } from '../lib/config';
import { formatNumber } from '../lib/geo';
import type { CantonFeature } from '../lib/cantons';
import { MapIcon } from './Icons';

interface Props {
  canton: CantonFeature;
  onZoom: () => void;
  onNeighbor: (abbr: string) => void;
  onClose: () => void;
}

export function CantonSheet({ canton, onZoom, onNeighbor, onClose }: Props) {
  const c = canton.properties;
  const color = CANTON_COLORS[c.color % CANTON_COLORS.length];
  return (
    <BottomSheet
      label={`Kanton ${c.name}`}
      title={
        <span className="canton-title">
          <span className="canton-badge" style={{ background: color }}>
            {c.abbr}
          </span>
          {c.name}
        </span>
      }
      subtitle={`Kanton Nr. ${c.id} · ${c.languages.join(', ')}`}
      onClose={onClose}
    >
      <dl className="stats">
        <div>
          <dt>Hauptort</dt>
          <dd>{c.capital}</dd>
        </div>
        <div>
          <dt>Fläche</dt>
          <dd>{formatNumber(c.areaKm2)} km²</dd>
        </div>
        <div>
          <dt>Nachbarn</dt>
          <dd>{c.neighbors.length}</dd>
        </div>
      </dl>
      <div className="neighbors" aria-label="Nachbarkantone">
        {c.neighbors.map((abbr) => (
          <button key={abbr} className="chip" onClick={() => onNeighbor(abbr)}>
            {abbr}
          </button>
        ))}
      </div>
      <button className="wide-btn" onClick={onZoom}>
        <MapIcon size={18} />
        Ganzen Kanton zeigen
      </button>
    </BottomSheet>
  );
}
