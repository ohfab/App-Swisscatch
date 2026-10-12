import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadCantons, type CantonProps } from '../../lib/cantons';
import { compressPhoto } from '../../game/photo';
import type { FeedItem } from '../../game/derive';
import type { PlayerState, Team } from '../../game/types';
import { formatTimeOfDay } from '../../game/rules';

export const TEAM_LABEL: Record<Team, string> = { seeker: 'Fänger', hider: 'Verstecker' };
export const TEAM_ICON: Record<Team, string> = { seeker: '🔍', hider: '🫣' };

/** Kantonsdaten für Quiz und Rätsel */
export function useCantonProps(): CantonProps[] | null {
  const [list, setList] = useState<CantonProps[] | null>(null);
  useEffect(() => {
    loadCantons()
      .then((c) => setList(c.features.map((f) => f.properties)))
      .catch(() => undefined);
  }, []);
  return list;
}

export function Avatar({ p, team, size = 34 }: { p: Pick<PlayerState, 'name' | 'color'>; team?: Team; size?: number }) {
  return (
    <span className={`avatar ${team ?? ''}`} style={{ background: p.color, width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {(p.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function Points({ value, label = 'Punkte' }: { value: number; label?: string }) {
  // Kurze Animation, wenn sich der Punktestand ändert
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 450);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return (
    <span className={`points ${bump ? 'bump' : ''}`}>
      <strong>{Math.max(0, value)}</strong>
      <small>{label}</small>
    </span>
  );
}

/** Knopf, der beim ersten Tipp nachfragt und erst beim zweiten auslöst */
export function ConfirmButton({ children, confirm, onConfirm, disabled, className = '' }: { children: ReactNode; confirm: ReactNode; onConfirm: () => void; disabled?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3500);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`buy-btn ${armed ? 'armed' : ''} ${className}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : children}
    </button>
  );
}

/** Foto aufnehmen oder auswählen, verkleinern und zurückgeben */
export function PhotoButton({ onPhoto, label = 'Foto aufnehmen' }: { onPhoto: (dataUrl: string) => Promise<void> | void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <label className={`photo-btn ${busy ? 'busy' : ''}`}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            await onPhoto(await compressPhoto(file));
          } catch {
            setError('Foto konnte nicht verarbeitet werden.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <span>{busy ? 'Wird gesendet …' : `📷 ${label}`}</span>
      {error && <small className="error-text">{error}</small>}
    </label>
  );
}

export function PhotoView({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-label="Foto">
      <img className="photo-full" src={src} alt="Foto der Verstecker" />
    </div>
  );
}

export function Feed({ items, photos, team, empty }: { items: FeedItem[]; photos: Record<string, string>; team: Team; empty: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const visible = items.filter((i) => i.audience === 'all' || i.audience === team);
  if (visible.length === 0) return <p className="muted small route-note">{empty}</p>;
  return (
    <>
      <ul className="feed">
        {visible.map((i) => (
          <li key={i.id} className={`feed-item ${i.tone ?? ''}`}>
            <span className="feed-icon" aria-hidden="true">
              {i.icon}
            </span>
            <span className="feed-text">
              <strong>{i.title}</strong>
              {i.text && <span>{i.text}</span>}
              {i.photoId &&
                (photos[i.photoId] ? (
                  <button className="feed-photo" onClick={() => setOpen(photos[i.photoId!]!)}>
                    <img src={photos[i.photoId]} alt="Foto" />
                  </button>
                ) : (
                  <span className="muted small">Foto wird geladen …</span>
                ))}
            </span>
            <time>{formatTimeOfDay(i.t)}</time>
          </li>
        ))}
      </ul>
      {open && <PhotoView src={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; badge?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="game-tabs" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
          {o.badge ? <span className="tab-badge">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
