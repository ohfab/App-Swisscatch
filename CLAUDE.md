# Zeitgeist

Versteckspiel quer durch die Schweiz mit interaktiver Karte und Fahrplan, als Web-App (Vite, React, TypeScript, Leaflet). Früher «SwissCatch», dann «Spurlos»; Repo, URL, Speicher-Schlüssel (`swisscatch.`), MQTT-Themen und die Android-Kennung `ch.spurlos.app` behalten die alten Namen, damit Links, gespeicherte Daten und App-Updates weiter funktionieren. Maskottchen ist der Geist «Geisti».
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
- Design «Tinte & Pfirsich»: Farben und Masse als CSS-Variablen in `src/styles/base.css` (auch Dunkelmodus), Stile nach Bereich in `src/styles/*.css`, Grafiken (Tropfen, Maskottchen Geisti mit `mood`) in `src/components/Art.tsx`. Logo aus `scripts/build-logo.mjs`, PNGs mit `npm run icons`. Schrift Outfit über `@fontsource-variable/outfit`. Keine `transform`-Animationen auf die Wurzel von Leaflet-Markern legen, Leaflet positioniert sie per `transform`; Marker, die oft neu gezeichnet werden, gar nicht animieren.
- App-Download: `src/components/AppSheet.tsx`, geöffnet über `?app` oder den Kurzlink `public/download/index.html`. Die Installierbarkeit merkt sich `src/hooks/useInstallPrompt.ts` modulweit, weil der Browser sie nur einmal beim Laden meldet.
- Spiel: `src/game/`. Der Host schreibt nur `meta` (Regeln, Auslosung, Startzeit), jeder Spieler nur seine eigenen `actions`. `derive.ts` rechnet daraus auf jedem Gerät gleich den Spielstand aus (Phase, Punkte, Challenges, Fallen, Flächen, Ergebnis). Inhalte wie Power-ups, Fallen und Challenges stehen in `content.ts`, Zufall immer über `rng(seed)`, damit alle Geräte dasselbe sehen.
- Android-App: Capacitor (`capacitor.config.ts`). `VITE_NATIVE=1` baut ohne Service Worker mit Basis `/`. `android/` ist nicht im Repo, `.github/workflows/android.yml` erzeugt es bei jedem Push neu (`cap add android`, `scripts/android-prepare.mjs`, `cap sync`, Gradle) und legt `Zeitgeist.apk` (plus Kopie `Spurlos.apk` für alte Links) ins Release `android-latest`. Eigene Android-Ressourcen in `native/android/res`, Signaturschlüssel `native/android/spurlos.jks`. Nach jedem Push auch diesen Lauf verfolgen. In der App ist `location.origin` nur `https://localhost`, Links nach aussen darum mit `PUBLIC_URL` aus `src/lib/native.ts`. GPS im Hintergrund über `useGeolocation().setBackground`, Zurück-Taste in `App.tsx`.
- Spiel-Broker: Standard sind zwei öffentliche Broker parallel (`DEFAULT_BROKERS` in `src/game/config.ts`). Jede Nachricht geht an alle; doppelte Nachrichten fallen über `rev` (Meta) und `seen` (Spieler) weg.
- Geisti und Fortschritt: Einführung `Onboarding.tsx` (Schlüssel `intro.v2`), Tour `Tour.tsx` (Ziele über `data-tour`), Tipps `GeistiTip` (einmalig, `tips.v1`), Profil `ProfileSheet.tsx`, Statistik, Level und Abzeichen in `src/lib/stats.ts` (`stats.v1`). Neue Abzeichen meldet `BadgePopup`. Tagesquiz `QuizSheet.tsx` (Fragen aus `dailyQuiz` in `content.ts`, Serie über `stats.quiz`), Erinnerung in der Android-App über `scheduleQuizReminder`.
- Fenster (Sheets) lädt `App.tsx` mit `React.lazy` und lädt sie im Leerlauf vor; neue Fenster dort in `loaders` eintragen. Startadressen: `?app`, `?quiz`, `?tab=game|route|pins|profile` (auch als Manifest-Schnellzugriffe).
- Wetter beim Ort: `src/lib/weather.ts` (Open-Meteo, CC BY 4.0, Quellenangabe sichtbar lassen).
- Spiel testen: Öffentliche Broker sind aus der Cloud-Umgebung nicht erreichbar. `npm run broker` starten, den Browser ohne Proxy starten und die App mit `?broker=ws://127.0.0.1:1884` öffnen; mehrere Browser-Kontexte mit verschiedenen Standorten simulieren die Spieler. Versteckzeit «1 Min (Test)» und Challenges «jede Minute» verkürzen eine Runde. In Tests `swisscatch.intro.v2` auf `true` setzen, sonst liegt die Einführung über der App. Für echte API-Daten im selben Test externe Anfragen per `ctx.route` über ein Playwright-`request.newContext({ proxy })` weiterleiten.
