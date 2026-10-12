import { useCallback, useEffect, useRef, useState } from 'react';
import { bump } from '../lib/stats';
import L from 'leaflet';
import { BottomSheet } from './BottomSheet';
import { LineBadge } from './LineBadge';
import { CloseIcon, LocateIcon, MapIcon, PinIcon, SwapIcon, WalkIcon } from './Icons';
import { stationEmoji } from './stationIcons';
import {
  endpointQuery,
  findConnections,
  nearbyStations,
  laterThan,
  suggestPlaces,
  TIMETABLE_CREDIT,
  TIMETABLE_URL,
  type Connection,
  type Endpoint,
  type Leg,
  type Suggestion,
} from '../lib/transport';
import type { GeoStatus, Position } from '../hooks/useGeolocation';

export { ME, emptyPlan, zurichNow, type RoutePlan } from '../lib/routePlan';
import { ME, zurichNow, type RoutePlan } from '../lib/routePlan';

const naive = (s: string) => {
  const [d, t] = s.replace('T', ' ').split(' ') as [string, string];
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const [h, min] = t.split(':').map(Number) as [number, number];
  return Date.UTC(y, m - 1, day, h, min);
};

/** Minuten bis zu einer Abfahrt ("YYYY-MM-DD HH:MM:SS", Schweizer Zeit) */
function minutesUntil(raw: string): number {
  return Math.round((naive(raw) - naive(zurichNow())) / 60000);
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} Min` : `${h} h`;
}

const platformLabel = (leg: Leg, platform: string | null) =>
  platform ? `${leg.kind === 'train' || leg.kind === 'sbahn' ? 'Gl.' : 'Kante'} ${platform}` : null;

export function connectionBounds(c: Connection): L.LatLngBounds | null {
  const pts: L.LatLngTuple[] = [];
  for (const leg of c.legs)
    for (const p of [leg.from, ...leg.stops, leg.to]) if (p.lat !== null && p.lng !== null) pts.push([p.lat, p.lng]);
  return pts.length ? L.latLngBounds(pts) : null;
}

// ---------- Eingabefeld mit Vorschlägen ----------

interface PlaceInputProps {
  label: string;
  value: Endpoint | null;
  placeholder: string;
  marker: 'from' | 'to';
  onChange: (e: Endpoint | null) => void;
}

function PlaceInput({ label, value, placeholder, marker, onChange }: PlaceInputProps) {
  const [text, setText] = useState(value?.label ?? '');
  const [focused, setFocused] = useState(false);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => setText(value?.label ?? ''), [value]);

  useEffect(() => {
    const q = text.trim();
    if (!focused || q.length < 2 || q === value?.label) {
      setSugs([]);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      suggestPlaces(q, ctrl.signal).then(setSugs, () => undefined);
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [text, focused, value?.label]);

  const pick = (e: Endpoint) => {
    onChange(e);
    setText(e.label);
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className={`place-input ${focused ? 'focused' : ''}`}>
      <label className="pi-row">
        <span className={`pi-marker ${marker}`} aria-hidden="true" />
        <span className="visually-hidden">{label}</span>
        <input
          ref={inputRef}
          value={text}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            // kurz warten, damit ein Tipp auf einen Vorschlag noch ankommt
            window.setTimeout(() => {
              setFocused(false);
              setText(valueRef.current?.label ?? '');
            }, 150);
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && sugs[0]) pick(sugs[0].endpoint);
            if (e.key === 'Escape') inputRef.current?.blur();
          }}
        />
        {value && !focused && (
          <button
            type="button"
            className="icon-btn subtle small-btn"
            aria-label={`${label} leeren`}
            onClick={() => {
              onChange(null);
              setText('');
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={16} />
          </button>
        )}
      </label>
      {focused && (
        <ul className="suggestions" onPointerDown={(e) => e.preventDefault()}>
          {value?.kind !== 'me' && (
            <li>
              <button type="button" onClick={() => pick(ME)}>
                <span className="sug-icon me">
                  <LocateIcon size={16} />
                </span>
                <span className="sug-label">Mein Standort</span>
              </button>
            </li>
          )}
          {sugs.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button type="button" onClick={() => pick(s.endpoint)}>
                <span className="sug-icon">{s.icon === 'address' ? <PinIcon size={16} /> : stationEmoji(s.icon)}</span>
                <span className="sug-label">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Verbindungen ----------

function ConnectionDetail({ c }: { c: Connection }) {
  return (
    <ol className="timeline">
      {c.legs.map((leg, i) =>
        leg.kind === 'walk' ? (
          <li key={i} className="tl-walk">
            <WalkIcon size={18} />
            <span>
              Fussweg {formatDuration(leg.durationMin)}
              {i === c.legs.length - 1 && leg.to.name ? ` bis ${leg.to.name}` : ''}
            </span>
          </li>
        ) : (
          <li key={i} className="tl-ride" style={{ ['--line' as string]: leg.color?.bg ?? undefined }}>
            <div className="tl-stop">
              <time>{leg.from.time}</time>
              <strong>{leg.from.name}</strong>
              {platformLabel(leg, leg.from.platform) && <span className="platform">{platformLabel(leg, leg.from.platform)}</span>}
            </div>
            <div className="tl-info">
              <LineBadge line={leg.line ?? ''} kind={leg.kind} color={leg.color} small />
              <span>
                {leg.direction ? `Richtung ${leg.direction}` : ''}
                {leg.stops.length ? ` · ${leg.stops.length} Halt${leg.stops.length === 1 ? '' : 'e'}` : ''} ·{' '}
                {formatDuration(leg.durationMin)}
                {leg.delayMin ? <span className="delay-inline"> +{leg.delayMin}</span> : null}
              </span>
            </div>
            <div className="tl-stop">
              <time>{leg.to.time}</time>
              <strong>{leg.to.name}</strong>
              {platformLabel(leg, leg.to.platform) && <span className="platform">{platformLabel(leg, leg.to.platform)}</span>}
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

function ConnectionCard({
  c,
  selected,
  onSelect,
  onShowOnMap,
}: {
  c: Connection;
  selected: boolean;
  onSelect: () => void;
  onShowOnMap: () => void;
}) {
  const rides = c.legs.filter((l) => l.kind !== 'walk');
  const first = rides[0];
  const until = minutesUntil(c.departureRaw);
  const dayDiff = Math.round((naive(c.departureRaw.slice(0, 10) + ' 00:00') - naive(zurichNow().slice(0, 10) + ' 00:00')) / 86400000);
  const day =
    dayDiff === 0
      ? null
      : dayDiff === 1
        ? 'morgen'
        : new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(
            naive(c.departureRaw.slice(0, 10) + ' 00:00'),
          );
  const sub = [
    day,
    until >= 0 && until <= 90 ? (until === 0 ? 'jetzt' : `in ${until} Min`) : null,
    first ? platformLabel(first, first.from.platform)?.replace(/^/, 'ab ') : null,
    first?.from.name,
  ].filter(Boolean);
  return (
    <li className={`conn ${selected ? 'selected' : ''}`}>
      <button className="conn-head" onClick={onSelect} aria-expanded={selected}>
        <span className="conn-times">
          <strong>{c.departure}</strong>
          <span className="conn-bar" />
          <strong>{c.arrival}</strong>
        </span>
        <span className="conn-meta">
          {formatDuration(c.durationMin)} · {c.transfers === 0 ? 'direkt' : `${c.transfers} Umstieg${c.transfers === 1 ? '' : 'e'}`}
        </span>
        <span className="conn-legs">
          {rides.map((l, i) => (
            <LineBadge key={i} line={l.line ?? ''} kind={l.kind} color={l.color} small />
          ))}
        </span>
        {sub.length > 0 && <span className="conn-sub">{sub.join(' · ')}</span>}
      </button>
      {selected && (
        <>
          <ConnectionDetail c={c} />
          <button className="map-btn" onClick={onShowOnMap}>
            <MapIcon size={18} />
            Auf Karte zeigen
          </button>
        </>
      )}
    </li>
  );
}

// ---------- Sheet ----------

interface Props {
  plan: RoutePlan;
  onPlan: (update: (p: RoutePlan) => RoutePlan) => void;
  position: Position | null;
  geoStatus: GeoStatus;
  onStartGps: () => void;
  /** auto = nur einpassen, wenn über dem Sheet genug Karte sichtbar ist */
  onFit: (bounds: L.LatLngBounds, auto?: boolean) => void;
  onClose: () => void;
}

const cleanName = (s: string) => s.replace(/\s*\((Haltestelle|Adresse)\)$/, '');

export function RouteSheet({ plan, onPlan, position, geoStatus, onStartGps, onFit, onClose }: Props) {
  const [peek, setPeek] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  const resolve = useCallback(
    (e: Endpoint | null): string | null => {
      if (!e) return null;
      if (e.kind === 'me') return position ? `${position.lat.toFixed(6)},${position.lng.toFixed(6)}` : null;
      return endpointQuery(e);
    },
    [position],
  );

  const needsGps = (plan.from?.kind === 'me' || plan.to?.kind === 'me') && !position;

  const run = useCallback(
    async (append = false) => {
      const fromQ = resolve(plan.from);
      const toQ = resolve(plan.to);
      if (!fromQ || !toQ) return;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setLoading(true);
      setError(null);
      if (!append) setNote(null);
      const last = plan.result?.connections[plan.result.connections.length - 1];
      const opts =
        append && last
          ? { at: laterThan(last.departureRaw) }
          : plan.mode === 'now'
            ? {}
            : { at: plan.at, arrival: plan.mode === 'arrival' };
      try {
        let r = await findConnections(fromQ, toQ, opts, ctrl.signal);
        // Bei reinen Koordinaten sucht search.ch nur kurz voraus. Ohne Treffer nochmals
        // mit der nächsten Haltestelle versuchen (findet dann z.B. auch Verbindungen am nächsten Morgen).
        if (!append && r.connections.length === 0) {
          const near = async (e: Endpoint | null, q: string) => {
            if (!e || (e.kind !== 'me' && e.kind !== 'point')) return { q, name: null as string | null };
            const p = e.kind === 'me' ? position : { lat: e.lat!, lng: e.lng! };
            const s = p ? (await nearbyStations(p, ctrl.signal)).find((x) => (x.distance ?? 0) < 5000) : undefined;
            return s
              ? { q: s.id, name: `${s.name}${s.distance !== null && s.distance >= 50 ? ` (${s.distance} m)` : ''}` }
              : { q, name: null };
          };
          const [f, t] = await Promise.all([near(plan.from, fromQ), near(plan.to, toQ)]);
          if (f.name || t.name) {
            r = await findConnections(f.q, t.q, opts, ctrl.signal);
            if (r.connections.length) {
              setNote(
                [f.name && `Start bei Haltestelle ${f.name}`, t.name && `Ziel bis Haltestelle ${t.name}`]
                  .filter(Boolean)
                  .join(' · '),
              );
            }
          }
        }
        if (!append && r.connections.length === 0) setError('Keine Verbindung gefunden.');
        if (!append && r.connections.length) bump('routes');
        onPlan((p) => {
          if (append && p.result) {
            const known = new Set(p.result.connections.map((c) => c.id));
            return { ...p, result: { ...p.result, connections: [...p.result.connections, ...r.connections.filter((c) => !known.has(c.id))] } };
          }
          return { ...p, result: r, selectedId: r.connections[0]?.id ?? null };
        });
        const firstBounds = !append && r.connections[0] ? connectionBounds(r.connections[0]) : null;
        if (firstBounds) onFit(firstBounds, true);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message || 'Fahrplan nicht erreichbar.');
      } finally {
        if (ctrlRef.current === ctrl) setLoading(false);
      }
    },
    [plan.from, plan.to, plan.mode, plan.at, plan.result, resolve, onPlan, onFit],
  );

  // Automatisch suchen, sobald Start und Ziel feststehen (und der Standort bekannt ist)
  const key = JSON.stringify([plan.from, plan.to, plan.mode, plan.mode === 'now' ? null : plan.at, !!position]);
  useEffect(() => {
    if (!plan.from || !plan.to || plan.result) return;
    if (needsGps) {
      if (geoStatus === 'off') onStartGps();
      return;
    }
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    void run();
  }, [key, plan.from, plan.to, plan.result, needsGps, geoStatus, onStartGps, run]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const set = (patch: Partial<RoutePlan>) => onPlan((p) => ({ ...p, ...patch, result: null, selectedId: null }));
  const select = (c: Connection) => {
    const next = plan.selectedId === c.id ? null : c.id;
    onPlan((p) => ({ ...p, selectedId: next }));
    const b = next ? connectionBounds(c) : null;
    if (b) onFit(b, true);
  };
  const showOnMap = (c: Connection) => {
    setPeek(true);
    const b = connectionBounds(c);
    if (b) onFit(b);
  };
  const selected = plan.result?.connections.find((c) => c.id === plan.selectedId) ?? null;
  const peekSubtitle = selected
    ? `${selected.departure} – ${selected.arrival} · ${selected.legs
        .filter((l) => l.kind !== 'walk')
        .map((l) => l.line)
        .join(', ')}`
    : undefined;

  return (
    <BottomSheet
      title="Fahrplan"
      subtitle="ÖV-Verbindungen in der ganzen Schweiz"
      peekSubtitle={peekSubtitle}
      label="Fahrplan"
      peek={peek}
      onPeekChange={setPeek}
      onClose={onClose}
    >
      <div className="route-form">
        <div className="route-fields">
          <PlaceInput label="Von" marker="from" placeholder="Start: Ort, Haltestelle, Adresse" value={plan.from} onChange={(from) => set({ from })} />
          <PlaceInput label="Nach" marker="to" placeholder="Ziel: Ort, Haltestelle, Adresse" value={plan.to} onChange={(to) => set({ to })} />
        </div>
        <button className="icon-btn swap" aria-label="Start und Ziel tauschen" onClick={() => set({ from: plan.to, to: plan.from })}>
          <SwapIcon size={20} />
        </button>
      </div>

      <div className="time-row">
        <div className="segmented" role="radiogroup" aria-label="Zeitpunkt">
          {(
            [
              ['now', 'Jetzt'],
              ['depart', 'Abfahrt'],
              ['arrival', 'Ankunft'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="radio"
              aria-checked={plan.mode === m}
              className={plan.mode === m ? 'active' : ''}
              onClick={() => set({ mode: m, at: m === 'now' ? zurichNow() : plan.at })}
            >
              {label}
            </button>
          ))}
        </div>
        {plan.mode !== 'now' && (
          <input
            type="datetime-local"
            className="time-input"
            aria-label="Datum und Uhrzeit"
            value={plan.at}
            onChange={(e) => e.target.value && set({ at: e.target.value })}
          />
        )}
      </div>

      {needsGps && plan.to && (
        <p className="muted small route-note">
          {geoStatus === 'denied' ? 'Standort nicht freigegeben – wähle einen Start von Hand.' : 'Suche deinen Standort …'}
        </p>
      )}
      {loading && !plan.result && <p className="muted small route-note">Suche Verbindungen …</p>}
      {note && plan.result && <p className="muted small route-note">{note}</p>}
      {error && (
        <p className="route-error">
          {error}{' '}
          <button
            className="link inline"
            onClick={() => {
              lastKeyRef.current = null;
              void run();
            }}
          >
            Nochmals versuchen
          </button>
        </p>
      )}
      {!plan.to && !plan.result && (
        <p className="muted small route-note">Gib ein Ziel ein. Tipp: In der Karte bei einem Ort auf «Route hierher» tippen.</p>
      )}

      {plan.result && plan.result.connections.length > 0 && (
        <>
          <div className="route-head">
            <h3 className="section-title">
              {plan.from?.kind === 'me' ? 'Mein Standort' : cleanName(plan.result.from)} – {cleanName(plan.result.to)}
            </h3>
            {plan.selectedId && (
              <button className="link inline small" onClick={() => onPlan((p) => ({ ...p, selectedId: null }))}>
                Route ausblenden
              </button>
            )}
          </div>
          <ul className="connections">
            {plan.result.connections.map((c) => (
              <ConnectionCard
                key={c.id}
                c={c}
                selected={plan.selectedId === c.id}
                onSelect={() => select(c)}
                onShowOnMap={() => showOnMap(c)}
              />
            ))}
          </ul>
          <button className="wide-btn secondary" onClick={() => void run(true)} disabled={loading}>
            {loading ? 'Lade …' : 'Spätere Verbindungen'}
          </button>
        </>
      )}
      <p className="fine-print">
        <a href={TIMETABLE_URL} target="_blank" rel="noopener">
          {TIMETABLE_CREDIT}
        </a>
      </p>
    </BottomSheet>
  );
}
