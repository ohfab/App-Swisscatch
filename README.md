# SwissCatch – interaktive Schweizerkarte

Eine Karten-App für die ganze Schweiz, gebaut als installierbare Web-App (PWA).
Sie ist die Grundlage für ein späteres **schweizweites Fangen-Spiel mit Freunden**.

<p>
  <img src="docs/screenshots/karte.jpg" width="200" alt="Strassenkarte von Bern">
  <img src="docs/screenshots/fahrplan.jpg" width="200" alt="Verbindungen von Bern nach Zermatt">
  <img src="docs/screenshots/route.jpg" width="200" alt="Route Bern–Zermatt auf der Karte">
  <img src="docs/screenshots/abfahrten.jpg" width="200" alt="Abfahrten in Zürich mit Linienfarben">
</p>

## Funktionen

- **Das grosse Fangen:** Lobby mit Spielcode und Einladungslink, Teams aus Jägern und Gejagten, einstellbare Regeln und Live-Standorte auf der Karte. Mehr dazu unten.

- **Strassenkarte im Google-Stil:** die Vektor-Basiskarte von swisstopo mit Strassennamen, Gebäuden, Haltestellen, ÖV-Linien und Sehenswürdigkeiten. Sie ist in jeder Zoomstufe scharf.
- **Weitere Karten:** Luftbild mit Strassennamen, klassische Landeskarte und Winterkarte.
- **Kantone:** farbige Grenzen und Namen. Antippen zeigt Hauptort, Fläche, Sprachen und Nachbarkantone.
- **Spielfeld Schweiz:** Das Ausland ist abgedunkelt, die Landesgrenze rot markiert.
- **Suche:** Orte, Adressen, Berge, Seen und Postleitzahlen über den Suchdienst von geo.admin.ch.
- **Punkt-Infos:** Lange drücken (am Computer Rechtsklick) zeigt Höhe, Kanton, Koordinaten (LV95 und GPS) und Distanz zu dir.
- **Fahrplan:** ÖV-Verbindungen von A nach B, ab dem eigenen Standort oder zu jedem Punkt auf der Karte. Mit Gleisen, Umstiegen, Verspätungen und der Route als Linie auf der Karte.
- **Abfahrten:** nächste Haltestellen mit Live-Abfahrten in den Originalfarben der Linien.
- **Eigener Standort:** Live-Position mit Genauigkeit, Folgen-Modus und Fahrtrichtung.
- **Pins:** Treffpunkte oder Verstecke speichern, benennen, einfärben, teilen. Sie bleiben auf dem Gerät gespeichert.
- **Zusatzebenen:** ÖV-Haltestellen und Wanderwege.
- **App-Gefühl:** Vollbild, Bottom-Sheets, Tab-Leiste, Dunkelmodus, installierbar, offline nutzbar für bereits geladene Kartenteile.

## Das Spiel

1. Eine Person tippt im Tab «Spiel» auf «Spiel erstellen» und teilt den Einladungslink.
2. Die anderen öffnen den Link, geben ihren Namen ein und treten bei.
3. In der Lobby wählt jede Person ihr Team, der Host legt die Regeln fest: Spieldauer, Vorsprung, Ping-Abstand, Sichtbarkeit der Jäger und ob Gefangene zu Jägern werden.
4. Nach dem Start sehen die Jäger die Gejagten nur bei jedem Ping. Die Jäger selbst sind je nach Regel live, nur beim Ping oder gar nicht sichtbar.
5. Ein Jäger meldet einen Fang, der Gejagte bestätigt ihn. Sind alle gefangen oder ist die Zeit um, endet die Runde mit einer Auswertung.

**Technik:** Die Handys tauschen sich über einen öffentlichen MQTT-Broker aus, standardmässig `broker.emqx.io`. Alle Nachrichten sind mit einem Schlüssel aus dem Spielcode verschlüsselt (AES-GCM). Der Broker sieht deshalb weder Namen noch Standorte. Der Host verwaltet Teams und Spielstand. Verlässt er das Spiel, übernimmt automatisch der Spieler, der am längsten dabei ist.

**Eigener Broker:** Beim Build `VITE_MQTT_URL=wss://…` setzen oder die App einmal mit `?broker=wss://…` öffnen.

**Lokal testen:** `npm run broker` startet einen Broker auf `ws://127.0.0.1:1884`. Die App dann mit `?broker=ws://127.0.0.1:1884` öffnen.

## Loslegen

Voraussetzung ist Node.js 20 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm run build      # Produktionsbuild in dist/
npm run preview    # Build lokal ansehen
```

Auf dem Handy im selben WLAN geht es mit `npm run dev -- --host`.
Der Standort funktioniert auf dem Handy aber nur über **HTTPS**, also am einfachsten über GitHub Pages.

## Veröffentlichen mit GitHub Pages

Der Workflow in `.github/workflows/deploy.yml` baut und veröffentlicht die App bei jedem Push auf `main`.
Er lässt sich auch von Hand im Tab «Actions» starten.

1. Im Repository unter **Settings → Pages** als Source **GitHub Actions** wählen.
2. Auf `main` pushen oder den Workflow «Deploy to GitHub Pages» manuell starten.
3. Die App ist danach unter `https://<benutzer>.github.io/App-Swisscatch/` erreichbar.
4. Auf dem Handy öffnen und zum Home-Bildschirm hinzufügen (iPhone: Teilen → «Zum Home-Bildschirm»).

## Aufbau

```
src/
  App.tsx                 Zustand der App, Sheets, Kartensteuerung
  components/
    MapView.tsx           Leaflet-Karte mit MapLibre-Vektorkarte, Kantone, Pins, Route, Standort
    SearchBar.tsx         Ortssuche
    PlaceSheet.tsx        Infos zu einem Punkt, Pins, ÖV
    CantonSheet.tsx       Kantonsinfos
    PinsSheet.tsx         Liste «Meine Orte»
    RouteSheet.tsx        Fahrplan: Verbindungssuche von A nach B
    GameSheet.tsx         Spiel-Tab (Vorbereitung, geplante Funktionen)
    LayerSheet.tsx        Grundkarte und Ebenen wählen
  hooks/                  Standort, Pins, Installation, Online-Status
  lib/
    config.ts             Kartenebenen und Grenzen
    geoadmin.ts           Suche und Höhenabfrage (api3.geo.admin.ch)
    transport.ts          Haltestellen, Abfahrten und Verbindungen (search.ch)
    geo.ts                Distanzen, LV95-Umrechnung, Punkt-in-Polygon
public/data/              Kantons- und Landesgrenzen als GeoJSON
scripts/build-geodata.mjs erzeugt public/data aus dem Paket swiss-maps
```

Die Kantonsdaten lassen sich mit `npm run geodata` neu erzeugen, etwa nach einer Gemeindefusion.

## Datenquellen

| Daten | Quelle | Bedingungen |
| --- | --- | --- |
| Karten, Vektorkarte, Luftbild, Höhen, Suche | [swisstopo / geo.admin.ch](https://www.geo.admin.ch) | Freie Nutzung mit Quellenangabe «© swisstopo» |
| ÖV-Haltestellen-Ebene | Bundesamt für Verkehr (BAV) | Freie Nutzung mit Quellenangabe |
| Fahrplan und Abfahrten | [search.ch](https://search.ch/timetable/api/help) | Gratis, pro Tag 1000 Verbindungssuchen und 10'080 Abfahrtstafeln |
| Kantonsgrenzen | BFS / swisstopo über [swiss-maps](https://github.com/interactivethings/swiss-maps) | BSD-3-Clause |
| Spiel-Nachrichten | [EMQX Public Broker](https://www.emqx.com/en/mqtt/public-mqtt5-broker) | Gratis Testbroker ohne Garantie; Inhalte verschlüsselt |

## Nächste Schritte

1. **Standort im Hintergrund:** Web-Apps senden den Standort nur, solange sie offen sind. Verpasste Pings holt die App beim Öffnen nach. Für echtes Hintergrund-Tracking lässt sich dieselbe App mit [Capacitor](https://capacitorjs.com) als native iOS- und Android-App verpacken.
2. **Eigener Broker:** Für mehr Verlässlichkeit ein eigener, kostenloser Cloud-Broker (z.B. HiveMQ Cloud oder EMQX Serverless) statt des öffentlichen Testbrokers.
3. **Zonen:** Spielfeld eingrenzen, Kantone sperren, schrumpfende Zonen. Die Kantonsdaten sind schon da.
4. **ÖV-Regeln:** z.B. nur bestimmte Verkehrsmittel erlaubt oder Fahrplan-Aufgaben für die Gejagten.
