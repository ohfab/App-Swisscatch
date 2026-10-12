import { BottomSheet } from './BottomSheet';
import { Ghost } from './Art';
import { PlusIcon } from './Icons';
import { distanceMeters, formatDistance } from '../lib/geo';
import type { Pin } from '../hooks/usePins';
import type { Position } from '../hooks/useGeolocation';

interface Props {
  pins: Pin[];
  position: Position | null;
  onSelect: (pin: Pin) => void;
  onAddAtPosition: () => void;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short' });

export function PinsSheet({ pins, position, onSelect, onAddAtPosition, onClose }: Props) {
  const sorted = position
    ? [...pins].sort((a, b) => distanceMeters(position, a) - distanceMeters(position, b))
    : pins;

  return (
    <BottomSheet
      title="Meine Orte"
      label="Meine Orte"
      subtitle={pins.length === 0 ? 'Noch keine Pins' : `${pins.length} Pin${pins.length === 1 ? '' : 's'}${position ? ' · nach Distanz sortiert' : ''}`}
      onClose={onClose}
    >
      {position && (
        <div className="actions">
          <button className="action primary" onClick={onAddAtPosition}>
            <PlusIcon size={20} />
            Pin an meinem Standort
          </button>
        </div>
      )}
      {pins.length === 0 ? (
        <div className="empty">
          <Ghost size={90} mood="think" />
          <p>
            <strong>Lange auf die Karte drücken</strong> (am Computer: Rechtsklick), um einen Ort zu markieren und
            als Pin zu speichern – z.B. Treffpunkte oder Verstecke.
          </p>
        </div>
      ) : (
        <ul className="pin-list">
          {sorted.map((pin) => (
            <li key={pin.id}>
              <button onClick={() => onSelect(pin)}>
                <span className="pin-dot" style={{ background: pin.color }} />
                <span className="pin-text">
                  <strong>{pin.name}</strong>
                  <small>Gesetzt am {dateFmt.format(pin.createdAt)}</small>
                </span>
                {position && <span className="muted small">{formatDistance(distanceMeters(position, pin))}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
