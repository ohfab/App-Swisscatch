import { useEffect, useState, type ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';
import { Ghost } from './Art';
import { CheckIcon, CopyIcon, DownloadIcon, ShareIcon } from './Icons';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { APK_URL, isNative, PUBLIC_URL } from '../lib/native';

/** Fester Link zum Teilen: leitet auf die App mit geöffneter Download-Seite um */
export const DOWNLOAD_URL = `${PUBLIC_URL}download/`;

interface Props {
  onClose: () => void;
  onToast: (msg: string) => void;
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="how-to install-steps">{children}</ol>;
}

/** QR-Code als SVG, mit dem Logo in der Mitte (Fehlerkorrektur H verträgt das) */
function QrCode({ text }: { text: string }) {
  const [qr, setQr] = useState<{ d: string; n: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const code = qrcode(0, 'H');
      code.addData(text);
      code.make();
      const n = code.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (code.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      if (alive) setQr({ d, n });
    });
    return () => {
      alive = false;
    };
  }, [text]);
  if (!qr) return <div className="qr qr-loading" />;
  const logo = qr.n * 0.24;
  const at = (qr.n - logo) / 2;
  return (
    <svg className="qr" viewBox={`-2 -2 ${qr.n + 4} ${qr.n + 4}`} role="img" aria-label={`QR-Code für ${text}`}>
      <rect x="-2" y="-2" width={qr.n + 4} height={qr.n + 4} rx="3" fill="#fff" />
      <path d={qr.d} fill="#1f1c35" shapeRendering="crispEdges" />
      <rect x={at - 0.6} y={at - 0.6} width={logo + 1.2} height={logo + 1.2} rx="1.6" fill="#fff" />
      <image href={`${import.meta.env.BASE_URL}icons/icon.svg`} x={at} y={at} width={logo} height={logo} />
    </svg>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function checkForUpdate(onToast: (msg: string) => void) {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (!reg) {
    location.reload();
    return;
  }
  await reg.update().catch(() => undefined);
  if (reg.installing || reg.waiting) {
    onToast('Update gefunden – die App startet neu …');
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    window.setTimeout(() => location.reload(), 4000);
  } else {
    onToast('Du hast schon die neueste Version ✓');
  }
}

export function AppSheet({ onClose, onToast }: Props) {
  const { installed, canPrompt, platform, browser, install } = useInstallPrompt();
  const version = `${__APP_VERSION__.sha} · ${new Date(__APP_VERSION__.time).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })}`;

  const share = async () => {
    const data = { title: 'Zeitgeist', text: 'Hol dir Zeitgeist – das Versteckspiel quer durch die Schweiz, mit Karte und Fahrplan:', url: DOWNLOAD_URL };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* abgebrochen */
      }
    }
    onToast((await copyText(DOWNLOAD_URL)) ? 'Link kopiert' : DOWNLOAD_URL);
  };

  // Echte Android-App: GPS läuft auch bei gesperrtem Bildschirm weiter
  const apk = (
    <div className="apk-card">
      <div>
        <strong>Android-App (APK)</strong>
        <small>Mit GPS im Hintergrund und Meldungen bei gesperrtem Bildschirm – ideal fürs Spiel.</small>
      </div>
      <a className="wide-btn start" href={APK_URL} download>
        <DownloadIcon size={20} /> APK herunterladen
      </a>
      <ol className="how-to install-steps">
        <li>APK öffnen, wenn der Download fertig ist.</li>
        <li>
          Fragt Android nach, <strong>«Unbekannte Apps installieren»</strong> für den Browser erlauben.
        </li>
        <li>
          <strong>«Installieren»</strong> tippen. Beim Start Standort <strong>«Immer»</strong> bzw. «Bei Nutzung» und Mitteilungen erlauben.
        </li>
      </ol>
    </div>
  );

  let guide: ReactNode;
  if (isNative) {
    guide = (
      <div className="install-done">
        <CheckIcon size={22} />
        <div>
          <strong>Läuft als Android-App</strong>
          <small>Im Spiel läuft dein Standort auch bei gesperrtem Bildschirm weiter.</small>
        </div>
      </div>
    );
  } else if (installed) {
    guide = (
      <div className="install-done">
        <CheckIcon size={22} />
        <div>
          <strong>Läuft schon als App</strong>
          <small>Du findest Zeitgeist auf dem Home-Bildschirm bzw. im Startmenü.</small>
        </div>
      </div>
    );
  } else if (canPrompt) {
    guide = (
      <button
        className="wide-btn start install-btn"
        onClick={async () => {
          if (await install()) onToast('Installiert! 🎉');
        }}
      >
        <DownloadIcon size={20} /> Jetzt installieren
      </button>
    );
  } else if (platform === 'ios') {
    guide = (
      <Steps>
        {browser !== 'safari' && <li>Öffne diesen Link in <strong>Safari</strong> (oder in Chrome ab iOS 16.4).</li>}
        <li>
          Tippe unten auf <strong>Teilen</strong> <ShareIcon size={15} />.
        </li>
        <li>
          Wähle <strong>«Zum Home-Bildschirm»</strong>.
        </li>
        <li>
          Tippe auf <strong>«Hinzufügen»</strong> – fertig!
        </li>
      </Steps>
    );
  } else if (platform === 'android') {
    guide = (
      <Steps>
        <li>
          Tippe in Chrome oben rechts auf <strong>⋮</strong>.
        </li>
        <li>
          Wähle <strong>«App installieren»</strong> oder «Zum Startbildschirm hinzufügen».
        </li>
        <li>Bestätigen – die App erscheint bei deinen Apps.</li>
      </Steps>
    );
  } else if (browser === 'chromium') {
    guide = (
      <Steps>
        <li>
          Klicke rechts in der Adressleiste auf das <strong>Installieren-Symbol</strong> <DownloadIcon size={15} />.
        </li>
        <li>
          Oder im Menü <strong>⋮</strong> bzw. <strong>…</strong>: «Streamen, speichern und teilen» → <strong>«Seite als App installieren»</strong> (Chrome) oder «Apps» →{' '}
          <strong>«Diese Website als App installieren»</strong> (Edge).
        </li>
        <li>Die App startet in einem eigenen Fenster und kommt ins Startmenü.</li>
      </Steps>
    );
  } else if (browser === 'safari') {
    guide = (
      <Steps>
        <li>
          Klicke oben im Menü auf <strong>Ablage</strong>.
        </li>
        <li>
          Wähle <strong>«Zum Dock hinzufügen …»</strong> (ab macOS Sonoma).
        </li>
        <li>Die App liegt danach im Dock und im Ordner «Programme».</li>
      </Steps>
    );
  } else {
    guide = (
      <div className="info-banner">
        Dieser Browser kann Web-Apps nicht installieren. Öffne den Link in <strong>Chrome</strong> oder <strong>Edge</strong>, dann klappt es mit einem
        Klick. Die Website funktioniert aber auch so.
      </div>
    );
  }

  return (
    <BottomSheet title={isNative ? 'Über die App' : 'App herunterladen'} subtitle="Gratis für PC, Android und iPhone" label="App herunterladen" onClose={onClose}>
      <div className="app-hero">
        <img className="app-icon" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={76} height={76} />
        <div>
          <h3>Zeitgeist</h3>
          <p>Versteckspiel, Karte und Fahrplan – direkt als App, ohne App Store.</p>
          <small>Gratis · keine Anmeldung · offline nutzbar</small>
        </div>
        <Ghost size={62} wave className="app-hero-blob" shadow={false} />
      </div>

      <h3 className="section-title">{installed ? 'Installiert' : canPrompt ? 'Ein Klick genügt' : 'So installierst du die App'}</h3>
      {guide}

      {!isNative && platform !== 'ios' && (
        <>
          <h3 className="section-title">{platform === 'android' ? 'Noch besser: die Android-App' : 'Für Android-Handys'}</h3>
          {apk}
        </>
      )}

      <h3 className="section-title">{platform === 'desktop' ? 'Aufs Handy holen' : 'Freunden schicken'}</h3>
      <div className="share-card">
        <QrCode text={DOWNLOAD_URL} />
        <div className="share-text">
          <p>{platform === 'desktop' ? 'Scanne den Code mit der Handy-Kamera.' : 'Lass deine Freunde den Code scannen oder schick ihnen den Link.'}</p>
          <code className="share-link">{DOWNLOAD_URL.replace(/^https?:\/\//, '')}</code>
          <div className="share-actions">
            <button className="chip" onClick={async () => onToast((await copyText(DOWNLOAD_URL)) ? 'Link kopiert' : DOWNLOAD_URL)}>
              <CopyIcon size={15} /> Kopieren
            </button>
            <button className="chip active" onClick={() => void share()}>
              <ShareIcon size={15} /> Teilen
            </button>
          </div>
        </div>
      </div>

      <h3 className="section-title">Gut zu wissen</h3>
      <ul className="check-list">
        <li>
          <span className="status-dot ok" />
          <span className="check-text">
            <strong>{isNative ? 'Updates über die APK' : 'Updates kommen von selbst'}</strong>
            <small>{isNative ? 'Neue Version: unten «Nach Updates suchen» und die APK drüber installieren – deine Daten bleiben.' : 'Beim nächsten Öffnen läuft automatisch die neueste Version.'}</small>
          </span>
        </li>
        <li>
          <span className="status-dot ok" />
          <span className="check-text">
            <strong>{isNative ? 'Standort nur während eines Spiels im Hintergrund' : 'Standort nur bei offener App'}</strong>
            <small>Im Spiel geht er nur an deine Mitspieler, verschlüsselt mit dem Spielcode.</small>
          </span>
        </li>
      </ul>
      <p className="fine-print app-version">
        Version {version} ·{' '}
        {isNative ? (
          <a className="link inline" href={APK_URL}>
            Nach Updates suchen
          </a>
        ) : (
          <button className="link inline" onClick={() => void checkForUpdate(onToast)}>
            Nach Updates suchen
          </button>
        )}
      </p>
    </BottomSheet>
  );
}
