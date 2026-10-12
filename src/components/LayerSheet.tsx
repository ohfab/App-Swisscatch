import { BASEMAPS, OVERLAYS, type BasemapId, type OverlayId } from '../lib/config';
import { BottomSheet } from './BottomSheet';
import { CheckIcon, DownloadIcon } from './Icons';

interface Props {
  basemap: BasemapId;
  overlays: Record<OverlayId, boolean>;
  onBasemap: (id: BasemapId) => void;
  onToggleOverlay: (id: OverlayId) => void;
  onOpenApp: () => void;
  onClose: () => void;
}

export function LayerSheet({ basemap, overlays, onBasemap, onToggleOverlay, onOpenApp, onClose }: Props) {
  return (
    <BottomSheet title="Karte & Ebenen" label="Karte und Ebenen" onClose={onClose}>
      <h3 className="section-title">Grundkarte</h3>
      <div className="basemap-grid">
        {BASEMAPS.map((b) => (
          <button
            key={b.id}
            className={`basemap ${basemap === b.id ? 'active' : ''}`}
            onClick={() => onBasemap(b.id)}
            aria-pressed={basemap === b.id}
          >
            <span className="swatch" style={{ background: b.swatch }}>
              {basemap === b.id && <CheckIcon size={18} />}
            </span>
            <span>{b.label}</span>
          </button>
        ))}
      </div>
      <h3 className="section-title">Zusätzliche Ebenen</h3>
      <ul className="toggle-list">
        {OVERLAYS.map((o) => (
          <li key={o.id}>
            <label className="toggle-row">
              <span>
                <strong>{o.label}</strong>
                <small>{o.description}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={overlays[o.id]}
                onChange={() => onToggleOverlay(o.id)}
              />
              <span className="switch" aria-hidden="true" />
            </label>
          </li>
        ))}
      </ul>
      <button className="wide-btn secondary layers-app-btn" onClick={onOpenApp}>
        <DownloadIcon size={18} /> App herunterladen
      </button>
      <p className="fine-print">
        Karten und Daten: © swisstopo, BAV, BFS. Kacheln, die du einmal angeschaut hast, bleiben offline verfügbar.
      </p>
    </BottomSheet>
  );
}
