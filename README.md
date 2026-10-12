# SwissCatch – interaktive Schweizerkarte

Eine Karten-App für die ganze Schweiz mit einem **schweizweiten Versteckspiel für Freunde**.
Sie läuft als installierbare Web-App (PWA) auf dem Handy und am PC.

**Live:** https://ohfab.github.io/App-Swisscatch/ · **App herunterladen:** https://ohfab.github.io/App-Swisscatch/download/

<p>
  <img src="docs/screenshots/karte.jpg" width="200" alt="Strassenkarte von Bern">
  <img src="docs/screenshots/fahrplan.jpg" width="200" alt="Verbindungen von Bern nach Zermatt">
  <img src="docs/screenshots/route.jpg" width="200" alt="Route Bern–Zermatt auf der Karte">
  <img src="docs/screenshots/abfahrten.jpg" width="200" alt="Abfahrten in Zürich mit Linienfarben">
</p>

<p>
  <img src="docs/screenshots/spiel-auslosung.jpg" width="160" alt="Glücksrad lost die Teams aus">
  <img src="docs/screenshots/spiel-versus.jpg" width="160" alt="Versus-Screen Fänger gegen Verstecker">
  <img src="docs/screenshots/spiel-verstecker.jpg" width="160" alt="Ansicht der Verstecker mit eingeloggtem Versteck">
  <img src="docs/screenshots/spiel-faenger.jpg" width="160" alt="Ansicht der Fänger mit Power-ups">
  <img src="docs/screenshots/spiel-karte.jpg" width="160" alt="Karte der Fänger mit ausgeschlossenen Gebieten">
</p>

## Funktionen

- **Versteckis Schweiz:** Lobby mit Spielcode, Glücksrad für die Teams, Versus-Screen, eigene Bildschirme für Fänger und Verstecker, Power-ups, Fallen, Challenges und Rätsel. Mehr dazu unten.

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
- **Design «Tinte & Pfirsich»:** klare Konturen, Pillen-Knöpfe, tropfende Kopfzeilen, das Maskottchen Blobi und viele kleine Animationen (springende Tab-Blase, gleitende Tabs, Glücksrad, Versus-Screen).

## Das Spiel: Versteckis Schweiz

Die Hälfte der Gruppe versteckt sich irgendwo in der Schweiz, die andere Hälfte sucht sie, zum Beispiel mit dem Zug.

**Ablauf**

1. Eine Person öffnet den Tab «Spiel», tippt auf «Spiel erstellen» und teilt den Code oder den Einladungslink.
2. Die anderen treten bei. Der Host legt die Regeln fest: Spielerzahl, Versteckzeit, maximale Suchzeit, Abstand der Challenges, Punkte und Startguthaben der Fänger.
3. Ist die Lobby voll, dreht das **Glücksrad** und zieht die Verstecker, immer die Hälfte. Der Host kann auch früher auslosen.
4. Ein **Versus-Screen** zeigt die Teams, dann zählt die App 3-2-1 herunter.
5. **Versteckzeit** (Standard 90 Min): Die Verstecker reisen an ihren Ort und loggen ihr Versteck ein. Die Fänger warten, zum Beispiel im Café, und sammeln dabei schon Punkte. Ohne Login nimmt die App am Ende der Versteckzeit den aktuellen Standort.
6. **Suche:** Die Fänger reisen los und kaufen Power-ups. Sind sie beim Versteck, tippen sie auf «Gefunden!». Liegt das Versteck höchstens 200 m entfernt, zählt es sofort, sonst bestätigen die Verstecker.
7. Die Fänger gewinnen, wenn sie das Versteck finden, die Verstecker, wenn die Suchzeit abläuft. Danach startet der Host eine neue Runde: neu auslosen oder Rollen tauschen.

**Fänger**

- Sie bekommen Punkte über die Zeit (Standard 1 P pro Minute), für jede verpasste Challenge der Verstecker und für gelöste Rätsel (alle 15 Min eines).
- Mit den Punkten kaufen sie Power-ups. Schwache sind billig, starke teuer. Die App beantwortet sie ehrlich mit den eingeloggten Daten des Verstecks und graut ausgeschlossene Gebiete auf der Karte aus.

| Power-up | Frage | Punkte |
| --- | --- | --- |
| Höhenmesser | Über oder unter 800 m ü. M.? | 15 |
| Haltestellen-Check | Nächste ÖV-Haltestelle näher als 300 m? | 15 |
| Radar 2 km | Versteck im Umkreis von 2 km? | 20 |
| Einwohner | Gemeinde mit mehr oder weniger als 20'000 Einwohnern? | 20 |
| Radar 10 km | Versteck im Umkreis von 10 km? | 30 |
| Karte halbieren Nord/Süd oder Ost/West | Die unmögliche Hälfte wird ausgegraut | 30 |
| Sprachregion | Welche Sprache spricht man am Versteck? | 35 |
| Radar 50 km | Versteck im Umkreis von 50 km? | 40 |
| Foto anfordern | Verstecker schicken innert 10 Min ein Foto | 45 |
| Kanton | In welchem Kanton liegt das Versteck? | 90 |

**Verstecker**

- Alle 10 Minuten kommt eine **Challenge**. Während der Versteckzeit sind es allgemeine Schweiz-Quizfragen, die nichts verraten, denn vielleicht sind die Verstecker noch unterwegs. In der Suchphase folgen Hinweise für die Fänger: Kirchen zählen, Sprache, Wasser oder Schneeberge in Sicht, Brunnen, ÖV-Linie, später auch der Kanton und Fotos von Strasse, Himmel oder einem Gebäude.
- Erfüllte Challenges und verlangte Fotos geben Punkte. Wer eine Challenge verpasst, schenkt den Fängern 15 Punkte.
- Mit den Punkten stellen sie **Fallen**:

| Falle | Wirkung | Punkte |
| --- | --- | --- |
| Preiserhöhung | Power-ups kosten 15 Min lang 50 % mehr | 25 |
| Nebel | Die nächste Power-up-Antwort kommt erst nach 10 Min | 30 |
| Punkteklau | Die Fänger verlieren sofort 30 Punkte | 35 |
| Funkstille | Die Fänger können 10 Min lang keine Power-ups kaufen | 40 |

**Fair Play:** Die App vertraut den Spielern. Sie zeigt jedem Team nur seine eigenen Informationen. Die Fänger sehen weder das Versteck noch die Standorte der Verstecker. Das Versteck erscheint erst am Ende der Runde.

**Technik:** Die Geräte tauschen sich über einen öffentlichen MQTT-Broker aus, standardmässig `broker.emqx.io`. Alle Nachrichten und Fotos sind mit einem Schlüssel aus dem Spielcode verschlüsselt (AES-GCM). Der Broker sieht deshalb weder Namen noch Standorte. Der Host verwaltet Regeln und Auslosung. Jedes Gerät schreibt nur seine eigenen Aktionen, den Spielstand rechnet jedes Gerät gleich daraus aus. Verlässt der Host das Spiel, übernimmt automatisch der Spieler, der am längsten dabei ist.

**Eigener Broker:** Beim Build `VITE_MQTT_URL=wss://…` setzen oder die App einmal mit `?broker=wss://…` öffnen.

**Lokal testen:** `npm run broker` startet einen Broker auf `ws://127.0.0.1:1884`. Die App dann mit `?broker=ws://127.0.0.1:1884` öffnen. Mit der Versteckzeit «1 Min (Test)» und Challenges «jede Minute» lässt sich eine Runde in wenigen Minuten durchspielen.

## Am PC nutzen

Die App läuft auch im Browser am Computer, die Karte nutzt dann den ganzen Bildschirm, das Menü sitzt links.

1. https://ohfab.github.io/App-Swisscatch/download/ in Chrome oder Edge öffnen. Die Seite «App herunterladen» zeigt je nach Gerät den passenden Weg und einen QR-Code fürs Handy.
2. Auf «Jetzt installieren» klicken, oder auf das Installieren-Symbol rechts in der Adressleiste. In Edge geht es auch über das Menü «Apps → Diese Website als App installieren».
3. Die App startet danach in einem eigenen Fenster und erscheint im Startmenü bzw. im Dock.

Am PC ist der Standort meist ungenau (WLAN-Ortung). Zum Spielen unterwegs eignet sich deshalb das Handy.

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

Der Workflow in `.github/workflows/deploy.yml` baut und veröffentlicht die App bei jedem Push auf `main` oder auf den Entwicklungszweig `claude/interactive-swiss-map-app-ocuqhp`.
Er lässt sich auch von Hand im Tab «Actions» starten.

1. Im Repository unter **Settings → Pages** als Source **GitHub Actions** wählen.
2. Auf `main` pushen oder den Workflow «Deploy to GitHub Pages» manuell starten.
3. Die App ist danach unter `https://<benutzer>.github.io/App-Swisscatch/` erreichbar.
4. Auf dem Handy öffnen und zum Home-Bildschirm hinzufügen (iPhone: Teilen → «Zum Home-Bildschirm»).

## Aufbau

```
src/
  App.tsx                 Zustand der App, Sheets, Kartensteuerung
  styles/                 Design «Tinte & Pfirsich»: base (Farben, Schrift), map, shell, content, game, show, desktop
  components/
    Art.tsx               Grafiken: tropfende Kanten und Maskottchen Blobi
    MapView.tsx           Leaflet-Karte mit MapLibre-Vektorkarte, Kantone, Pins, Route, Standort
    SearchBar.tsx         Ortssuche
    PlaceSheet.tsx        Infos zu einem Punkt, Pins, ÖV
    CantonSheet.tsx       Kantonsinfos
    PinsSheet.tsx         Liste «Meine Orte»
    RouteSheet.tsx        Fahrplan: Verbindungssuche von A nach B
    GameSheet.tsx         Spiel-Tab: Start, Lobby, Regeln, Ergebnis
    game/DrawShow.tsx     Glücksrad, Versus-Screen und Countdown
    game/TeamViews.tsx    Bildschirme der Fänger und der Verstecker
    game/common.tsx       Bausteine: Punkte, Feed, Fotos, Tabs
    LayerSheet.tsx        Grundkarte und Ebenen wählen
  game/
    client.ts             Verbindung zum Broker, Lobby, Auslosung, Aktionen
    derive.ts             berechnet aus allen Aktionen den Spielstand
    content.ts            Power-ups, Fallen, Challenges, Quiz und Rätsel
    facts.ts              Fakten zum Versteck (Gemeinde, Einwohner, Höhe …)
    crypto.ts             Verschlüsselung mit dem Spielcode
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
| Gemeinde am Versteck | swisstopo, Gemeindegrenzen über api3.geo.admin.ch | Freie Nutzung mit Quellenangabe |
| Einwohnerzahl und Amtssprache der Gemeinde | [Wikidata](https://www.wikidata.org) | CC0 |
| Schrift Outfit | [Google Fonts](https://fonts.google.com/specimen/Outfit) über Fontsource | SIL Open Font License |
| Spiel-Nachrichten | [EMQX Public Broker](https://www.emqx.com/en/mqtt/public-mqtt5-broker) | Gratis Testbroker ohne Garantie; Inhalte verschlüsselt |

## Nächste Schritte

1. **Standort im Hintergrund:** Web-Apps senden den Standort nur, solange sie offen sind. Für echtes Hintergrund-Tracking lässt sich dieselbe App mit [Capacitor](https://capacitorjs.com) als native iOS- und Android-App verpacken.
2. **Eigener Broker:** Für mehr Verlässlichkeit ein eigener, kostenloser Cloud-Broker (z.B. HiveMQ Cloud oder EMQX Serverless) statt des öffentlichen Testbrokers.
3. **Minigames:** weitere Wege zu Punkten für beide Teams, z.B. Fahrplan-Aufgaben oder Schätzfragen unterwegs.
4. **Mehr Power-ups und Fallen:** z.B. Bahnlinie, Seen, Höhenlinien oder eine Falle, die eine Fänger-Frage falsch beantwortet.
