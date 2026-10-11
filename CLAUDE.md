# SwissCatch

Interaktive Schweizerkarte als Web-App (Vite, React, TypeScript, Leaflet).
Live: https://ohfab.github.io/App-Swisscatch/

## Arbeitsweise

Der Besitzer wünscht: Jede gewünschte Änderung sofort umsetzen und wieder veröffentlichen, ohne nachzufragen.

1. Änderung umsetzen. Texte in der App sind Schweizer Hochdeutsch, also «ss» statt «ß».
2. `npm run build` muss fehlerfrei durchlaufen. Er enthält den TypeScript-Check.
3. Wenn möglich die App im Browser prüfen, am besten im iPhone-Format.
4. Committen und auf `claude/interactive-swiss-map-app-ocuqhp` pushen.
5. Der Push startet `.github/workflows/deploy.yml` und veröffentlicht auf GitHub Pages. Den Lauf bis zum Ende verfolgen und danach die Live-Seite prüfen.

## Hinweise

- Kantonsdaten in `public/data` entstehen mit `npm run geodata` aus dem Paket `swiss-maps`.
- Für GitHub Pages setzt der Workflow `BASE_PATH=/App-Swisscatch/`. Pfade zu Dateien in `public/` deshalb immer mit `import.meta.env.BASE_URL` bauen.
- swisstopo liefert Kacheln nur ungefähr zwischen 44.6° und 49.0° Nord, siehe `TILE_BOUNDS` in `src/lib/config.ts`.
