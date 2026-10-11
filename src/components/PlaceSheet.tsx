import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { ClockIcon, CopyIcon, MountainIcon, PinIcon, RulerIcon, ShareIcon, TrainIcon, TrashIcon, FlagIcon } from './Icons';
import { StationList } from './Departures';
import { findCanton, type CantonFeature } from '../lib/cantons';
import { fetchHeight } from '../lib/geoadmin';
import { distanceMeters, formatDistance, formatLv95, formatNumber, formatWgs84 } from '../lib/geo';
import { nearbyStations, TIMETABLE_CREDIT, type Station } from '../lib/transport';
import { shareLink, type Place } from '../lib/place';
import { PIN_COLORS, type Pin } from '../hooks/usePins';
import type { Position } from '../hooks/useGeolocation';

interface Props {
  place: Place;
  pin: Pin | null;
  position: Position | null;
  stations: Station[];
  openStationId: string | null;
  onStations: (stations: Station[]) => void;
  onToggleStation: (station: Station) => void;
  onSavePin: (name: string) => void;
  onUpdatePin: (id: string, patch: Partial<Pin>) => void;
  onRemovePin: (id: string) => void;
  onShowCanton: (canton: CantonFeature) => void;
  onRoute: (title: string) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PlaceSheet(props: Props) {
  const { place, pin, position } = props;
  const [canton, setCanton] = useState<CantonFeature | null | undefined>(undefined);
  const [height, setHeight] = useState<number | null | undefined>(undefined);
  const [stationState, setStationState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [name, setName] = useState(pin?.name ?? '');
  const transitRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setName(pin?.name ?? ''), [pin?.id, pin?.name]);

  useEffect(() => {
    const ctrl = new AbortController();
    setCanton(undefined);
    setHeight(undefined);
    findCanton(place).then(
      (c) => !ctrl.signal.aborted && setCanton(c),
      () => !ctrl.signal.aborted && setCanton(null),
    );
    fetchHeight(place, ctrl.signal).then(
      (h) => setHeight(h),
      () => !ctrl.signal.aborted && setHeight(null),
    );
    return () => ctrl.abort();
  }, [place.lat, place.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStations = () => {
    setStationState('loading');
    nearbyStations(place)
      .then((s) => {
        props.onStations(s);
        setStationState('idle');
        // Liste ins Blickfeld scrollen, sobald sie gerendert ist
        requestAnimationFrame(() =>
          requestAnimationFrame(() => transitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })),
        );
      })
      .catch(() => setStationState('error'));
  };

  const outside = canton === null;
  const title = pin ? pin.name : (place.title ?? (place.source === 'me' ? 'Mein Standort' : 'Markierter Punkt'));
  const subtitleParts = [
    place.subtitle,
    canton ? `Kanton ${canton.properties.name}` : outside ? 'Ausserhalb der Schweiz' : null,
    height != null && !outside ? `${formatNumber(Math.round(height))} m ü. M.` : null,
  ].filter(Boolean);
  const dist = position && place.source !== 'me' ? distanceMeters(position, place) : null;

  const share = async () => {
    const url = shareLink(place.lat, place.lng);
    const text = `${title} – ${formatWgs84(place)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    props.onToast((await copy(`${text}\n${url}`)) ? 'Link kopiert' : 'Teilen nicht möglich');
  };

  const commitName = () => {
    if (!pin) return;
    const trimmed = name.trim();
    if (trimmed && trimmed !== pin.name) props.onUpdatePin(pin.id, { name: trimmed });
    else setName(pin.name);
  };

  return (
    <BottomSheet
      label={title}
      title={
        pin ? (
          <input
            className="title-input"
            value={name}
            aria-label="Name des Pins"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            maxLength={40}
          />
        ) : (
          title
        )
      }
      subtitle={subtitleParts.join(' · ') || '…'}
      onClose={props.onClose}
    >
      <div className="actions">
        {pin ? (
          <button
            className="action danger"
            onClick={() => {
              props.onRemovePin(pin.id);
              props.onToast('Pin gelöscht');
            }}
          >
            <TrashIcon size={20} />
            Löschen
          </button>
        ) : (
          <button className="action primary" onClick={() => props.onSavePin(place.title ?? (place.source === 'me' ? 'Mein Standort' : ''))}>
            <PinIcon size={20} />
            Pin setzen
          </button>
        )}
        <button className="action" onClick={share}>
          <ShareIcon size={20} />
          Teilen
        </button>
        {place.source !== 'me' && (
          <button className="action" onClick={() => props.onRoute(title)}>
            <TrainIcon size={20} />
            Route hierher
          </button>
        )}
        <button className="action" onClick={loadStations} disabled={stationState === 'loading'}>
          <ClockIcon size={20} />
          Abfahrten
        </button>
      </div>

      {pin && (
        <div className="color-row" role="radiogroup" aria-label="Farbe">
          {PIN_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={pin.color === c}
              aria-label={`Farbe ${c}`}
              className={`color-dot ${pin.color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => props.onUpdatePin(pin.id, { color: c })}
            />
          ))}
        </div>
      )}

      <dl className="facts">
        <div>
          <dt>
            <MountainIcon size={16} /> Höhe
          </dt>
          <dd>{height === undefined ? '…' : height === null || outside ? '–' : `${formatNumber(Math.round(height))} m ü. M.`}</dd>
        </div>
        <div>
          <dt>
            <FlagIcon size={16} /> Kanton
          </dt>
          <dd>
            {canton === undefined ? (
              '…'
            ) : canton ? (
              <button className="link" onClick={() => props.onShowCanton(canton)}>
                {canton.properties.name} ({canton.properties.abbr})
              </button>
            ) : (
              'Ausland'
            )}
          </dd>
        </div>
        {dist !== null && (
          <div>
            <dt>
              <RulerIcon size={16} /> Luftlinie zu dir
            </dt>
            <dd>{formatDistance(dist)}</dd>
          </div>
        )}
        <div className="full">
          <dt>
            <CopyIcon size={16} /> Koordinaten (antippen zum Kopieren)
          </dt>
          <dd>
            <button
              className="link mono"
              onClick={async () => props.onToast((await copy(formatLv95(place))) ? 'LV95-Koordinaten kopiert' : 'Kopieren nicht möglich')}
              title="LV95 kopieren"
            >
              {formatLv95(place)}
            </button>
            <button
              className="link mono small"
              onClick={async () => props.onToast((await copy(formatWgs84(place))) ? 'GPS-Koordinaten kopiert' : 'Kopieren nicht möglich')}
              title="WGS84 kopieren"
            >
              {formatWgs84(place)}
            </button>
          </dd>
        </div>
      </dl>

      {(props.stations.length > 0 || stationState !== 'idle') && (
        <>
          <h3 className="section-title" ref={transitRef}>
            ÖV in der Nähe
          </h3>
          {stationState === 'loading' && <p className="muted small">Suche Haltestellen …</p>}
          {stationState === 'error' && <p className="muted small">Fahrplan nicht erreichbar – bist du online?</p>}
          <StationList stations={props.stations} openId={props.openStationId} onToggle={props.onToggleStation} />
          <p className="fine-print">{TIMETABLE_CREDIT}</p>
        </>
      )}
    </BottomSheet>
  );
}
