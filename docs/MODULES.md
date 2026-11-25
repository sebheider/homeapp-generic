# Externe Module für HomeApp

HomeApp unterscheidet zwei Arten von Modulen:

| | Integrierte Module | Externe Module |
|---|---|---|
| Beispiele | Wetter, 3D-Drucker, Spotify, Mähroboter | Pool, Wallbox, Bewässerung, eigene Anzeigen |
| Herkunft | fester Bestandteil der App | Paket, das der Admin hochlädt |
| Verwaltung | nur aktivieren/deaktivieren | installieren, aktualisieren, aktivieren, einrichten, entfernen |
| Code | läuft im Server und in der App | **kein** Servercode; optional eine HTML-Seite in einer Sandbox |

Beide werden unter **Einstellungen → Module** verwaltet. Diese Anleitung beschreibt, wie ein externes
Modul aufgebaut ist. Das maschinenlesbare Schema liegt in [`module.schema.json`](./module.schema.json),
zwei vollständige Beispiele unter [`examples/modules/`](../examples/modules/).

---

## Inhalt

1. [Was ein externes Modul kann – und was nicht](#was-ein-externes-modul-kann--und-was-nicht)
2. [Paketaufbau](#paketaufbau)
3. [Manifest `module.json`](#manifest-modulejson)
4. [Einstellungen (`settings`)](#einstellungen-settings)
5. [Fertige Kacheln (`cards`)](#fertige-kacheln-cards)
6. [Eigene HTML-Seite (`entry`) und Modul-SDK](#eigene-html-seite-entry-und-modul-sdk)
7. [Installation, Update und Entfernen](#installation-update-und-entfernen)
8. [Sicherheitsmodell](#sicherheitsmodell)
9. [Fehlermeldungen](#fehlermeldungen)

---

## Was ein externes Modul kann – und was nicht

Ein Modul bringt **eine eigene Seite** (Eintrag in der Navigation, Adresse `#ext-<id>`) und/oder **ein
Widget** für die frei gestaltbare Startseite mit. Den Inhalt beschreibt es auf eine von zwei Arten:

- **`cards`** – fertige Kacheln (Wert, Schalter, Schieberegler, Taster, Text), die die App selbst im
  eigenen Design zeichnet. Dafür genügt eine einzelne `module.json`, ganz ohne Programmierung.
- **`entry`** – eine eigene HTML-Seite (mit CSS, JavaScript, Bildern, Schriften). Sie läuft abgeschottet
  in einem Sandbox-Frame und spricht ausschließlich über das Modul-SDK mit der App.

Datenpunkte (ioBroker-States oder Home-Assistant-Entities) stehen **nie** im Modul. Das Modul meldet
nur „Plätze“ an (z. B. `water` = Wassertemperatur), der Admin ordnet ihnen in den Einstellungen die
echten Datenpunkte seiner Installation zu. Dadurch funktioniert dasselbe Modul mit ioBroker, Home
Assistant und im Demo-Modus.

**Nicht möglich** (bewusst): Code auf dem Server ausführen, eigene API-Routen oder Hintergrunddienste,
Zugriff auf Zugangsdaten, andere Einstellungen oder nicht zugeordnete Datenpunkte, Benachrichtigungen
oder Szenen anlegen. Dafür ist ein integriertes Modul (Änderung am Quellcode) der richtige Weg.

---

## Paketaufbau

Ein Paket ist entweder

- eine einzelne **`module.json`** (Module nur mit `cards`), oder
- ein **ZIP-Archiv** mit `module.json` im obersten Ordner und beliebigen weiteren Dateien. Ein ZIP, das
  den Modulordner selbst enthält (`pool/module.json`), wird ebenfalls akzeptiert.

```
wallbox.zip
├─ module.json
├─ index.html
├─ app.js
├─ style.css
└─ img/logo.svg
```

Regeln für Pakete:

- höchstens **5 MB** gepackt, **20 MB** entpackt und **200 Dateien**,
- Dateinamen nur aus Buchstaben, Ziffern, `.`, `_`, `-` und Unterordnern (keine Leerzeichen, kein `..`),
- erlaubte Dateitypen: `.html .js .css .json .svg .png .jpg .jpeg .gif .webp .ico .woff .woff2 .txt .md`,
- versteckte Dateien (`.DS_Store` …) und `__MACOSX/` werden ignoriert; verschlüsselte und ZIP64-Archive
  werden abgelehnt.

Ein ZIP erzeugst du z. B. mit `cd wallbox && zip -r ../wallbox.zip .` oder unter Windows mit
`Compress-Archive -Path wallbox\* -DestinationPath wallbox.zip`.

---

## Manifest `module.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/sebheider/homeapp-generic/main/docs/module.schema.json",
  "manifestVersion": 1,
  "id": "pool",
  "name": "Pool",
  "version": "1.0.0",
  "description": "Wassertemperatur und Filterpumpe",
  "author": "Max Mustermann",
  "homepage": "https://example.com/homeapp-pool",
  "icon": "waves",
  "settings": [
    { "key": "water", "type": "datapoint", "label": "Wassertemperatur", "required": true },
    { "key": "pump", "type": "datapoint", "label": "Filterpumpe", "write": true }
  ],
  "page": {
    "title": "Pool",
    "cards": [
      { "type": "value", "label": "Wasser", "datapoint": "water", "unit": "°C", "decimals": 1 },
      { "type": "switch", "label": "Filterpumpe", "datapoint": "pump" }
    ]
  },
  "widget": { "size": [3, 2], "cards": [{ "type": "value", "datapoint": "water", "unit": "°C" }] }
}
```

| Feld | Pflicht | Beschreibung |
|------|:------:|--------------|
| `manifestVersion` | ✔ | Immer `1` (Version dieses Schemas). |
| `id` | ✔ | 2–40 Zeichen, Kleinbuchstaben, Ziffern und `-`, beginnt mit einem Buchstaben. Ordnername und Teil der Adresse. Namen der App (`weather`, `settings`, `api` …) sind reserviert. |
| `name` | ✔ | Anzeigename (max. 40 Zeichen). |
| `version` | ✔ | Versionsnummer `x.y.z` (optional mit `-beta.1` o. ä.). |
| `description`, `author`, `homepage` | | Beschreibung (300), Autor (80), Projektseite (`http(s)://`). |
| `icon` | | Symbolname aus dem Symbolvorrat der App, z. B. `waves`, `car`, `sun`, `plug`, `droplets`, `thermometer`, `zap`, `flower`, `sprout`, `battery`, `fan`, `lock`. Unbekannte Namen zeigen ein Puzzleteil. |
| `settings` | | Bis zu 30 [Einstellungen](#einstellungen-settings). |
| `page` | ✔¹ | Eigene Seite: `title` (optional) und **genau eines** von `cards` oder `entry`. |
| `widget` | ✔¹ | Startseiten-Widget: `size` (`[Breite 1–12, Höhe 1–24]` Rasterfelder, Standard `[4, 3]`) und **genau eines** von `cards` oder `entry`. |

¹ mindestens eines von `page` und `widget`. Unbekannte Felder werden ignoriert, `$schema` darf für die
Editor-Prüfung (z. B. in VS Code) gesetzt werden.

---

## Einstellungen (`settings`)

Jede Einstellung erscheint als Eingabefeld unter *Einstellungen → Module* und wird mit den übrigen
Einstellungen gespeichert.

| `type` | Eingabe | Zusätzliche Felder |
|--------|---------|--------------------|
| `datapoint` | Datenpunktsuche (ioBroker / Home Assistant) | `write: true` – das Modul darf schreiben (sonst nur lesen) |
| `text` | Textfeld (max. 200 Zeichen) | `default` |
| `number` | Zahl | `min`, `max`, `step`, `unit`, `default` |
| `boolean` | Schalter | `default` |
| `select` | Auswahlliste | `options: [{ "value", "label" }]`, `default` (Standard: erste Option) |

Gemeinsame Felder: `key` (Pflicht, Buchstaben/Ziffern/`_`, eindeutig), `label` (Pflicht),
`description`, `required`. Fehlt ein Pflichtfeld, zeigen Seite und Widget einen Hinweis.

---

## Fertige Kacheln (`cards`)

| `type` | Anzeige | Felder |
|--------|---------|--------|
| `value` | Wert eines Datenpunkts (Zahlen deutsch formatiert, `true`/`false` als „an“/„aus“) | `datapoint`, `label`, `unit`, `decimals` (0–4) |
| `switch` | Ein/Aus-Schalter | `datapoint` (mit `write: true`), `label` |
| `slider` | Schieberegler | `datapoint` (mit `write: true`), `label`, `min` (0), `max` (100), `step` (1), `unit` |
| `button` | Taster, schreibt einen festen Wert; links steht der Name des Datenpunkt-Platzes | `datapoint` (mit `write: true`), `label` (Beschriftung des Knopfs, Standard „Auslösen“), `value` (Pflicht), `confirm` (Sicherheitsabfrage) |
| `text` | Freier Hinweistext | `text` (Pflicht), `label` |

`datapoint` ist der `key` einer Einstellung vom Typ `datapoint` – nicht die ID des Datenpunkts.

---

## Eigene HTML-Seite (`entry`) und Modul-SDK

Mit `"entry": "index.html"` zeigt die App die Datei des Pakets in einem Sandbox-Frame. Die Seite bindet
das SDK ein, das die App unter `/module-sdk.js` bereitstellt:

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="style.css">
  <script src="/module-sdk.js"></script>
</head>
<body>
  <span id="water">–</span> °C
  <button id="pump">Pumpe</button>
  <script>
    HomeApp.onInit(function (info) {
      // info.view: "page" oder "widget", info.settings: übrige Einstellungen, info.theme: "dark" | "light"
    });
    HomeApp.onChange(function (values, changed) {
      document.getElementById('water').textContent = HomeApp.get('water') ?? '–';
    });
    document.getElementById('pump').onclick = function () {
      HomeApp.set('pump', HomeApp.get('pump') !== true).catch(function (err) { alert(err.message); });
    };
  </script>
</body>
</html>
```

| SDK | Beschreibung |
|-----|--------------|
| `HomeApp.onInit(fn)` | `fn(info)` nach dem Start und nach jeder Änderung der Einstellungen oder des Designs. `info` enthält `module` (`id`, `name`, `version`), `view` (`page`/`widget`), `theme`, `colors`, `settings` (alle Einstellungen außer Datenpunkten), `datapoints` (je Platz `label`, `write`, `mapped`) und `values`. |
| `HomeApp.onChange(fn)` | `fn(values, changedKeys)` bei jeder Änderung eines zugeordneten Datenpunkts. `values[key]` ist `{ val, ts }` oder `null`. |
| `HomeApp.get(key)` | Aktueller Wert eines Datenpunkt-Platzes (`undefined`, wenn unbekannt). |
| `HomeApp.set(key, value)` | Schreibt einen Platz mit `write: true`. Erlaubt sind Text, Zahl, `true`/`false` und `null`. Liefert ein Promise, das bei Ablehnung oder Fehler mit einer Meldung scheitert. |
| `HomeApp.settings`, `HomeApp.info` | Letzte Einstellungen bzw. letzte Init-Nachricht. |

Darstellung:

- Das Design kommt als `data-theme="dark|light"` auf `<html>` und als CSS-Variablen
  `--homeapp-bg`, `--homeapp-bg2`, `--homeapp-fg`, `--homeapp-muted`, `--homeapp-card`, `--homeapp-line`,
  `--homeapp-accent`. Der Hintergrund des Frames ist transparent.
- **Seiten** wachsen mit ihrem Inhalt (das SDK meldet die Höhe). **Widgets** haben die Größe ihres
  Rasterfelds; dieselbe HTML-Datei kann über `info.view` beides abdecken.

Technische Grenzen der Sandbox (Herkunft `null`):

- Dateien des eigenen Pakets per `<script src>`, `<link>`, `<img>` laden ist möglich; **`fetch()`
  oder `type="module"`-Skripte auf eigene Paketdateien** funktionieren nicht zuverlässig (sie
  bräuchten CORS und, bei aktivem Zugriffsschutz, Anmeldedaten). Daten deshalb in JS/JSON-Dateien
  per `<script>` einbinden oder über das SDK beziehen.
- `localStorage`, Cookies, Pop-ups, Navigation der App und Zugriff auf die App-API sind gesperrt.
- Anfragen an fremde Internetdienste sind möglich, sofern diese CORS erlauben.

### Nachrichtenprotokoll

Wer das SDK nicht nutzen möchte, kann das Protokoll `homeapp-module/1` direkt über `postMessage`
sprechen. Jede Nachricht trägt `protocol: "homeapp-module/1"`:

| Richtung | `type` | Inhalt |
|----------|--------|--------|
| Modul → App | `ready` | Seite ist bereit; die App antwortet mit `init`. |
| App → Modul | `init` | siehe `HomeApp.onInit` |
| App → Modul | `values` | `values`: nur die geänderten Plätze |
| Modul → App | `set` | `requestId` (Zahl), `key`, `value` |
| App → Modul | `result` | `requestId`, `ok`, `error` |
| Modul → App | `resize` | `height` in Pixeln (nur Seiten) |

---

## Installation, Update und Entfernen

1. *Einstellungen → Module → Externe Module → **Modul installieren*** und das ZIP bzw. die `module.json`
   wählen. Der Server prüft das Paket vollständig, bevor er es übernimmt, und nennt bei Fehlern das Feld.
2. Das Modul erscheint **deaktiviert**. Schalter einschalten, Datenpunkte und Einstellungen eintragen und
   **Speichern**.
3. Seite und Widget erscheinen auf allen Geräten. Das Widget fügst du über *Bearbeiten → Widget →
   Externes Modul* auf der eigenen Startseite hinzu.

- **Update:** dasselbe Modul (gleiche `id`) mit höherer – oder beliebiger – `version` installieren. Die
  Dateien werden ausgetauscht, Aktivierung und Einstellungen bleiben erhalten; Einstellungen, die es in
  der neuen Version nicht mehr gibt, entfallen. Scheitert die Prüfung, bleibt die alte Version aktiv.
- **Entfernen** löscht die Dateien und die gespeicherten Einstellungen des Moduls.
- Die Pakete liegen in `<DATA_DIR>/modules/<id>/` (Container: `/data/modules`); mit `MODULES_DIR` lässt
  sich ein anderer Ordner verwenden. Von Hand dorthin kopierte Modulordner werden beim Start geladen;
  fehlerhafte erscheinen mit ihrer Fehlermeldung in der Liste.

---

## Sicherheitsmodell

- Module führen **keinen Code auf dem Server** aus. Ihre HTML-Seiten werden mit
  `Content-Security-Policy: sandbox allow-scripts allow-forms` ausgeliefert und im Frame mit
  `sandbox="allow-scripts allow-forms"` gezeigt: Sie haben eine eigene, leere Herkunft und kommen weder an
  Speicher, Sitzung noch API der App.
- Der Server lehnt ändernde Anfragen von abgeschotteten Seiten (`Origin: null`) und fremden Websites
  (`Sec-Fetch-Site: cross-site`) sowie WebSocket-Verbindungen von dort ab.
- Ein Modul bekommt nur die Werte der ihm **zugeordneten** Datenpunkte – adressiert über seine eigenen
  Platznamen, ohne die echten IDs zu erfahren – und darf nur die Plätze schreiben, die es mit
  `write: true` anmeldet und denen der Admin einen Datenpunkt zugeordnet hat.
- Einstellungen von Modulen sind für alle Nutzer der App sichtbar; sie sind **nicht** für Passwörter oder
  API-Schlüssel gedacht.
- Eine HTML-Seite kann Daten, die sie bekommt, an Internetdienste senden. Installiere Module daher nur aus
  vertrauenswürdigen Quellen und prüfe, welche Datenpunkte du zuordnest.

---

## Fehlermeldungen

| Meldung | Ursache |
|---------|---------|
| `"manifestVersion" muss 1 sein` | Feld fehlt oder das Modul ist für eine neuere App-Version geschrieben. |
| `"id": "…" ist für die App reserviert` | Eine andere `id` wählen. |
| `"page" braucht genau eines von "entry" … oder "cards"` | Beides oder keines angegeben. |
| `Einstellung "…" braucht "write": true` | `switch`, `slider` und `button` brauchen einen schreibbaren Platz. |
| `Datei "…" fehlt im Paket` | `entry` zeigt auf eine Datei, die nicht im ZIP liegt (Groß-/Kleinschreibung beachten). |
| `Dateityp nicht erlaubt` / `Unzulässiger Dateiname` | Datei entfernen bzw. umbenennen. |
| `module.json fehlt im Paket` | Die Datei liegt nicht im obersten Ordner des ZIP. |
| `Das Paket ist größer als 5 MB` | Bilder verkleinern, nicht benötigte Dateien entfernen. |
