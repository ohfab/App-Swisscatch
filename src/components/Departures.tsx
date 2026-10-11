import { useEffect, useState } from 'react';
import { lineKind, stationboard, type Departure, type Station } from '../lib/transport';
import { formatDistance } from '../lib/geo';
import { ChevronIcon } from './Icons';
import { stationEmoji } from './stationIcons';

// Fahrplanzeiten immer in Schweizer Zeit, egal wo das Handy eingestellt ist
const timeFmt = new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });

function Board({ station }: { station: Station }) {
  const [deps, setDeps] = useState<Departure[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    stationboard(station.id, ctrl.signal)
      .then(setDeps)
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setError('Abfahrten konnten nicht geladen werden.');
      });
    return () => ctrl.abort();
  }, [station.id]);

  if (error) return <p className="muted small">{error}</p>;
  if (!deps) return <p className="muted small">Lade Abfahrten …</p>;
  if (deps.length === 0) return <p className="muted small">Keine Abfahrten in nächster Zeit.</p>;
  return (
    <ul className="departures">
      {deps.map((d, i) => {
        const kind = lineKind(d.category);
        return (
          <li key={i}>
            <time>
              {timeFmt.format(d.time)}
              {d.delayMin > 0 && <span className="delay">+{d.delayMin}</span>}
            </time>
            <span className={`line line-${kind}`}>{d.line}</span>
            <span className="dest">{d.to}</span>
            {d.platform && (
              <span className="platform">
                {kind === 'train' || kind === 'sbahn' ? 'Gl.' : 'Kante'} {d.platform}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  stations: Station[];
  openId: string | null;
  onToggle: (station: Station) => void;
}

export function StationList({ stations, openId, onToggle }: Props) {
  return (
    <ul className="stations">
      {stations.map((s) => (
        <li key={s.id} className={openId === s.id ? 'open' : ''}>
          <button className="station-row" onClick={() => onToggle(s)} aria-expanded={openId === s.id}>
            <span className="station-emoji" aria-hidden="true">
              {stationEmoji(s.icon)}
            </span>
            <span className="station-name">{s.name}</span>
            {s.distance !== null && <span className="muted small">{formatDistance(s.distance)}</span>}
            <ChevronIcon size={18} className="chev" />
          </button>
          {openId === s.id && <Board station={s} />}
        </li>
      ))}
    </ul>
  );
}
