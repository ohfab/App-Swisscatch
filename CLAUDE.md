# Spurlos

Versteckspiel quer durch die Schweiz mit interaktiver Karte und Fahrplan, als Web-App (Vite, React, TypeScript, Leaflet). Früher «SwissCatch»; Repo, URL, Speicher-Schlüssel (`swisscatch.`) und MQTT-Themen behalten den alten Namen, damit Links und gespeicherte Daten weiter funktionieren.
Live: https://ohfab.github.io/App-Swisscatch/

## Arbeitsweise

Der Besitzer wünscht: Jede gewünschte Änderung sofort umsetzen und wieder veröffentlichen, ohne nachzufragen.

1. Änderung umsetzen. Texte in der App sind Schweizer Hochdeutsch, also «ss» statt «ß».
2. `npm run build` muss fehlerfrei durchlaufen. Er enthält den TypeScript-Check.
3. Wenn möglich die App im Browser prüfen, am besten im iPhone-Format.
4. Committen und auf `claude/interactive-swiss-map-app-ocuqhp` pushen.
5. Der Push startet `.github/workflows/deploy.yml` und veröffentlicht auf GitHub Pages. Den Lauf bis zum Ende verfolgen und danach die Live-Seite prüfen.
6. In jeder Antwort an den Besitzer den App-Download mitgeben: https://ohfab.github.io/App-Swisscatch/download/ (öffnet die Seite «App herunterladen» mit Installieren-Knopf, Anleitung und QR-Code).

## Hinweise

- Kantonsdaten in `public/data` entstehen mit `npm run geodata` aus dem Paket `swiss-maps`.
- Für GitHub Pages setzt der Workflow `BASE_PATH=/App-Swisscatch/`. Pfade zu Dateien in `public/` deshalb immer mit `import.meta.env.BASE_URL` bauen.
- swisstopo liefert Kacheln nur ungefähr zwischen 44.6° und 49.0° Nord, siehe `TILE_BOUNDS` in `src/lib/config.ts`.
- Die Strassenkarte ist eine MapLibre-Vektorkarte in Leaflet. MapLibre braucht `setWorkerUrl` mit der gebündelten Worker-Datei, sonst bleibt die Karte leer.
- Fahrplandaten kommen von search.ch. Mit Koordinaten als Ziel sucht search.ch nur kurz voraus, darum gibt es in `RouteSheet.tsx` einen Rückfall auf die nächste Haltestelle.
- Bei Browsertests mit der Vektorkarte nicht auf «networkidle» warten, und `.mjs` als JavaScript ausliefern.
- Design «Tinte & Pfirsich»: Farben und Masse als CSS-Variablen in `src/styles/base.css` (auch Dunkelmodus), Stile nach Bereich in `src/styles/*.css`, Grafiken (Tropfen, Maskottchen Blobi) in `src/components/Art.tsx`. Schrift Outfit über `@fontsource-variable/outfit`. Keine `transform`-Animationen auf die Wurzel von Leaflet-Markern legen, Leaflet positioniert sie per `transform`; Marker, die oft neu gezeichnet werden, gar nicht animieren.
- App-Download: `src/components/AppSheet.tsx`, geöffnet über `?app` oder den Kurzlink `public/download/index.html`. Die Installierbarkeit merkt sich `src/hooks/useInstallPrompt.ts` modulweit, weil der Browser sie nur einmal beim Laden meldet.
- Spiel: `src/game/`. Der Host schreibt nur `meta` (Regeln, Auslosung, Startzeit), jeder Spieler nur seine eigenen `actions`. `derive.ts` rechnet daraus auf jedem Gerät gleich den Spielstand aus (Phase, Punkte, Challenges, Fallen, Flächen, Ergebnis). Inhalte wie Power-ups, Fallen und Challenges stehen in `content.ts`, Zufall immer über `rng(seed)`, damit alle Geräte dasselbe sehen.
- Spiel testen: Öffentliche Broker sind aus der Cloud-Umgebung nicht erreichbar. `npm run broker` starten, den Browser ohne Proxy starten und die App mit `?broker=ws://127.0.0.1:1884` öffnen; mehrere Browser-Kontexte mit verschiedenen Standorten simulieren die Spieler. Versteckzeit «1 Min (Test)» und Challenges «jede Minute» verkürzen eine Runde. Für echte API-Daten im selben Test externe Anfragen per `ctx.route` über ein Playwright-`request.newContext({ proxy })` weiterleiten.
