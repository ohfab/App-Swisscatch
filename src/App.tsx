import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapView } from './components/MapView';
import { SearchBar } from './components/SearchBar';
import { TabBar, type Tab } from './components/TabBar';
import { LayerSheet } from './components/LayerSheet';
import { AppSheet } from './components/AppSheet';
import { PlaceSheet } from './components/PlaceSheet';
import { CantonSheet } from './components/CantonSheet';
import { PinsSheet } from './components/PinsSheet';
import { GameSheet } from './components/GameSheet';
import { RouteSheet, emptyPlan, ME, type RoutePlan } from './components/RouteSheet';
import { useGame, takeInviteCode } from './game/useGame';
import { formatClock, isOnline } from './game/rules';
import { derive } from './game/derive';
import { DrawShow } from './components/game/DrawShow';
import { ConfirmButton, TEAM_ICON, TEAM_LABEL, useCantonProps } from './components/game/common';
import { inField, manualSpotRadius } from './game/content';
import { buzz, play } from './lib/sound';
import { notifyUser } from './lib/notify';
import { isNative } from './lib/native';
import { Onboarding } from './components/Onboarding';
import { load, save } from './lib/storage';
import type { Area } from './game/derive';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useNow } from './hooks/useNow';
import type { GamePlayerMarker } from './components/MapView';
import { Toast } from './components/Toast';
import { CloseIcon, DownloadIcon, FlagIcon, LayersIcon, LocateFilledIcon, LocateIcon, TrainIcon } from './components/Icons';
import { BASEMAPS, DEFAULT_BASEMAP, type BasemapId, type OverlayId } from './lib/config';
import { loadCantons, type CantonFeature } from './lib/cantons';
import { distanceMeters, formatDistance, type LatLng } from './lib/geo';
import type { SearchResult } from './lib/geoadmin';
import type { Station } from './lib/transport';
import { placeKey, type Place } from './lib/place';
import { usePersistentState } from './hooks/usePersistentState';
import { PIN_COLORS, usePins, type Pin } from './hooks/usePins';
import { useGeolocation } from './hooks/useGeolocation';
import { useOnline } from './hooks/useOnline';

type Panel =
  | { type: 'layers' }
  | { type: 'place'; place: Place }
  | { type: 'canton'; canton: CantonFeature }
  | { type: 'route' }
  | { type: 'pins' }
  | { type: 'game' }
  | { type: 'app' };

const DEFAULT_OVERLAYS: Record<OverlayId, boolean> = { cantons: true, transit: false, hiking: false };

const isWide = () => window.matchMedia('(min-width: 768px)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Nach dem nächsten Rendern ausführen (damit ein neues Sheet schon messbar ist) */
const afterPaint = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

/** Sichtbarer Kartenbereich, der nicht von Suchleiste, Sheet oder Tab-Leiste verdeckt ist */
function visibleArea() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
  const topbar = rect('.search-field');
  const sheet = rect('.sheet');
  const tabbar = rect('.tabbar');
  if (isWide()) {
    return {
      left: sheet ? sheet.right + 16 : 16,
      top: 16,
      right: w - 80,
      bottom: (tabbar?.top ?? h) - 16,
    };
  }
  return {
    left: 16,
    top: (topbar?.bottom ?? 70) + 12,
    right: w - 16,
    bottom: (sheet?.top ?? tabbar?.top ?? h) - 16,
  };
}

export function App() {
  const mapRef = useRef<L.Map | null>(null);
  const [basemap, setBasemap] = usePersistentState<BasemapId>('basemap.v2', DEFAULT_BASEMAP);
  const [storedOverlays, setOverlays] = usePersistentState<Partial<Record<OverlayId, boolean>>>('overlays', DEFAULT_OVERLAYS);
  const overlays = useMemo(() => ({ ...DEFAULT_OVERLAYS, ...storedOverlays }), [storedOverlays]);
  const [hintSeen, setHintSeen] = usePersistentState('hint.longpress', false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [follow, setFollow] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [openStationId, setOpenStationId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [plan, setPlan] = useState<RoutePlan>(emptyPlan);
  const { pins, addPin, updatePin, removePin } = usePins();
  const geo = useGeolocation();
  const online = useOnline();
  const game = useGame(geo.position);
  const [inviteCode] = useState(() => takeInviteCode() ?? '');
  // Einführung beim ersten Start (nicht, wenn jemand über einen Einladungs- oder Download-Link kommt)
  const [onboarding, setOnboarding] = useState(() => !load<boolean>('onboarded.v1', false) && !inviteCode && !new URL(location.href).searchParams.has('app'));
  const gameMeta = game.snapshot?.meta ?? null;
  // Spieluhr: eigene Uhr plus Versatz zur Uhr des Hosts (alle Geräte gleichzeitig)
  const clockOffset = game.snapshot?.clockOffset ?? 0;
  const gameNow = useNow(1000, !!gameMeta) + clockOffset;

  // Einladungslink geöffnet: direkt den Spiel-Tab zeigen; Download-Link (?app): App-Seite zeigen
  useEffect(() => {
    const url = new URL(location.href);
    const wantsApp = url.searchParams.has('app');
    if (wantsApp) {
      url.searchParams.delete('app');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    if (inviteCode && !game.session) setPanel({ type: 'game' });
    else if (wantsApp) setPanel({ type: 'app' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Im Spiel braucht es den Standort (in der Android-App auch bei gesperrtem Bildschirm)
  useEffect(() => {
    if (game.session && geo.status === 'off') geo.start();
  }, [game.session, geo.status, geo.start]);
  useEffect(() => geo.setBackground(!!game.session), [game.session, geo.setBackground]);

  // Spielmeldungen als Hinweis anzeigen (mit Ton)
  const notice = game.snapshot?.notice;
  useEffect(() => {
    if (!notice) return;
    setToast(notice.text);
    if (notice.sound) play(notice.sound);
    // App im Hintergrund: wichtige Meldungen als Systembenachrichtigung
    if (notice.sound && notice.sound !== 'tick') void notifyUser('Spurlos', notice.text);
  }, [notice]);

  const cantonList = useCantonProps();
  const gameDerived = useMemo(
    () => (game.snapshot ? derive(game.snapshot.meta, game.snapshot.players, gameNow, cantonList) : null),
    [game.snapshot, gameNow, cantonList],
  );
  const myGameTeam = gameDerived && game.snapshot ? gameDerived.teamOf(game.snapshot.me.id) : null;
  const [skippedDraw, setSkippedDraw] = useState<string | null>(null);
  const showDraw =
    !!gameDerived &&
    !!gameMeta?.draw &&
    skippedDraw !== gameMeta.draw.seed &&
    (gameDerived.stage === 'draw' || gameDerived.stage === 'versus' || (gameDerived.stage === 'hiding' && gameNow < gameDerived.hideStart + 1500));
  const [dismissedClaims, setDismissedClaims] = useState<string[]>([]);
  const openClaim =
    myGameTeam === 'hider' && gameDerived?.stage === 'seeking'
      ? (gameDerived.pendingClaims.find((c) => !dismissedClaims.includes(c.id)) ?? null)
      : null;

  // Hinweise beim Wechsel der Spielabschnitte und bei neuen Challenges
  const stageNow = gameDerived?.stage;
  const challengeNo = gameDerived?.current?.n;
  useEffect(() => {
    if (stageNow === 'seeking') {
      setToast(myGameTeam === 'seeker' ? '🔍 Die Suche beginnt! Power-ups sind freigeschaltet.' : '🫣 Die Suche beginnt – jetzt gut versteckt bleiben!');
      play('go');
      buzz([150, 80, 150]);
      void notifyUser('🔍 Die Suche beginnt!', myGameTeam === 'seeker' ? 'Power-ups sind freigeschaltet – los geht’s.' : 'Bleibt gut versteckt!');
    }
    if (stageNow === 'draw' && myGameTeam) void notifyUser('🎡 Die Teams sind ausgelost!', myGameTeam === 'seeker' ? 'Du bist Fänger.' : 'Du versteckst dich – such dir ein gutes Versteck.');
    if (stageNow === 'ended' && gameDerived?.result?.winner && myGameTeam) {
      const won = gameDerived.result.winner === myGameTeam;
      play(won ? 'win' : 'lose');
      void notifyUser(won ? '🏆 Gewonnen!' : 'Runde vorbei', won ? 'Dein Team hat die Runde gewonnen.' : 'Das andere Team hat gewonnen. Revanche?');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNow]);
  useEffect(() => {
    if (myGameTeam === 'hider' && challengeNo && !gameDerived?.current?.skipped) {
      setToast(`🎯 Neue Challenge #${challengeNo}!`);
      play('challenge');
      buzz(200);
      void notifyUser(`🎯 Neue Challenge #${challengeNo}`, gameDerived?.current?.def?.prompt ?? 'Öffne Spurlos, um sie zu lösen.', 'challenge');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeNo]);

  // Auf der Karte: nur das eigene Team (in der Lobby alle)
  const gamePlayers = useMemo<GamePlayerMarker[]>(() => {
    const snap = game.snapshot;
    if (!snap || !gameDerived) return [];
    const lobby = gameDerived.stage === 'lobby';
    const now = Date.now();
    return Object.values(snap.players)
      .filter((p) => p.id !== snap.me.id && p.pos && (lobby || gameDerived.teamOf(p.id) === myGameTeam))
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        team: gameDerived.teamOf(p.id),
        lat: p.pos!.lat,
        lng: p.pos!.lng,
        kind: 'live' as const,
        caught: false,
        online: isOnline(p, now),
      }));
  }, [game.snapshot, gameDerived, myGameTeam]);
  // Spielfeld für alle, ausgeschlossene Gebiete nur für die Fänger; nur neu zeichnen, wenn sich etwas ändert
  const areasList: Area[] = gameDerived
    ? [
        ...(gameDerived.field ? [{ kind: 'cantons' as const, abbrs: gameDerived.field }] : []),
        ...(myGameTeam === 'seeker' && gameDerived.stage !== 'lobby' ? gameDerived.areas : []),
      ]
    : [];
  const areasKey = JSON.stringify(areasList);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gameAreas = useMemo(() => areasList, [areasKey]);
  const gameSpot =
    gameDerived?.spot && (myGameTeam === 'hider' || gameDerived.stage === 'ended') ? { lat: gameDerived.spot.fix.lat, lng: gameDerived.spot.fix.lng } : null;
  const installPrompt = useInstallPrompt();

  const validBasemap = BASEMAPS.some((b) => b.id === basemap) ? basemap : DEFAULT_BASEMAP;
  const shownRoute = plan.result?.connections.find((c) => c.id === plan.selectedId) ?? null;
  const updatePlan = useCallback((u: (p: RoutePlan) => RoutePlan) => setPlan(u), []);
  const startGps = useCallback(() => geo.start(), [geo.start]);

  useEffect(() => {
    if (geo.status === 'denied') {
      setToast('Standortzugriff verweigert');
      setFollow(false);
    } else if (geo.status === 'unavailable') {
      setToast('Standort nicht verfügbar');
      setFollow(false);
    }
  }, [geo.status]);

  /** Punkt in die Mitte des sichtbaren Bereichs fliegen (nicht unter das Sheet) */
  const focus = useCallback((p: LatLng, zoom?: number) => {
    setFollow(false);
    afterPaint(() => {
      const map = mapRef.current;
      if (!map) return;
      // Ganzzahlige Zoomstufen ergeben die schärfsten Kacheln
      const z = Math.round(zoom ?? Math.max(map.getZoom(), 14));
      const a = visibleArea();
      const size = map.getSize();
      const offset = L.point(size.x / 2 - (a.left + a.right) / 2, size.y / 2 - (a.top + a.bottom) / 2);
      const target = map.unproject(map.project([p.lat, p.lng], z).add(offset), z);
      map.flyTo(target, z, { duration: 0.8 });
    });
  }, []);

  /** Fläche in den sichtbaren Bereich einpassen (ganzzahliger Zoom = scharfe Kacheln) */
  const fit = useCallback((bounds: L.LatLngBoundsExpression, maxZoomOrAuto: number | boolean = 16) => {
    // true = automatisches Einpassen, nur wenn über dem Sheet genug Karte sichtbar ist
    const auto = maxZoomOrAuto === true;
    const maxZoom = typeof maxZoomOrAuto === 'number' ? maxZoomOrAuto : 16;
    setFollow(false);
    afterPaint(() => {
      const map = mapRef.current;
      if (!map) return;
      const a = visibleArea();
      if (auto && a.bottom - a.top < 200) return;
      const size = map.getSize();
      const b = L.latLngBounds(bounds as L.LatLngBoundsLiteral);
      const padding = L.point(a.left + size.x - a.right, a.top + size.y - a.bottom);
      const z = Math.min(maxZoom, Math.floor(map.getBoundsZoom(b, false, padding)));
      const offset = L.point(size.x / 2 - (a.left + a.right) / 2, size.y / 2 - (a.top + a.bottom) / 2);
      map.flyTo(map.unproject(map.project(b.getCenter(), z).add(offset), z), z, { duration: 0.8 });
    });
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    setStations([]);
    setOpenStationId(null);
  }, []);

  const openPlace = useCallback((place: Omit<Place, 'key'>) => {
    setPanel({ type: 'place', place: { ...place, key: placeKey() } });
    setStations([]);
    setOpenStationId(null);
  }, []);

  // ---------- Versteck auf der Karte wählen ----------
  const [spotPick, setSpotPick] = useState<{ origin: LatLng | null; maxM: number | null } | null>(null);
  const [pickCenter, setPickCenter] = useState<LatLng | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  const startSpotPick = useCallback(() => {
    const p = geo.position;
    const origin = p ? { lat: p.lat, lng: p.lng } : null;
    setSpotPick({ origin, maxM: p ? manualSpotRadius(p.accuracy) : null });
    setPanel(null);
    setFollow(false);
    afterPaint(() => {
      const map = mapRef.current;
      if (map && origin) map.flyTo(origin, Math.max(Math.round(map.getZoom()), 15), { duration: 0.8 });
    });
  }, [geo.position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!spotPick || !map) return;
    const onMove = () => setPickCenter(map.getCenter());
    onMove();
    map.on('move', onMove);
    return () => {
      map.off('move', onMove);
    };
  }, [spotPick]);

  const confirmSpotPick = useCallback(async () => {
    const client = game.client;
    if (!client || !pickCenter) return;
    setPickBusy(true);
    try {
      const at = { lat: pickCenter.lat, lng: pickCenter.lng };
      const { spotFacts } = await import('./game/facts');
      const facts = await spotFacts(at);
      const field = gameDerived?.field;
      if (!inField(field, facts.canton)) {
        play('wrong');
        setToast(`Ausserhalb des Spielfelds (${facts.cantonName ?? facts.canton}). Erlaubt: ${field!.join(', ')}.`);
        return;
      }
      client.logSpot({ ...at, acc: 0, t: client.now() }, facts, { manual: true });
      play('pick');
      setToast('Versteck eingeloggt 🏠');
      setSpotPick(null);
      setPanel({ type: 'game' });
    } finally {
      setPickBusy(false);
    }
  }, [game.client, pickCenter, gameDerived?.field]);

  const handleTap = useCallback(
    (p: LatLng, canton: CantonFeature | null) => {
      // Beim Wählen des Verstecks: angetippten Punkt in die Mitte holen
      if (spotPick) {
        mapRef.current?.panTo(p);
        return;
      }
      if (panel) {
        closePanel();
        return;
      }
      if (canton) setPanel({ type: 'canton', canton });
    },
    [panel, closePanel, spotPick],
  );

  // Android-Zurück-Taste: erst Einführung, Versteckwahl oder Fenster schliessen, sonst App minimieren
  const backRef = useRef<() => void>(() => undefined);
  backRef.current = () => {
    if (onboarding) {
      setOnboarding(false);
      save('onboarded.v1', true);
    } else if (spotPick) {
      setSpotPick(null);
      setPanel({ type: 'game' });
    } else if (panel) closePanel();
    else void import('@capacitor/app').then(({ App: CapApp }) => CapApp.minimizeApp());
  };
  useEffect(() => {
    if (!isNative) return;
    let remove: (() => void) | undefined;
    let gone = false;
    void import('@capacitor/app').then(({ App: CapApp }) =>
      CapApp.addListener('backButton', () => backRef.current()).then((h) => {
        if (gone) void h.remove();
        else remove = () => void h.remove();
      }),
    );
    return () => {
      gone = true;
      remove?.();
    };
  }, []);

  const handleLongPress = useCallback(
    (p: LatLng) => {
      if (spotPick) return;
      setHintSeen(true);
      openPlace({ lat: p.lat, lng: p.lng, source: 'map' });
    },
    [openPlace, setHintSeen, spotPick],
  );

  const handlePinClick = useCallback(
    (pin: Pin) => {
      openPlace({ lat: pin.lat, lng: pin.lng, pinId: pin.id, source: 'pin' });
      focus(pin);
    },
    [openPlace, focus],
  );

  const handleSearch = useCallback(
    (r: SearchResult) => {
      const area = r.kind === 'gemeinde' || r.kind === 'plz' || r.kind === 'kanton' || r.kind === 'bezirk';
      if (area && r.bounds) fit(r.bounds, 15);
      else focus(r, r.kind === 'adresse' ? 17 : 15);
      openPlace({ lat: r.lat, lng: r.lng, title: r.title, subtitle: r.subtitle, source: 'search' });
    },
    [fit, focus, openPlace],
  );

  const handleStations = useCallback(
    (list: Station[], place: Place) => {
      setStations(list);
      setOpenStationId(list[0]?.id ?? null);
      if (list.length > 0) fit(L.latLngBounds([[place.lat, place.lng], ...list.map((s) => [s.lat, s.lng] as L.LatLngTuple)]), 17);
      else setToast('Keine Haltestellen in der Nähe');
    },
    [fit],
  );

  const onLocate = () => {
    if (geo.status === 'off' || geo.status === 'denied' || geo.status === 'unavailable') {
      geo.start();
      setFollow(true);
    } else if (!follow) {
      setFollow(true);
    } else {
      geo.stop();
      setFollow(false);
      setToast('Standort ausgeschaltet');
    }
  };

  const selectTab = (tab: Tab) => {
    if (tab === 'map') closePanel();
    else if (panel?.type === tab) closePanel();
    else {
      setPanel({ type: tab });
      setStations([]);
      setOpenStationId(null);
    }
  };

  const activeTab: Tab =
    panel?.type === 'pins' || panel?.type === 'game' || panel?.type === 'route' ? panel.type : 'map';
  const currentPlace = panel?.type === 'place' ? panel.place : null;
  const currentPin = currentPlace?.pinId ? (pins.find((p) => p.id === currentPlace.pinId) ?? null) : null;
  const selection = currentPlace && !currentPin ? { lat: currentPlace.lat, lng: currentPlace.lng } : null;
  const locateLabel =
    geo.status === 'off' || geo.status === 'denied' || geo.status === 'unavailable'
      ? 'Meinen Standort zeigen'
      : follow
        ? 'Standort ausschalten'
        : 'Auf meinen Standort zentrieren';

  return (
    <div className={`app ${panel ? 'has-panel' : ''}`}>
      <MapView
        basemap={validBasemap}
        overlays={overlays}
        pins={pins}
        position={geo.position}
        follow={follow}
        selection={selection}
        selectedCantonId={panel?.type === 'canton' ? panel.canton.properties.id : null}
        stations={stations}
        route={shownRoute}
        gamePlayers={gamePlayers}
        gameAreas={gameAreas}
        gameSpot={gameSpot}
        pickCircle={spotPick?.origin && spotPick.maxM ? { ...spotPick.origin, radius: spotPick.maxM } : null}
        onBasemapError={() => {
          setToast('Strassenkarte nicht verfügbar – zeige Landeskarte');
          setBasemap('farbe');
        }}
        onReady={(map) => (mapRef.current = map)}
        onTap={handleTap}
        onLongPress={handleLongPress}
        onPinClick={handlePinClick}
        onStationClick={(s) => setOpenStationId(s.id)}
        onUserPan={() => setFollow(false)}
      />

      <header className="topbar">
        <SearchBar onSelect={handleSearch} onFocus={() => panel?.type !== 'place' && closePanel()} />
        {!online && <div className="banner">Offline – bereits geladene Karten bleiben sichtbar</div>}
        {gameMeta && game.snapshot && gameDerived && panel?.type !== 'game' && (
          <button className={`game-chip ${myGameTeam ?? ''} ${gameDerived.stage}`} onClick={() => setPanel({ type: 'game' })}>
            <FlagIcon size={18} />
            <span>
              {(() => {
                const d = gameDerived;
                if (d.stage === 'lobby') return `Lobby ${game.snapshot.code} · ${Object.keys(game.snapshot.players).length}/${gameMeta.settings.maxPlayers} Spieler`;
                if (d.stage === 'draw' || d.stage === 'versus') return 'Auslosung läuft …';
                if (d.stage === 'ended') return 'Spiel beendet · Resultat ansehen';
                const team = myGameTeam ?? 'seeker';
                const pts = team === 'seeker' ? d.seekerPoints : d.hiderPoints;
                const timer =
                  d.stage === 'hiding'
                    ? team === 'seeker'
                      ? `Suche in ${formatClock(d.hideEnd - gameNow)}`
                      : d.spot
                        ? `Suche in ${formatClock(d.hideEnd - gameNow)}`
                        : `Versteck einloggen! ${formatClock(d.hideEnd - gameNow)}`
                    : team === 'hider' && d.current && !d.current.done
                      ? `Challenge ${formatClock(d.current.deadline - gameNow)}`
                      : `noch ${formatClock(d.seekEnd - gameNow)}`;
                return `${TEAM_ICON[team]} ${TEAM_LABEL[team]} · ${Math.max(0, pts)} P · ${timer}`;
              })()}
            </span>
          </button>
        )}
        {shownRoute && panel?.type !== 'route' && (
          <div className="route-chip">
            <button className="route-chip-main" onClick={() => setPanel({ type: 'route' })}>
              <TrainIcon size={18} />
              <span>
                {shownRoute.departure} – {shownRoute.arrival} ·{' '}
                {shownRoute.legs
                  .filter((l) => l.kind !== 'walk')
                  .map((l) => l.line)
                  .join(', ')}
              </span>
            </button>
            <button
              className="icon-btn subtle"
              aria-label="Route ausblenden"
              onClick={() => setPlan((p) => ({ ...p, selectedId: null }))}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        )}
        {!hintSeen && !panel && !shownRoute && !gameMeta && !installPrompt.canPrompt && (
          <div className="hint">
            <span>
              <strong>Tipp:</strong> {finePointer ? 'Rechtsklick auf die Karte' : 'Lange auf die Karte drücken'} zeigt
              Höhe, Kanton und ÖV-Abfahrten.
            </span>
            <button className="icon-btn subtle" aria-label="Tipp ausblenden" onClick={() => setHintSeen(true)}>
              <CloseIcon size={16} />
            </button>
          </div>
        )}
      </header>

      <div className="fabs">
        {!installPrompt.installed && (
          <button
            className={`fab install ${panel?.type === 'app' ? 'active' : ''}`}
            aria-label="App herunterladen"
            title="App herunterladen"
            onClick={() => (panel?.type === 'app' ? closePanel() : setPanel({ type: 'app' }))}
          >
            <DownloadIcon />
          </button>
        )}
        <button
          className={`fab ${panel?.type === 'layers' ? 'active' : ''}`}
          aria-label="Karte und Ebenen"
          title="Karte und Ebenen"
          onClick={() => (panel?.type === 'layers' ? closePanel() : setPanel({ type: 'layers' }))}
        >
          <LayersIcon />
        </button>
        <button
          className={`fab locate ${geo.status} ${follow ? 'following' : ''}`}
          aria-label={locateLabel}
          title={locateLabel}
          onClick={onLocate}
        >
          {follow && geo.status === 'active' ? <LocateFilledIcon /> : <LocateIcon />}
        </button>
      </div>

      {panel?.type === 'layers' && (
        <LayerSheet
          basemap={validBasemap}
          overlays={overlays}
          onBasemap={setBasemap}
          onToggleOverlay={(id) => setOverlays((o) => ({ ...DEFAULT_OVERLAYS, ...o, [id]: !overlays[id] }))}
          onOpenApp={() => setPanel({ type: 'app' })}
          onClose={closePanel}
        />
      )}
      {spotPick && (
        <>
          <div className="pick-cross" aria-hidden="true">
            <span />
          </div>
          <div className="pick-card" role="dialog" aria-label="Versteck auf der Karte wählen">
            {(() => {
              const dist = pickCenter && spotPick.origin ? distanceMeters(pickCenter, spotPick.origin) : null;
              const tooFar = dist !== null && spotPick.maxM !== null && dist > spotPick.maxM;
              return (
                <>
                  <strong>🏠 Versteck auf der Karte wählen</strong>
                  <p className={tooFar ? 'bad' : ''}>
                    {!spotPick.origin
                      ? 'Ohne GPS: Schieb die Karte, bis das Kreuz auf deinem Versteck liegt. Die Fänger sehen, dass es von Hand gesetzt ist.'
                      : tooFar
                        ? `Zu weit weg – höchstens ${formatDistance(spotPick.maxM!)} von deinem GPS-Standort.`
                        : `Schieb die Karte, bis das Kreuz auf deinem Versteck liegt · ${formatDistance(dist ?? 0)} vom GPS-Standort`}
                  </p>
                  <div className="pick-actions">
                    <button
                      className="wide-btn secondary"
                      onClick={() => {
                        setSpotPick(null);
                        setPanel({ type: 'game' });
                      }}
                    >
                      Abbrechen
                    </button>
                    <ConfirmButton className="wide-btn start" disabled={!pickCenter || tooFar || pickBusy} confirm="Endgültig hier?" onConfirm={() => void confirmSpotPick()}>
                      {pickBusy ? 'Ermittle Ort …' : 'Hier einloggen'}
                    </ConfirmButton>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
      {panel?.type === 'app' && <AppSheet onClose={closePanel} onToast={setToast} />}
      {panel?.type === 'place' && (
        <PlaceSheet
          key={panel.place.key}
          place={panel.place}
          pin={currentPin}
          position={geo.position}
          stations={stations}
          openStationId={openStationId}
          onStations={(list) => handleStations(list, panel.place)}
          onToggleStation={(s) => setOpenStationId((id) => (id === s.id ? null : s.id))}
          onSavePin={(name) => {
            const pin = addPin({
              name: name || `Pin ${pins.length + 1}`,
              lat: panel.place.lat,
              lng: panel.place.lng,
              color: PIN_COLORS[pins.length % PIN_COLORS.length]!,
            });
            setPanel({ type: 'place', place: { ...panel.place, pinId: pin.id, source: 'pin' } });
            setToast('Pin gespeichert');
          }}
          onUpdatePin={updatePin}
          onRemovePin={(id) => {
            removePin(id);
            closePanel();
          }}
          onShowCanton={(canton) => setPanel({ type: 'canton', canton })}
          onRoute={(title) => {
            setPlan((p) => ({
              ...p,
              from: ME,
              to: { kind: 'point', label: title, lat: panel.place.lat, lng: panel.place.lng },
              result: null,
              selectedId: null,
            }));
            setPanel({ type: 'route' });
            setStations([]);
          }}
          onToast={setToast}
          onClose={closePanel}
        />
      )}
      {panel?.type === 'canton' && (
        <CantonSheet
          canton={panel.canton}
          onZoom={() => fit(L.geoJSON(panel.canton).getBounds(), 12)}
          onNeighbor={(abbr) =>
            loadCantons().then((all) => {
              const next = all.features.find((f) => f.properties.abbr === abbr);
              if (!next) return;
              setPanel({ type: 'canton', canton: next });
              fit(L.geoJSON(next).getBounds(), 12);
            })
          }
          onClose={closePanel}
        />
      )}
      {panel?.type === 'route' && (
        <RouteSheet
          plan={plan}
          onPlan={updatePlan}
          position={geo.position}
          geoStatus={geo.status}
          onStartGps={startGps}
          onFit={fit}
          onClose={closePanel}
        />
      )}
      {panel?.type === 'pins' && (
        <PinsSheet
          pins={pins}
          position={geo.position}
          onSelect={handlePinClick}
          onAddAtPosition={() => {
            if (!geo.position) return;
            openPlace({ lat: geo.position.lat, lng: geo.position.lng, source: 'me' });
          }}
          onClose={closePanel}
        />
      )}
      {panel?.type === 'game' && (
        <GameSheet
          game={game}
          d={gameDerived}
          now={gameNow}
          prefillCode={inviteCode}
          geoStatus={geo.status}
          position={geo.position}
          onStartGps={() => {
            geo.start();
            setFollow(true);
          }}
          onShowPoint={(lat, lng) => focus({ lat, lng }, 16)}
          onToast={setToast}
          onOpenApp={() => setPanel({ type: 'app' })}
          onPickSpot={startSpotPick}
          onClose={closePanel}
        />
      )}
      {openClaim && game.snapshot && (
        <div className="dialog-backdrop" role="alertdialog" aria-label="Gefunden bestätigen">
          <div className="dialog">
            <span className="dialog-emoji">🎯</span>
            <h2>{game.snapshot.players[openClaim.by]?.name ?? 'Ein Fänger'} sagt: Gefunden!</h2>
            <p>Hat euch die Person wirklich entdeckt? Bestätigt nur, wenn es stimmt – dann gewinnen die Fänger.</p>
            <div className="dialog-actions">
              <button className="wide-btn secondary" onClick={() => setDismissedClaims((l) => [...l, openClaim.id])}>
                Stimmt nicht
              </button>
              <button className="wide-btn" onClick={() => game.client?.addAction({ kind: 'confirm-found', claimId: openClaim.id })}>
                Ja, gefunden
              </button>
            </div>
          </div>
        </div>
      )}
      {showDraw && gameMeta && game.snapshot && (
        <DrawShow meta={gameMeta} players={game.snapshot.players} meId={game.snapshot.me.id} clockOffset={clockOffset} onSkip={() => setSkippedDraw(gameMeta.draw!.seed)} />
      )}

      <TabBar active={activeTab} pinCount={pins.length} onSelect={selectTab} />
      <Toast message={toast} onDone={() => setToast(null)} />
      {onboarding && (
        <Onboarding
          onDone={() => {
            setOnboarding(false);
            save('onboarded.v1', true);
          }}
          onOpenApp={() => setPanel({ type: 'app' })}
        />
      )}
    </div>
  );
}
