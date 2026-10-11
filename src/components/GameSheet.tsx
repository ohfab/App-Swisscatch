import { BottomSheet } from './BottomSheet';
import { ClockIcon, DownloadIcon, EyeIcon, FlagIcon, GlobeIcon, LocateIcon, TrainIcon, UsersIcon } from './Icons';
import type { GeoStatus, Position } from '../hooks/useGeolocation';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { formatNumber } from '../lib/geo';

interface Props {
  geoStatus: GeoStatus;
  position: Position | null;
  onStartGps: () => void;
  onClose: () => void;
}

const PLANNED = [
  { Icon: UsersIcon, title: 'Lobby mit Spielcode', text: 'Freunde treten per Code oder Link bei – ohne Konto.' },
  { Icon: FlagIcon, title: 'Rollen: Jäger & Gejagte', text: 'Teams, Startpunkte und Spielzeit festlegen.' },
  { Icon: EyeIcon, title: 'Standort in Intervallen', text: 'Gejagte werden z.B. alle 15 Minuten kurz sichtbar.' },
  { Icon: TrainIcon, title: 'ÖV als Spielelement', text: 'Fahrplan, Haltestellen und Regeln für Zug, Bus & Co.' },
  { Icon: GlobeIcon, title: 'Zonen & Sperrgebiete', text: 'Spielfeld eingrenzen, Kantone sperren, Zonen schrumpfen.' },
  { Icon: ClockIcon, title: 'Fang bestätigen', text: 'Fangen per Nähe-Check oder QR-Code mit Zeitstempel.' },
];

function gpsText(status: GeoStatus, position: Position | null): string {
  switch (status) {
    case 'active':
      return position ? `Bereit · Genauigkeit ±${Math.round(position.accuracy)} m` : 'Bereit';
    case 'searching':
      return 'Suche GPS-Signal …';
    case 'denied':
      return 'Zugriff verweigert – in den Browser-Einstellungen erlauben';
    case 'unavailable':
      return 'Standort nicht verfügbar';
    default:
      return 'Noch nicht getestet';
  }
}

export function GameSheet({ geoStatus, position, onStartGps, onClose }: Props) {
  const { installed, canPrompt, ios, install } = useInstallPrompt();

  return (
    <BottomSheet title="Das grosse Fangen" subtitle="Schweizweit mit Freunden · in Vorbereitung" label="Spiel" onClose={onClose}>
      <div className="hero">
        <div>
          <strong>{formatNumber(41285)} km²</strong>
          <small>Spielfeld</small>
        </div>
        <div>
          <strong>26</strong>
          <small>Kantone</small>
        </div>
        <div>
          <strong>∞</strong>
          <small>Verstecke</small>
        </div>
      </div>

      <h3 className="section-title">Vorbereitung</h3>
      <ul className="check-list">
        <li>
          <span className={`status-dot ${geoStatus === 'active' ? 'ok' : geoStatus === 'denied' || geoStatus === 'unavailable' ? 'bad' : ''}`} />
          <span className="check-text">
            <strong>GPS-Check</strong>
            <small>{gpsText(geoStatus, position)}</small>
          </span>
          {geoStatus !== 'active' && (
            <button className="chip" onClick={onStartGps}>
              <LocateIcon size={16} /> Testen
            </button>
          )}
        </li>
        <li>
          <span className={`status-dot ${installed ? 'ok' : ''}`} />
          <span className="check-text">
            <strong>Als App installieren</strong>
            <small>
              {installed
                ? 'Läuft als App'
                : ios
                  ? 'In Safari: Teilen-Symbol → «Zum Home-Bildschirm»'
                  : canPrompt
                    ? 'Mit einem Tipp auf den Home-Bildschirm'
                    : 'Im Browser-Menü «App installieren» wählen'}
            </small>
          </span>
          {!installed && canPrompt && (
            <button className="chip" onClick={install}>
              <DownloadIcon size={16} /> Installieren
            </button>
          )}
        </li>
      </ul>

      <h3 className="section-title">Geplante Spielfunktionen</h3>
      <ul className="feature-list">
        {PLANNED.map(({ Icon, title, text }) => (
          <li key={title}>
            <span className="feature-icon">
              <Icon size={20} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
