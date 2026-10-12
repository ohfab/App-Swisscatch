// Passt das von «npx cap add android» erzeugte Projekt an Spurlos an:
// App-Symbol, Startbild, Benachrichtigungssymbol, Version und Signatur.
// Aufruf nach «npx cap add android», vor «npx cap sync android» und Gradle.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'android/app');
const res = join(app, 'src/main/res');
if (!existsSync(res)) throw new Error('android/ fehlt – zuerst «npx cap add android» ausführen');

// 1. Vorlagenbilder von Capacitor entfernen (Startbilder, Capacitor-Logo)
for (const dir of readdirSync(res)) {
  const d = join(res, dir);
  for (const f of ['splash.png', 'ic_launcher_foreground.png', 'ic_launcher_foreground.xml', 'ic_launcher_background.xml']) {
    if (existsSync(join(d, f)) && !(dir === 'values' && f === 'ic_launcher_background.xml')) rmSync(join(d, f));
  }
}
for (const dir of readdirSync(res)) {
  if (dir.startsWith('drawable') && readdirSync(join(res, dir)).length === 0) rmSync(join(res, dir), { recursive: true });
}

// 2. Eigene Ressourcen darüberlegen (Symbole, Startbild, Farben, Texte)
cpSync(join(root, 'native/android/res'), res, { recursive: true });

// 3. Version und Signatur in app/build.gradle
const gradlePath = join(app, 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
const code = Number.parseInt(process.env.VERSION_CODE ?? '1', 10) || 1;
const name = process.env.VERSION_NAME ?? `1.${code}`;
gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${name}"`);

// Schlüssel: aus Umgebungsvariablen (GitHub-Secrets), sonst der Schlüssel im Repo
const keystore = (process.env.ANDROID_KEYSTORE_FILE ?? join(root, 'native/android/spurlos.jks')).replaceAll('\\', '/');
const signing = `
    signingConfigs {
        release {
            storeFile file("${keystore}")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "spurlos-public"
            keyAlias System.getenv("ANDROID_KEY_ALIAS") ?: "spurlos"
            keyPassword System.getenv("ANDROID_KEY_PASSWORD") ?: "spurlos-public"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release`;
if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(/\n {4}buildTypes \{\n {8}release \{/, signing);
  if (!gradle.includes('signingConfig signingConfigs.release')) throw new Error('build.gradle: buildTypes.release nicht gefunden');
}
writeFileSync(gradlePath, gradle);

console.log(`Android vorbereitet: Version ${name} (${code}), Schlüssel ${keystore}`);
