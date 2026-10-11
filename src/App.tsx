import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapView } from './components/MapView';
import { SearchBar } from './components/SearchBar';
import { TabBar, type Tab } from './components/TabBar';
import { LayerSheet } from './components/LayerSheet';
import { PlaceSheet } from './components/PlaceSheet';
import { CantonSheet } from './components/CantonSheet';
import { PinsSheet } from './components/PinsSheet';
import { GameSheet } from './components/GameSheet';
import { Toast } from './components/Toast';
import { CloseIcon, LayersIcon, LocateFilledIcon, LocateIcon } from './components/Icons';
import { BASEMAPS, type BasemapId, type OverlayId } from './lib/config';
import { loadCantons, type CantonFeature } from './lib/cantons';
import type { LatLng } from './lib/geo';
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
  | { type: 'pins' }
  | { type: 'game' };

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
  const [basemap, setBasemap] = usePersistentState<BasemapId>('basemap', 'farbe');
  const [storedOverlays, setOverlays] = usePersistentState<Partial<Record<OverlayId, boolean>>>('overlays', DEFAULT_OVERLAYS);
  const overlays = useMemo(() => ({ ...DEFAULT_OVERLAYS, ...storedOverlays }), [storedOverlays]);
  const [hintSeen, setHintSeen] = usePersistentState('hint.longpress', false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [follow, setFollow] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [openStationId, setOpenStationId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { pins, addPin, updatePin, removePin } = usePins();
  const geo = useGeolocation();
  const online = useOnline();

  const validBasemap = BASEMAPS.some((b) => b.id === basemap) ? basemap : 'farbe';

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
  const fit = useCallback((bounds: L.LatLngBoundsExpression, maxZoom = 16) => {
    setFollow(false);
    afterPaint(() => {
      const map = mapRef.current;
      if (!map) return;
      const a = visibleArea();
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

  const handleTap = useCallback(
    (_p: LatLng, canton: CantonFeature | null) => {
      if (panel) {
        closePanel();
        return;
      }
      if (canton) setPanel({ type: 'canton', canton });
    },
    [panel, closePanel],
  );

  const handleLongPress = useCallback(
    (p: LatLng) => {
      setHintSeen(true);
      openPlace({ lat: p.lat, lng: p.lng, source: 'map' });
    },
    [openPlace, setHintSeen],
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

  const activeTab: Tab = panel?.type === 'pins' ? 'pins' : panel?.type === 'game' ? 'game' : 'map';
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
        {!hintSeen && !panel && (
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
          onClose={closePanel}
        />
      )}
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
          geoStatus={geo.status}
          position={geo.position}
          onStartGps={() => {
            geo.start();
            setFollow(true);
          }}
          onClose={closePanel}
        />
      )}

      <TabBar active={activeTab} pinCount={pins.length} onSelect={selectTab} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
