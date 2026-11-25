# HomeApp

Moderne Smart-Home-Oberfläche mit **ioBroker** und optionaler **Synology Surveillance Station**.
Läuft als einzelner Container (React-Frontend + Node.js-Server) auf Systemen mit Docker Compose,
einschließlich Synology. Ohne ioBroker ist der Demo-Modus nutzbar; eine andere Smart-Home-Plattform
als Live-Datenquelle wird derzeit nicht unterstützt.

## Herkunft und Entwicklung

HomeApp Generic basiert auf [HomeApp von Sebastian Heider](https://github.com/sebheider/homeapp).
Das ursprüngliche Projekt entstand als Smart-Home-Oberfläche für ioBroker und die Synology
Surveillance Station, zunächst mit einem auf Synology zugeschnittenen Deployment. Diese eigenständige
Codeübernahme macht den Betrieb auf anderen Systemen mit Linux-Containern zum Standardweg; Synology
bleibt als optionale Kamera-Integration und als mögliches Hostsystem erhalten. Der importierte Stand
enthält nicht die Git-Historie des Ursprungsprojekts; dessen Verlauf ist im ursprünglichen Repository
nachvollziehbar.

Die Entwicklung erfolgte schrittweise durch Sebastian Heider mit Unterstützung von GitHub Copilot;
Beiträge und KI-Unterstützung sind in der Historie des Ursprungsprojekts anhand von Commits und
Co-Author-Trailern dokumentiert. Die Anwendung kombiniert ein React-/TypeScript-Frontend mit einem
Node.js-/Express-Backend, REST und WebSockets. Tests für Backend, Frontend und den optionalen
Kiosk-Agenten sowie automatisierte Container-Builds unterstützen die Weiterentwicklung. Der Quellcode
ist nicht automatisch für weitere Plattformen austauschbar: ioBroker bleibt derzeit die einzige
unterstützte Live-Datenquelle für Smart-Home-Datenpunkte.

- 🛰️ **Übersicht als Kommandozentrale** – animierte Live-Anzeigen auf einen Blick: Uhr, „Home Core“ mit dem Zustand des Hauses, Wetter mit UV-Index und UV-Prognose, Rundinstrumente für Batterie (Flüssigkeitsanzeige), Licht und Wärmepumpe, Energiefluss mit 24-h-Kurve (während der Mähroboter mäht, stattdessen seine Live-Karte), Kameras mit Aktivitäts-Zeitleiste und alle Räume als leuchtende Kacheln
- 🧊 **Design „Nexus“ (wählbar)** – holografischer digitaler Zwilling des Hauses mit schwebenden Etagen, Live-Werten an den Räumen, Hinweisen, Energie-Wellenform und Cockpit-Panels
- 🧩 **Eigene Startseite (wählbar)** – frei gestaltbar aus Widgets (Uhr, Home Core, Wetter, einzelne Wetter- und Energieanzeigen wie UV-Index oder Regenradar, Rundinstrumente, Energiefluss, Sicherheit, Kamera, Räume, Szenen, Licht, Geräte, 3D-Drucker, Spotify, Müllabfuhr, Lüften, Text), die du direkt auf der Übersicht in einem Raster platzierst, verschiebst und in der Größe änderst; der Inhalt wächst mit der Widgetgröße
- 💡 **Licht & Steckdosen** – schalten, dimmen, Farben, „Alle aus“
- 🔥 **Heizung & Klima** – Thermostate mit Soll-Wert-Drehregler, Klimaanlagen (je Betriebsart ein Sollwert), Wärmepumpe mit Warmwasser, Verdichter (Schalter oder Drehzahl) und Stromverbrauch (in W oder kW)
- 🪟 **Rollläden** – animierte Position, Auf / Stopp / Zu
- ☀️ **Energie** – animierter Energiefluss (PV, Netz, Batterie, Haus, Wallbox), Kennzahlen und 6/24/48-h-Verlaufsdiagramme
- 🌤️ **Wetter** – eigene Seite mit aktuellem Wetter (lokale Wetterstation + Internet), Stundenverlauf, Sonnenauf-/-untergang, UV-Index mit Stundenprognose, 3-Tage-Vorschau und animiertem Regenradar; Standort frei einstellbar. Nachts zeigt das Wettersymbol den Mond mit berechneter Phase, Schattenseite und standortabhängiger Neigung.
- 📹 **Kameras** – Live-Bilder und MJPEG-Livestream aus der Surveillance Station, **automatische Einblendung bei Bewegung** (mittig und groß oder klein in der Ecke, einstellbar), bei Bedarf zeitweise pausierbar mit automatischer Reaktivierung und dauerhafter Statusmeldung
- 🖨️ **3D-Drucker (OctoPrint oder Bambu Lab)** – eigene Seite mit Webcam (auch als Live-Stream), Fortschritt, Restzeit, Fertigstellungszeit und Temperaturkurven; während des Drucks auf allen Übersichts-Designs sichtbar und regelmäßig als Webcam-Einblendung (Intervall einstellbar), dazu eine Meldung, wenn der Druck fertig ist
- 🎵 **Spotify Connect** – eigene Spotify-Seite mit Suche (Titel, Alben, Künstler, Playlists), eigenen Playlists, Warteschlange, zuletzt gehörten Titeln und Gerätewahl (z. B. der Verstärker); solange Musik läuft, ein Mini-Player auf allen Übersichts-Designs mit Lautstärke, Weiter/Zurück, Pause/Fortsetzen, Zufall und Wiederholen
- 🤖 **Mähroboter (Navimow)** – eigene Seite mit Live-Karte der aktuellen Mähsitzung (gemähte Bahnen, Position und Fahrtrichtung, Ladestation), Fortschritt, Akku, gemähter Fläche und allen Befehlen (Start, Pause, Fortsetzen, Zur Station, Status abrufen, Karte zurücksetzen); Datenpunkte kommen aus dem ioBroker-Adapter `navimow`
- 🔔 **Benachrichtigungen** – eigene Alarme und Hinweise (z. B. Luftfeuchte zu hoch, Temperatur zu niedrig, Fenster offen); ein Tipp springt zum Bereich
- 🗑️ **Müllabfuhr** – Abfuhrkalender des Entsorgers (ICS/webcal) mit Erinnerung am Vorabend und am Abholtag, Status-Chip und Widget
- 🌬️ **Lüftungsempfehlung** – je Raum aus Luftfeuchte (absolut, mit Außenluft verglichen), CO₂ und Temperatur; Schwellen einstellbar
- 📡 **Kiosk-Sensoren am Raspberry Pi** – Präsenzradar LD2410 (Display aus, wenn niemand da ist; eigene Seite mit Live-Radar), Lichtsensor BH1750 (Helligkeit nach Umgebungslicht) und CO₂-Sensor SCD41 über einen kleinen Agenten auf dem Pi
- 🎬 **Szenen** – mehrere Datenpunkte mit einem Tipp (auch Hue-Szenen)
- 🧭 **Automatische Erkennung** – schlägt Geräte, Räume und das Energiesystem aus deinem ioBroker vor
- 🗂️ **Anpassbare Seiten** – Gruppierung und Reihenfolge der Seiten Licht und Klima frei festlegen
- 📱 **Responsive** – Handy (untere Navigation), Tablet (Icon-Leiste), Desktop/Wandtablet (Seitenleiste), große Displays skalieren mit
- 📲 **Als App installierbar** – auf Android im eigenen Fenster ohne Browserleisten
- 🖥️ **Kioskmodus für Wandtablets** – Übersicht ohne Scrollen auf 1280 × 800 quer oder 800 × 1280 hochkant (größere Displays wie 1920 × 1200 bzw. 1200 × 1920 werden passend vergrößert), im Hochformat Menüleiste unten in Daumenhöhe und Seitenübersicht mit großen Kacheln, Menü ausblendbar (auch automatisch) und trotzdem immer erreichbar, Rückkehr zur Übersicht, Nachtabdunkelung, automatische Updates
- 🌗 Dunkles und helles Design, Animationen (Detailstufe je Gerät: Hoch, Mittel oder Niedrig für schwache Tablets), selbsterklärende Icons, Versionshinweis mit „Was ist neu?“

Ohne Konfiguration startet die App im **Demo-Modus** mit einer simulierten Installation – ideal zum Ausprobieren.

---

## Inhalt

1. [Plattformunabhängiger Schnellstart](#plattformunabhängiger-schnellstart) · [Synology](#schnellstart-auf-der-synology)
2. [Verbindung zu ioBroker](#verbindung-zu-iobroker)
3. [Verbindung zur Surveillance Station](#verbindung-zur-surveillance-station)
4. [Geräte einrichten](#geräte-einrichten)
5. [Wetter](#wetter)
6. [3D-Drucker (OctoPrint / Bambu Lab)](#3d-drucker-octoprint--bambu-lab)
7. [Spotify](#spotify)
8. [Mähroboter (Navimow)](#mähroboter-navimow)
9. [Benachrichtigungen](#benachrichtigungen) · [Pushover (Handy)](#pushover-push-nachrichten-aufs-handy)
10. [Müllabfuhr](#müllabfuhr)
11. [Lüftungsempfehlung](#lüftungsempfehlung)
12. [Kiosk-Sensoren am Raspberry Pi](#kiosk-sensoren-am-raspberry-pi)
13. [Als App auf Android installieren](#als-app-auf-android-installieren)
14. [Menü, Design und Kioskmodus (Wandtablet)](#menü-design-und-kioskmodus-wandtablet)
15. [Konfiguration über Umgebungsvariablen](#konfiguration-über-umgebungsvariablen)
16. [HTTPS](#https)
17. [Sicherheit](#sicherheit)
18. [Entwicklung](#entwicklung)
19. [Aufbau des Projekts](#aufbau-des-projekts)
20. [Konfigurationsformat](#konfigurationsformat-configjson)
21. [API](#api)
22. [Fehlersuche](#fehlersuche)
23. [Herkunft und Entwicklung](#herkunft-und-entwicklung)

---

## Plattformunabhängiger Schnellstart

Voraussetzungen: Git, Docker und Docker Compose. Das Docker-Image wird aus dem Quellcode gebaut;
Node.js und npm müssen nicht auf dem Host installiert sein. Docker muss Linux-Container ausführen
können; unter Windows und macOS ist dafür üblicherweise Docker Desktop erforderlich.

```bash
git clone https://github.com/sebheider/homeapp-generic.git
cd homeapp-generic
docker compose -f docker-compose.generic.yml up -d --build
```

Anschließend `https://localhost:8095` bzw. `https://<Host-Adresse>:8095` öffnen und die Warnung
für das selbstsignierte Zertifikat beachten. Die App startet ohne weitere Einrichtung im Demo-Modus.
Der Ordner `data` enthält Konfiguration, gespeicherte Zugangsdaten und weitere persistente Daten:
Zugriff darauf beschränken und ihn regelmäßig sichern.

Optional `.env.example` nach `.env` kopieren. Für diesen Startweg ändern `HOMEAPP_PORT` und `TZ`
den Host-Port (Standard 8095) und die Zeitzone (Standard `Europe/Berlin`). `APP_USER` und
`APP_PASSWORD` gemeinsam setzen, um den Zugriff per HTTP Basic Auth zu schützen; sind beide
Werte nicht gesetzt, ist die App nicht geschützt. Für externen Zugriff zusätzlich ein vertrauenswürdiges
TLS-Zertifikat und geeigneten Netzwerkschutz einrichten; siehe [Sicherheit](#sicherheit) und
[HTTPS](#https). Einstellungen in der App haben bei Integrationen Vorrang vor Umgebungsvariablen.
Änderungen an `.env` erfordern ein erneutes `docker compose -f docker-compose.generic.yml up -d`.

Aktualisieren: Änderungen aus dem Repository beziehen und denselben `up -d --build`-Befehl erneut
ausführen. Das Datenverzeichnis bleibt erhalten. Anhalten mit
`docker compose -f docker-compose.generic.yml down`. Der generische Startweg verwendet das
automatisch verwaltete Compose-Netz ohne feste Container-IP; für Webhooks eine vom sendenden
Gerät erreichbare Host-Adresse verwenden. Bestehende Synology-Projekte und ihre feste IP bleiben
unverändert, solange sie ihre bisherige Compose-Datei verwenden. Die GHCR-Compose-Datei dieses
Repositories verweist auf das neue Image `ghcr.io/sebheider/homeapp-generic:latest`; sie aktualisiert
damit nicht mehr das ursprüngliche Image. Vor einer Migration `data` sichern und ein vorhandenes
Container-Projekt nicht parallel mit demselben Datenverzeichnis starten.

Ein Betrieb ohne Docker ist ebenfalls möglich: Node.js 20.19+ (20.x) oder 22.12+ installieren, im Verzeichnis
`server` `npm ci` und im Verzeichnis `client` `npm ci` sowie `npm run build` ausführen.
Danach `npm start` in `server` starten. OpenSSL wird benötigt, wenn das HTTPS-Zertifikat automatisch
erzeugt werden soll; ffmpeg nur für bestimmte Bambu-Lab-Kameras. `DATA_DIR` ist ohne Vorgabe relativ
zum Startverzeichnis (`./data`). Für lokale Entwicklung siehe [Entwicklung](#entwicklung).

---

## Schnellstart auf der Synology

Dieser Abschnitt beschreibt die weiterhin unterstützte, Synology-spezifische Alternative. Für neue
Installationen auf beliebigen Hosts einschließlich Synology ist der
[plattformunabhängige Schnellstart](#plattformunabhängiger-schnellstart) der Standard.
Die folgenden Legacy-Compose-Dateien verwenden weiterhin ein festes Netz. Voraussetzung:
**Container Manager** (DSM 7.2+) bzw. Docker-Paket.

### Variante A – Projekt im Container Manager (Dateien selbst kopieren)

> **Aus GitHub geklont?** Im Repository fehlen bewusst `server/node_modules/` und `client/dist/` (gebaute bzw. installierte Dateien gehören nicht in Git). Das Standard-`Dockerfile` braucht sie, also einmal auf dem PC erzeugen (Node.js 20.19+ auf 20.x oder 22.12+):
>
> ```bash
> git clone <URL-deines-Repositories> HomeApp && cd HomeApp
> cd server && npm ci --omit=dev && cd ..
> cd client && npm ci && npm run build && cd ..
> ```
>
> Danach den Ordner wie unten beschrieben auf die Synology kopieren. Alternativ baut `Dockerfile.full` alles im Container (siehe Hinweis am Ende dieses Abschnitts).

1. Den Ordner `HomeApp` auf die Synology kopieren, und zwar nach `/volume1/docker/HomeApp` (Groß-/Kleinschreibung beachten). Kopiert werden müssen:
   - `server/` **inklusive `server/node_modules/`** (reines JavaScript, ca. 5 MB, plattformunabhängig),
   - `client/dist/` (das fertig gebaute Frontend),
   - `Dockerfile`, `docker-compose.yml`, `.dockerignore` und optional `.env`.

   **Nicht** nötig sind `client/src/`, `client/node_modules/` und `data/` (entsteht beim ersten Start). Am einfachsten über die *File Station* (Ordner `docker` → neuer Ordner `HomeApp` → Dateien hochladen) oder per SMB-Freigabe.
   Der Container-Build braucht dadurch **kein npm**; Internetzugriff wird nur für das Basis-Image `node:22-alpine` und die Installation von OpenSSL benötigt.
2. Optional: `.env.example` nach `.env` kopieren und Werte eintragen (siehe unten).
3. **Container Manager → Projekt → Erstellen**
   - Pfad: `/volume1/docker/HomeApp`
   - die vorhandene `docker-compose.yml` wird erkannt → *Weiter* → *Fertig*
4. App öffnen: `https://<IP-der-Synology>:8095` (Browserwarnung beim selbstsignierten Zertifikat einmalig bestätigen; der Host-Port steht in der `docker-compose.yml` unter `ports`; auf der Synology ist 8080 häufig belegt – bei Bedarf links einfach eine andere Zahl eintragen)

### Variante B – per SSH

```bash
cd /volume1/docker/HomeApp
sudo docker compose up -d --build
```

Konfiguration und Verlaufsdaten liegen in `./data` (Volume `/data` im Container) und bleiben bei Updates erhalten.

**Update:** Nach Code-Änderungen auf dem PC `npm run build` (in `client/`) und bei geänderten Abhängigkeiten `npm install` (in `server/`) ausführen, die Dateien kopieren, dann `docker compose up -d --build` (bzw. im Container Manager das Projekt neu erstellen).

> **Alternative ohne vorgebaute Dateien:** `Dockerfile.full` baut alles im Container (`docker build -f Dockerfile.full -t homeapp:latest .`). Das setzt voraus, dass `npm` im Docker der Synology zuverlässig läuft – auf älteren Docker-Versionen bricht `npm ci` teils mit „Exit handler never called!“ ab. Dafür ist das Standard-`Dockerfile` gedacht.

### Variante C – Automatische Updates aus GitHub (Synology)

Der Container Manager kann ein Git-Repository nicht selbst überwachen. Stattdessen übernimmt GitHub das Bauen und die Synology holt das fertige Image regelmäßig ab. Ein `git push` auf `main` reicht dann, kurz danach läuft die neue Version, **ohne Kopieren, ohne npm und ohne Build auf der Synology**.

```
git push → GitHub Actions baut das Image (amd64 + arm64) → ghcr.io/sebheider/homeapp-generic:latest
         → Aufgabenplaner der Synology prüft alle 5 Minuten → neues Image → Container wird ersetzt
```

Der Workflow `.github/workflows/docker.yml` startet bei Pushes auf `main` und veröffentlicht das
Image erst nach bestandenen Tests. Der Stand eines Builds steht im GitHub-Reiter *Actions*. Jedes
Image bekommt zusätzlich einen Tag `sha-<Commit>`, damit du bei Problemen zu einer älteren Version
zurückkehren kannst. Das Image muss zunächst erfolgreich im neuen Repository gebaut und veröffentlicht
werden; bis dahin den [Build aus Quellcode](#plattformunabhängiger-schnellstart) verwenden.

**Einmalige Einrichtung**

1. **Erstes Image bauen:** Nach dem Push läuft der Workflow (ca. 5–10 Minuten). Erst danach existiert das Image unter *GitHub → dein Profil → Packages*.
2. **Zugriff auf ein privates Image – lokal im Projektordner, ohne SSH:** Falls das Package privat ist, braucht die Synology ein Zugriffstoken:
   - *GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token*, nur Berechtigung **`read:packages`**, möglichst mit Ablaufdatum.
   - In `/volume1/docker/HomeApp/.env` (Vorlage: `.env.example`) eintragen:
     ```
     GHCR_USER=sebheider
     GHCR_TOKEN=ghp_…dein Token…
     ```

   Das Token steht **nur in dieser Datei**. Das Update-Skript meldet sich bei jedem Lauf in einem temporären Ordner an und löscht ihn danach wieder. Auf der Synology entsteht dadurch **kein `docker login`** (nichts in `/root/.docker`, kein `sudo`, kein SSH). Die `.env` wird nicht in den Container übernommen und nicht in Git eingecheckt (`.gitignore`).
   - *Alternativ ohne Token:* das Package auf GitHub unter *Package settings → Change visibility* auf „Public“ stellen und `GHCR_TOKEN` weglassen. Das Image enthält keine Zugangsdaten (die liegen nur in deinem `data`-Ordner), aber den gebauten Code der App.
3. **Compose-Datei ersetzen:** In `/volume1/docker/HomeApp` den Inhalt von `docker-compose.yml` durch den Inhalt von `docker-compose.ghcr.yml` aus dem Repository ersetzen (der Container Manager erwartet den Namen `docker-compose.yml`). Mehr als diese Datei, eine optionale `.env` und der Ordner `data` brauchst du dort nicht. `client/` und `server/` können weg. Bei einem anderen GitHub-Konto in der `.env` `HOMEAPP_IMAGE=ghcr.io/<konto>/<repository>:latest` setzen.
4. **Update-Aufgabe einrichten und einmal ausführen:** *DSM → Systemsteuerung → Aufgabenplaner → Erstellen → Geplante Aufgabe → Benutzerdefiniertes Skript*
   - *Allgemein:* Name `HomeApp Update`, Benutzer **root** (nur root darf Docker bedienen)
   - *Zeitplan:* täglich, *Zeit wiederholen:* **alle 5 Minuten**, Letzte Ausführungszeit: 23:55
   - *Aufgabeneinstellungen → Benutzerdefiniertes Skript:*

   ```sh
   cd /volume1/docker/HomeApp || exit 1
   envv() { grep -E "^$1=" .env 2>/dev/null | head -n 1 | cut -d= -f2- | tr -d '\r'; }
   note() { [ "$(tail -n 1 update.log 2>/dev/null | cut -d' ' -f3-)" = "$1" ] || echo "$(date '+%F %T') $1" >> update.log; }
   IMAGE=$(envv HOMEAPP_IMAGE); IMAGE=${IMAGE:-ghcr.io/sebheider/homeapp-generic:latest}
   GHCR_USER=$(envv GHCR_USER); GHCR_TOKEN=$(envv GHCR_TOKEN)
   if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

   OLD=$(docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null)

   # Anmeldung nur für diesen Lauf in einem temporären Ordner (nichts Globales, nichts bleibt liegen)
   CFG=$(mktemp -d)
   if [ -n "$GHCR_TOKEN" ]; then
     echo "$GHCR_TOKEN" | DOCKER_CONFIG="$CFG" docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null 2>&1 || note "Anmeldung bei ghcr.io fehlgeschlagen (Token prüfen)"
   fi
   DOCKER_CONFIG="$CFG" docker pull -q "$IMAGE" >/dev/null 2>&1 || note "Image konnte nicht geladen werden"
   rm -rf "$CFG"

   NEW=$(docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null)
   if [ -n "$NEW" ] && [ "$OLD" != "$NEW" ]; then
     if docker container inspect homeapp >/dev/null 2>&1; then
       $DC -p homeapp up -d >/dev/null 2>&1 && note "HomeApp aktualisiert ($(echo "$NEW" | cut -c8-19))" || note "Neustart fehlgeschlagen"
       [ -n "$OLD" ] && docker rmi "$OLD" >/dev/null 2>&1
     else
       note "Image geladen – jetzt das Projekt im Container Manager erstellen"
     fi
   fi
   ```

   Dann die Aufgabe in der Liste markieren und **Ausführen** wählen. Sie lädt das Image und schreibt „Image geladen …“ in `/volume1/docker/HomeApp/update.log`.
5. **Projekt erstellen:** *Container Manager → Projekt → Erstellen*, Projektname **`homeapp`**, Pfad `/volume1/docker/HomeApp`, vorhandene `docker-compose.yml` verwenden. Das Image ist schon da, es wird nichts mehr geladen. Ein altes Projekt aus Variante A vorher löschen (*Aktion → Löschen*, der Ordner `data` bleibt erhalten).

**Was das Skript tut:** Es lädt das Image und ersetzt den Container nur dann, wenn das Image wirklich neu ist **und** der Container schon existiert (Schritt 5). Danach entfernt es nur das alte HomeApp-Image, nichts anderes auf der Synology. Seine Meldungen stehen in `update.log`; dieselbe Fehlermeldung erscheint dort nicht ständig neu. Mit *Aktion → Ausgabeergebnisse anzeigen* in der Aufgabenliste siehst du die Ausgabe des letzten Laufs. Dein `data`-Ordner und damit alle Einstellungen bleiben bei jedem Update erhalten.

**Was lokal bleibt:** Alles liegt im Projektordner (`docker-compose.yml`, `.env` mit dem Token, `data/`, `update.log`). Außerhalb davon existiert nur die Aufgabe im Aufgabenplaner selbst, sie ist der Zeitgeber. Löschst du sie, stoppen die automatischen Updates, sonst ändert sich nichts.

**Ablauf danach:** Änderungen committen und `git push` – der Rest passiert von allein. Sofort aktualisieren: Aufgabe im Aufgabenplaner mit *Ausführen* starten.

> **Hinweis:** Der Container startet beim Update kurz neu (wenige Sekunden). Läuft gerade ein Build auf GitHub, bleibt die alte Version aktiv, bis das neue Image fertig ist. Schlägt der Build fehl, ändert sich auf der Synology nichts.

### Feste IP-Adresse des Containers (nur Synology-Legacy-Compose)

Die `docker-compose.yml` legt ein eigenes Netzwerk `homeapp_net` (`172.40.0.0/24`, Gateway `172.40.0.1`) an und gibt dem Container die feste Adresse **`172.40.0.10`**.

- Erreichbar ist diese Adresse **von der Synology selbst und von anderen Containern im selben Netzwerk**, z. B. `https://172.40.0.10:8080` (Container-Port, nicht 8095).
- Aus dem restlichen LAN bleibt die App wie gewohnt unter `https://<IP-der-Synology>:8095` erreichbar. `172.40.0.0/24` ist ein internes Docker-Netz und wird nicht ins LAN geroutet. Soll der Container eine **eigene LAN-Adresse** bekommen, braucht es stattdessen ein `macvlan`-Netzwerk mit einer freien IP deines LAN-Subnetzes.
- Die Webhook-URL für die Surveillance Station kann `https://172.40.0.10:8080/api/webhook/…` oder `https://<IP-der-Synology>:8095/api/webhook/…` lauten.
- Existiert das Netzwerk `172.40.0.0/24` schon (z. B. von einem anderen Projekt), gib in der Compose-Datei stattdessen `external: true` mit dem Namen des vorhandenen Netzwerks an (Beispiel steht als Kommentar in der Datei). Beim Start meldet Docker sonst „Pool overlaps with other one on this address space“.
- Ist die **DSM-Firewall** aktiv, muss Verkehr aus `172.40.0.0/24` zur Synology erlaubt sein (Systemsteuerung → Sicherheit → Firewall), damit die App ioBroker und die Surveillance Station auf der Synology erreicht.

> Tipp: Wenn die App von außen erreichbar sein soll, nutze den Reverse Proxy der Synology (*Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy*) mit HTTPS und setze zusätzlich `APP_USER` / `APP_PASSWORD`. WebSocket-Header (`Upgrade`, `Connection`) müssen im Reverse Proxy durchgereicht werden (*Benutzerdefinierter Header → WebSocket*).

---

## Verbindung zu ioBroker

*Einstellungen → System → Verbindungen & Zugriff → ioBroker*

| Feld | Bedeutung |
|------|-----------|
| Betriebsart | **Demo** (Beispieldaten) oder **Live** |
| Protokoll | **ws** = reines WebSocket (Admin ab v6, `ws`-Adapter) · **socket.io** = klassischer `web`/`socketio`-Adapter |
| Host / Port | Standard: Admin `8081`, web `8082`, socketio `8084` |
| Benutzer / Passwort | leer lassen, wenn der Adapter ohne Anmeldung läuft |
| HTTPS / Zertifikat prüfen | bei selbstsigniertem Zertifikat „Zertifikat prüfen“ **aus** lassen |

**Wichtig – Berechtigungen:** Der ioBroker-Benutzer muss in einer **Gruppe mit Lese- und Schreibrechten** sein
(ioBroker Admin → *Benutzer und Gruppen* → Benutzer einer Gruppe wie `user` oder `administrator` zuordnen).
Ohne Gruppe antwortet ioBroker auf jede Anfrage mit `permissionError`; die App zeigt dann einen entsprechenden Hinweis.

#### „Keine Schreibberechtigung für diesen Datenpunkt“ trotz passender Gruppenrechte

ioBroker prüft **zusätzlich zu den Gruppenrechten die Rechte jedes einzelnen Objekts** (ACL). Datenpunkte, die der Administrator angelegt hat (also praktisch alle Adapter-Datenpunkte), gehören `system.user.admin` und der Gruppe `administrator` und haben das Recht `664`: Besitzer und Gruppe dürfen schreiben, „Andere“ nur lesen. Ein Benutzer in der Gruppe `user` zählt als „Anderer“ – lesen geht, schreiben nicht, auch wenn die Gruppe „State permissions → write“ hat.

Die App erkennt das für dich: *Einstellungen → Verbindungen & Zugriff → ioBroker → **Schreibrechte prüfen** → Jetzt prüfen* listet die betroffenen Datenpunkte und erzeugt ein fertiges Skript. Zwei Lösungen:

| | Vorgehen | Vor- / Nachteil |
|---|----------|-----------------|
| **A (empfohlen)** | Das angezeigte Skript im ioBroker-Adapter **javascript** als neues Skript anlegen und einmal starten. Es setzt bei genau diesen Datenpunkten das Recht „Andere dürfen schreiben“ (`0x664` → `0x666`). | Nur die von der App gesteuerten Datenpunkte werden freigegeben, der Benutzer behält minimale Rechte. Nach neu hinzugefügten Geräten erneut prüfen und das Skript noch einmal ausführen. |
| **B** | Den Benutzer zusätzlich der Gruppe `administrator` zuordnen. | Einfach, aber der Benutzer darf dann alles (auch löschen und anlegen). |

Das Skript ändert weder Besitzer noch Gruppe, löscht nichts und überspringt Datenpunkte, die schon beschreibbar sind. Weil die App nur lesenden Zugriff auf die Objektrechte hat, kann sie diese nicht selbst ändern – das muss ein Administrator tun.

Die Anmeldung erfolgt per OAuth2 (`POST /oauth/token`); das Token wird automatisch alle 50 Minuten erneuert.

---

## Verbindung zur Surveillance Station

*Einstellungen → System → Verbindungen & Zugriff → Synology Surveillance Station*

1. In DSM ein **eigenes Benutzerkonto** anlegen mit Berechtigung für die Surveillance Station (Live-Ansicht). Ein Konto **mit** 2-Faktor-Anmeldung ist möglich (siehe unten).
2. In der App Host (IP der Synology), Port (`5000` HTTP / `5001` HTTPS bzw. dein eigener DSM-Port), Konto und Passwort eintragen und Schalter *Surveillance Station* aktivieren.
3. Die Kameras erscheinen automatisch unter **Kameras**. Namen, Sichtbarkeit und die Bewegungs-Einblendung lassen sich unter *Einstellungen → Kameras & Einblendungen* anpassen.

> Läuft die App im Container auf derselben Synology, trage die **LAN-IP der Synology** ein (nicht `localhost`).

### Konto mit 2-Faktor-Anmeldung (2FA)

Die App unterstützt 2FA über das **Geräte-Token** von DSM – der Code wird nur **einmal** gebraucht:

1. In DSM für das Konto die 2-Faktor-Authentifizierung einrichten (*Persönlich → Konto → 2-Faktor-Authentifizierung*, Authenticator-App).
2. In der App unter *Einstellungen → Verbindungen & Zugriff → Surveillance Station* Zugangsdaten eintragen **und** im Feld *2-Faktor-Code* den aktuellen 6-stelligen Code eintragen, dann **Speichern** (der Code gilt nur ca. 30 Sekunden).
3. DSM stellt der App ein Geräte-Token aus („HomeApp“ erscheint in DSM unter den vertrauenswürdigen Geräten). Es wird in `config.json` gespeichert, der Code selbst nie. Ab jetzt meldet sich die App ohne Code an, auch nach Neustarts.
4. Mit *Registrierung zurücksetzen* (oder einem Kontowechsel) wird das Token verworfen und ein neuer Code verlangt. Entfernst du das Gerät in DSM, brauchst du ebenfalls einen neuen Code.

Alternativ kannst du die 2-Faktor-Pflicht für das Konto in DSM aufheben (*Systemsteuerung → Sicherheit → Konto*).

### Bewegungserkennung & automatische Einblendung

Die App unterscheidet **zwei Arten** der Erkennung, jeweils mit eigener Farbe, Titel, Anzeigedauer und Sperrzeit:

| Art | Anzeige | Standard-Anzeigedauer |
|-----|---------|-----------------------|
| **Bewegung** (normale Bewegungserkennung) | blau, „Bewegung: Kamera“ | 30 s |
| **Person erkannt** (erweiterte Bewegungserkennung) | rot, „Person erkannt: Kamera“ | 60 s |

Eine Personen-Einblendung ersetzt eine laufende Bewegungs-Einblendung, aber nicht umgekehrt. Beide Arten lassen sich unter *Einstellungen → Kameras & Einblendungen* global und pro Kamera getrennt ein- und ausschalten.

**Vorübergehend Ruhe (ab Version 1.12.0):** Direkt im Popup öffnet **„Kamera Popups unterdrücken“** eine Zeitauswahl (15 oder 30 Minuten, 1, 2, 4 oder 8 Stunden). Die Pause gilt für alle Kamera-Popups **in diesem Browser**, bleibt beim Neuladen erhalten und wird zwischen geöffneten Tabs synchronisiert. Andere Browser und Geräte bleiben unabhängig. Währenddessen zeigt eine dauerhafte Meldung über jeder Seite die Endzeit und Restdauer; mit **„Unterdrückung beenden“** lassen sich Popups vorzeitig wieder aktivieren. Nach Ablauf erscheinen neue Meldungen automatisch wieder gemäß den bestehenden Einstellungen und Zeitregeln. Unterdrückte Ereignisse werden nicht nachträglich eingeblendet; Bewegungshistorie, Kamerabilder und andere Benachrichtigungen bleiben unverändert.

**Bildwiederholung:** Unter *Einstellungen → Kameras & Einblendungen* lässt sich getrennt einstellen, wie oft die Kamerabilder neu geladen werden – in der App (Übersicht, Seite *Kameras*; Standard alle 3 s) und in der Einblendung bei Erkennung (Standard jede Sekunde). Erlaubt sind 0,5 bis 300 Sekunden.

#### Zeitpläne für die Einblendung

Unter *Einstellungen → Kameras & Einblendungen → Zeitpläne für die Einblendung* legst du fest, **wann** welche Art einblendet. Jede Regel hat:

| Feld | Bedeutung |
|------|-----------|
| Art der Erkennung | Bewegung und/oder Person (erweitert) |
| Wochentage | Mo–So |
| Uhrzeit von – bis | auch über Mitternacht möglich (z. B. 22:00–06:00); der Zeitraum nach 0 Uhr gehört zum Wochentag, an dem er begann; „von = bis“ bedeutet ganztägig |
| Kameras | keine Auswahl = alle Kameras |

**Logik:** Gibt es mindestens eine aktive Regel, blendet die App nur ein, wenn **eine** Regel passt (Art, Tag, Uhrzeit, Kamera). Ohne aktive Regel gelten nur die Schalter. Die globalen Schalter und die Kamera-Schalter müssen zusätzlich auf „an“ stehen. Die Uhrzeit ist die **Serverzeit** (Zeitzone des Containers, in der `docker-compose.yml` per `TZ` gesetzt). Neben den Regeln zeigt die App, was nach dem gespeicherten Stand gerade einblendet.

**Beispiel „tagsüber nur Person, nachts alles“** (der Button *Beispiel* legt es an):

| Name | Art | Zeit |
|------|-----|------|
| Tagsüber nur Person | Person | 06:00 – 22:00 |
| Nachts alles | Bewegung + Person | 22:00 – 06:00 |

Weitere Ideen: *Wochenende ab 08:00 beides*, *Eingang immer beides* (Regel nur für die Kamera Eingang, ganztägig), *Garten nur nachts*.

Drei Quellen melden Erkennungen:

| Quelle | Funktionsweise |
|--------|----------------|
| **Webhook (empfohlen, Echtzeit)** | In der Surveillance Station **pro Kamera und Art** eine *Aktionsregel* anlegen (Auslöser „Bewegung erkannt“ bzw. „Erweiterte Bewegungserkennung“ → Aktion „Webhook“ / HTTP-Anfrage). Fertige URLs mit Token stehen je Kamera unter *Einstellungen → Kameras & Einblendungen*. |
| **ioBroker-Datenpunkt** | Pro Kamera können je ein Datenpunkt für Bewegung und für Person zugeordnet werden (z. B. von einem Bewegungsmelder). |
| **Ereignisliste der Station (Polling)** | Neue Ereignisse werden nach ihrem `reason`-Code eingeordnet (Standard: `2,3,9` = Bewegung, `7` = Person). Die zuletzt gesehenen Codes zeigt die App unter *Einstellungen → Verbindungen & Zugriff* an. |

**Webhook-URLs**

```
https://<HomeApp-Host>:8095/api/webhook/motion/<Kamera>?token=<Token>   normale Bewegung
https://<HomeApp-Host>:8095/api/webhook/people/<Kamera>?token=<Token>   Person (erweiterte Erkennung)
```

`<Kamera>` ist die Kamera-ID (z. B. `21`) oder ihr Name (z. B. `Terrasse`). Alternativ gibt es `…/motion/<Kamera>?token=…&type=people`.

> **Wichtig bei Dauer-Aufzeichnung:** Zeichnen die Kameras durchgehend auf (z. B. in 30-Minuten-Blöcken, `reason` 0), liefert die Ereignisliste keine Bewegungen. Die App ignoriert diese Blöcke bewusst (sie würden sonst alle 30 Minuten einen Fehlalarm auslösen). Nutze dann die **Webhooks**.

Pro Kamera **und Art** gilt eine **Sperrzeit** (Standard 60 s), damit nicht ständig neu eingeblendet wird; eine Bewegungsmeldung unterdrückt also nie eine Personenmeldung.

**Aussehen der Einblendung** (*Einstellungen → Kameras & Einblendungen*): Position **Mittig** (Standard, großes Fenster über der App, ein Tipp daneben oder `Esc` schließt) oder **klein in der Ecke**, Größe **Mittel**, **Groß** (Standard) oder **Fast Vollbild**. „Vorschau anzeigen“ zeigt die Einstellung sofort, ohne zu speichern.

Live-Bild: Vollbildansicht und Einblendung zeigen flüssiges Live-Video (MJPEG-Stream der Surveillance Station); ist der Stream nicht verfügbar, wechselt die App automatisch auf Snapshots (Einblendung: im eingestellten Takt) und versucht es alle 30 s erneut. Für die Einblendung lässt sich das Live-Video unter *Kameras & Einblendungen* abschalten. Die Kacheln der Übersicht bleiben bewusst bei Snapshots: Browser öffnen nur etwa sechs gleichzeitige Verbindungen zu einem Server, viele Live-Kacheln würden die App blockieren.

Der Server öffnet jeden Stream nur **einmal**, egal wie viele Geräte zuschauen, und verteilt die Bilder weiter. Ein Gerät mit langsamer Verbindung überspringt Bilder, statt immer weiter hinterherzuhinken; bricht die Verbindung zur Kamera ab, baut der Server sie im Hintergrund neu auf, ohne dass die Anzeige neu laden muss. Hinter einem Reverse Proxy (nginx) wird das Puffern per `X-Accel-Buffering: no` abgeschaltet.

---

## Geräte einrichten

### Automatische Erkennung

*Einstellungen → Geräte → Automatisch erkennen* (benötigt eine Live-Verbindung). Erkannt werden derzeit:

| Adapter | Erkannte Geräte |
|---------|-----------------|
| `hue` | Lampen (Dimmer), Steckdosen, Szenen der Räume Wohnzimmer/Esszimmer |
| `hm-rpc` (Homematic / IP) | Heizkörper-Thermostate (+ Luftfeuchte), Rollladenaktoren, Schaltaktoren, Dimmer, Helligkeits- und Temperatursensoren |
| `e3dc-rscp` | PV, Hausverbrauch, Netz, Batterie, Ladestand, Wallbox, Autarkie, Eigenverbrauch |
| `daikin-cloud` | Klimaanlagen (je Betriebsart ein Sollwert), Altherma-Wärmepumpe mit Warmwasser |
| `mqtt` (WeatherMan) | Wetterstation |
| `navimow` | Navimow-Mähroboter (Zustand, Akku, Fortschritt, Position, Karte, Knöpfe), siehe [Mähroboter](#mähroboter-navimow) |

Die Erkennung ist ein **Vorschlag**: Du entscheidest, ob bestehende Einträge ersetzt oder ergänzt werden, und speicherst danach. Räume aus Namen wie `EG - Küche - Rollade` werden automatisch gebildet.

### Manuell

*Einstellungen → Geräte → + Gerät*: Typ, Name, Raum und Datenpunkte wählen. Die Datenpunkt-Felder haben eine **Live-Suche** über alle Objekte deines ioBrokers (nach ID oder Name).

Unterstützte Gerätetypen:

| Typ | Datenpunkte (Schlüssel) | Optionen |
|-----|-------------------------|----------|
| `light` | `power`, `brightness`, `color` | `brightnessMax` (z. B. 100 / 254 / 1) |
| `switch` | `power`, `consumption` | – |
| `thermostat` | `target`, `current`, `valve` | `min`, `max`, `step` |
| `blind` | `position` (100 % = offen) | `invert` |
| `sensor` | `value` | `kind` (Temperatur, Feuchte, CO₂, Bewegung, Tür, Fenster, …), `unit` |
| `climate` | `power`, `mode`, `target` / `targetHeat` / `targetCool` / `targetAuto`, `current`, `fan` | `min`, `max`, `step`, `modes`, `fanModes` |
| `heatpump` | `power`, `mode`, `flowTemp`, `returnTemp`, `outsideTemp`, `dhwTemp`, `dhwTarget`, `electricPower`, `heatPower`, `cop`, `compressor` | `dhwMin`, `dhwMax`, `modes` |
| `mower` | `state`, `battery`, `progress`, `area`, `weekArea`, `x`, `y`, `heading`, `positionTime`, `track`, `frame`, `station`, `updated`, `online`, `model`, `firmware`, Knöpfe `start`, `pause`, `resume`, `home`, `refresh`, `resetMap` | `cutWidth` (cm), `rotate` (0 / 90 / 180 / 270) |

Reine Dimmer ohne separaten Ein/Aus-Datenpunkt funktionieren ebenfalls: `power` leer lassen, „an“ bedeutet Helligkeit > 0.

### Energie

*Einstellungen → Energie*: Datenpunkte für Erzeugung, Verbrauch, Netz, Batterie usw. zuordnen.
Vorzeichen-Konvention der App: **Netz + = Bezug**, **Batterie + = Entladen**. Meldet deine Anlage andersherum (z. B. E3/DC: Batterie + = Laden), „Vorzeichen umkehren“ aktivieren.

### Seiten Licht und Klima anpassen

Die Einstellungen sind in **Im Alltag**, **Mein Zuhause**, **Funktionen** und **System** gegliedert. Häufige Anpassungen an Anzeige und Seiten stehen zuerst; Verbindungen und Zugriff findest du unter System. „Bereich finden“ durchsucht die Bereiche und ihre Beschreibungen. Änderungen für alle Geräte bleiben beim Bereichswechsel erhalten und werden gemeinsam mit **Speichern** übernommen; eine sichtbare Speicherleiste erinnert an offene Änderungen.

Die Reihenfolge der Räume legst du unter *Einstellungen → Räume* durch Ziehen am Griff fest. Unter *Einstellungen → Seiten & Reihenfolge* bestimmst du zusätzlich für die Seiten **Licht** und **Klima** getrennt:

- **Gruppierung:** *Standard* (Licht: nach Raum; Klima: Wärmepumpe & Klimaanlagen, Thermostate nach Raum, Messwerte), *nach Raum*, *nach Gerätetyp* oder *keine Gruppen*.
- **Reihenfolge** der Gruppen und der Geräte innerhalb einer Gruppe per **Drag-and-drop**, auch auf Touchscreens. Nur der Griff verschiebt einen Eintrag, Eingabefelder bleiben normal bedienbar. Alternativ den Griff per Tab fokussieren und mit ↑ / ↓, Pos1 oder Ende sortieren.
- **Ausblenden** einzelner Geräte nur auf dieser Seite (unter *Räume* bleiben sie sichtbar).

„Zurücksetzen“ stellt den Standard der Seite wieder her.

---

## Wetter

Die Seite **Wetter** (eigener Menüpunkt neben der Übersicht) zeigt das Wetter ausführlich; die Übersicht zeigt oben nur kompakt die aktuellen Außenwerte – ein Tipp darauf führt zum Wetter. Schaltest du die Wetteranzeige aus, verschwindet der Menüpunkt. *Einstellungen → Wetter*:

1. **Standort:** Ortsname oder Postleitzahl suchen und den Treffer wählen (oder Breiten-/Längengrad eintragen). Ohne Standort erscheinen nur die Werte der lokalen Wetterstation.
2. **Lokale Wetterstation:** Datenpunkte für Temperatur, Luftfeuchte, Luftdruck, Wind, Regen und Helligkeit zuordnen. „Aus ioBroker erkennen“ findet z. B. die MQTT-Station *WeatherMan*. Wind in m/s? Dann die Einheit der Windsensoren umstellen.
3. **Regenradar** lässt sich abschalten.

Was angezeigt wird:

| Karte | Inhalt | Quelle |
|-------|--------|--------|
| Aktuell | Temperatur, Zustand mit animiertem Symbol, Luftfeuchte, Wind, Luftdruck, Regen, Helligkeit, Stundenverlauf (24 h), Temperaturkurve (gemessen + Prognose) | lokale Station, sonst Internet |
| Sonne | Aufgang, Untergang, Tageslänge, Sonnenstand | Internet |
| UV-Index | aktueller Wert, Maximum heute, Stundenprognose, Hinweis zum Sonnenschutz (nach Sonnenuntergang: Prognose für morgen) | **immer Internet-Prognose** für den Standort |
| Nächste 3 Tage | Zustand, Min/Max, Regenwahrscheinlichkeit, Wind, UV | Internet |
| Regen | Niederschlag der nächsten Stunden (15-min-Raster), animiertes Radar der letzten ~100 Minuten, Zoom | Internet |

Bei gemessenen Werten gilt: **die lokale Station hat Vorrang**, fehlende Werte kommen aus dem Internet. Ein Punkt neben jedem Wert zeigt die Herkunft (grün = Station, blau = Internet).

**Mond im Wettersymbol:** Nachts (klar, teils bewölkt, Schauer) erscheint ein echtes Mondbild mit der aktuellen Phase. Beleuchteter Teil, Schattenseite (schwach als Erdschein sichtbar, mit weichem Übergang) und Neigung werden im Browser aus Uhrzeit und Standort berechnet – so, wie der Mond dort gerade am Himmel steht, auf der Südhalbkugel also entsprechend „kopfüber“. Die Berechnung stimmt auf etwa 1° (Winkel) bzw. 0,5 Prozentpunkte (Beleuchtung) mit JPL Horizons überein und wird jede Minute aktualisiert; ohne Standort zeigt Himmelsnord nach oben. Die Libration (das leichte Taumeln der Mondoberfläche) wird nicht nachgebildet. Bildnachweis: [NASA's Scientific Visualization Studio, „Moon Phase and Libration, 2024“](https://svs.gsfc.nasa.gov/5187) (Ernie Wright, Noah Petro, David Ladd), gemeinfrei; für die App auf Mond-Nord ausgerichtet und verkleinert (`client/src/assets/moon-full.webp`).

**Datenquellen und Datenschutz:** Prognose, Sonne, UV und Ortssuche liefert [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel, für nichtkommerzielle Nutzung). Sie werden vom **Server** abgerufen und 10 Minuten zwischengespeichert; der Container braucht also Internetzugriff. Fällt das Internet aus, bleiben die letzten Daten sichtbar (mit Hinweis). Das Radar (RainViewer) und die Kartenkacheln (Esri) lädt der **Browser** direkt; dabei sehen diese Anbieter, welcher Kartenausschnitt angezeigt wird. RainViewer liefert Radarbilder nur bis Zoomstufe 7. Im Demo-Modus ohne Standort erscheinen simulierte Wetterdaten.

---

## 3D-Drucker (OctoPrint / Bambu Lab)

HomeApp zeigt den Zustand eines 3D-Druckers, der entweder über [OctoPrint](https://octoprint.org) (z. B. OctoPi auf einem Raspberry Pi) oder als **Bambu-Lab-Drucker direkt über dessen lokale Schnittstelle** (LAN- und Entwicklermodus, ohne Bambu-Cloud) angebunden ist. Unter *Einstellungen → 3D-Drucker → Druckertyp* wird gewählt, welcher Drucker angezeigt wird. Die Verbindung läuft – wie bei ioBroker und der Surveillance Station – ausschließlich über den HomeApp-Server; API-Key, Zugangscode und interne Webcam-Adressen erreichen den Browser nie.

### OctoPrint

**Einrichten** (*Einstellungen → 3D-Drucker*, Druckertyp „OctoPrint“):

1. In OctoPrint unter *Einstellungen → Application Keys* für einen Benutzer (z. B. `homeapp`) einen Schlüssel erzeugen. Der Benutzer braucht mindestens die Rechte **Status** und **Webcam**; mit **Einstellungen lesen** übernimmt HomeApp zusätzlich den Druckernamen und die Webcam-Adresse samt Spiegelung/Drehung aus OctoPrint.
2. In HomeApp **OctoPrint** einschalten, **Host / IP** (z. B. `192.168.178.15`) und **Port** eintragen (OctoPi: 80 bzw. 443 mit HTTPS; OctoPrint ohne Proxy: 5000) und den **API-Key** einfügen. Eine kopierte Adresse wie `http://octopi.local:5000` wird automatisch zerlegt. Bei HTTPS mit selbstsigniertem Zertifikat „Zertifikat prüfen“ ausgeschaltet lassen.
3. Speichern – die Karte zeigt danach „✓ Verbunden als homeapp · OctoPrint 1.8.7 · Prusa MK3s“ bzw. die Fehlermeldung.

**Webcam:** Die Adresse des Standbilds wird automatisch ermittelt. OctoPi meldet als Standbild `http://127.0.0.1:8080/?action=snapshot`, das nur auf dem Pi selbst funktioniert; HomeApp leitet daraus die von außen erreichbare Adresse ab (`/webcam/?action=snapshot`, abgeleitet vom Stream) und probiert Alternativen durch. Weicht deine Webcam ab, trage Standbild- und Stream-Adresse (MJPEG) von Hand ein; relative Adressen beziehen sich auf OctoPrint, der API-Key wird nur an OctoPrint selbst geschickt. Mit **„Webcam als Live-Video anzeigen“** (Standard) zeigen Übersicht, Druckerseite und Einblendung den flüssigen MJPEG-Stream statt Einzelbildern; das Aktualisierungsintervall gilt dann nur, solange der Stream nicht verfügbar ist.

Zustand, Fortschritt und Temperaturen werden alle 5 Sekunden abgefragt (einstellbar 2–60 s).

### Bambu Lab (lokal, Entwicklermodus)

Bambu-Lab-Drucker (A1, A1 mini, P1P, P1S, P2S, X1, X1C, X1E, X2D, H2D, H2S …) melden ihren Zustand im lokalen Netz per MQTT (TLS, Port 8883). HomeApp verbindet sich direkt mit dem Drucker – ohne Cloud-Konto, Bambu Studio oder Home Assistant.

**Einrichten:**

1. Am Drucker unter *Einstellungen → Netzwerk* den **LAN-Modus** und den **Entwicklermodus** einschalten. Dort stehen auch **IP-Adresse** und **Zugangscode** (8 Zeichen); der Code ändert sich, wenn der LAN-Modus neu eingeschaltet wird. Am besten im Router eine feste IP für den Drucker vergeben.
2. Die **Seriennummer** steht am Drucker unter *Einstellungen → Gerät* (oder in Bambu Studio / Bambu Handy unter den Geräteinformationen), z. B. `01P00A123456789`.
3. In HomeApp *Einstellungen → 3D-Drucker* den Druckertyp **„Bambu Lab“** wählen, einschalten, IP, Seriennummer und Zugangscode eintragen und speichern. Die Karte zeigt danach „✓ Verbunden · Firmware 01.08.00.00 · Bambu Lab P1S“ bzw. die Fehlermeldung. Ohne eigenen Anzeigenamen heißt der Drucker nach seinem Modell.

**Angezeigt wird zusätzlich** zu Fortschritt, Restzeit, Fertigstellungszeit und Temperaturen (Düse bzw. beide Düsen bei H2D/X2D, Bett, bei X1/X2/H2/P2S Kammer; der Verlauf der letzten 30 Minuten wird von HomeApp selbst aufgezeichnet): aktuelle **Schicht**, der **Druckschritt** (z. B. „Bett-Nivellierung“, „Düse aufheizen“), **Geschwindigkeitsstufe**, **Lüfter** (Bauteil, Hilfslüfter, Kammer; beim X2D wie am Display Hilfslüfter links/rechts und Abluftlüfter), **Kammerlicht**, das **AMS** mit Luftfeuchte, Temperatur und den Spulen (Farbe, Material, Restmenge, aktive Spule; bei zwei Düsen mit L/R, welche Düse die Spule versorgt) bzw. die externe(n) Spule(n), **HMS-Meldungen** des Druckers (mit Link ins Bambu-Wiki) sowie in den Details Modell, Firmware, Seriennummer, Düse(n) mit Durchmesser und Typ, WLAN-Signal, Speicherkarte und Zeitraffer.

**Steuerung:** Mit „Steuerung in der App erlauben“ (Standard) lassen sich auf der Druckerseite ein laufender Druck **pausieren, fortsetzen und abbrechen** (Abbrechen mit zweitem Tipp zur Bestätigung), die **Geschwindigkeit** (Leise, Standard, Sport, Ludicrous) wählen und das **Licht** schalten. Ist der Schalter aus, zeigt HomeApp nur an; die Schnittstelle `POST /api/printer/command` antwortet dann mit 403.

**Kamera** (*Einstellungen → 3D-Drucker → Webcam → Kamera des Druckers*):

| Einstellung | Drucker | Funktionsweise |
|-------------|---------|----------------|
| Automatisch (Standard) | alle | wählt nach Modell eine der beiden folgenden Arten |
| Einzelbilder | A1, A1 mini, P1P, P1S | JPEG-Bilder über Port 6000, etwa ein Bild pro Sekunde |
| RTSP-Video | X1, X1C, X1E, X2D, H2D, H2S, P2S | RTSPS-Stream über Port 322, auf dem Server von **ffmpeg** in MJPEG umgewandelt. Am Drucker **„LAN-Liveview“** einschalten. ffmpeg ist in den Docker-Images enthalten; ohne Docker muss es installiert sein. |
| Eigene MJPEG-Adresse | alle | liest einen vorhandenen Stream, z. B. von [go2rtc](https://github.com/AlexxIT/go2rtc), das die Druckerkamera bereits abgreift |
| Keine Kamera | alle | kein Webcam-Bild |

Die Kamera wird nur geöffnet, solange jemand das Bild ansieht (Seite, Übersicht, Einblendung), und 30 Sekunden später wieder geschlossen; der Drucker erlaubt nur wenige gleichzeitige Kameraverbindungen, HomeApp nutzt für alle Browser eine gemeinsame.

### Anzeige und Einblendungen

**Was angezeigt wird:**

| Ort | Inhalt |
|-----|--------|
| Seite **3D-Drucker** (Menüpunkt erscheint, sobald ein Drucker eingerichtet ist) | Webcam (Tipp oder „Live“ = MJPEG-Livestream), Fortschritt als Rundinstrument, Datei, Restzeit, Fertigstellungszeit, Druckzeit, Düsen-/Bett-Temperaturen mit Verlauf der letzten 30 Minuten (Ist und Soll) und Details (Größe, Speicherort, gestartet von, Filament, Quelle der Restzeit, OctoPrint-Version); bei Bambu Lab zusätzlich Druckerzustand mit Steuerung, AMS und HMS-Meldungen (siehe oben) |
| Übersicht **Standard** | solange gedruckt wird: Panel unter Uhr und Wetter mit Webcam, Fortschritt, Zeiten und Temperaturen sowie ein Statushinweis „3D-Druck 76 % · noch 1 h 20 min“; im **Kioskmodus** eine einzeilige Leiste |
| Übersicht **Nexus** | solange gedruckt wird: Panel „3D-Druck“ in der rechten Spalte (im Kiosk ohne Webcam) |
| **Eigene** Startseite | Widget „3D-Drucker“ (zeigt auch Ruhe- und Fehlerzustand; Webcam abschaltbar) |
| Seitenleiste / Kopfzeile | Verbindungspunkt „3D-Drucker“ |

„Auf der Übersicht anzeigen, solange gedruckt wird“ schaltet Panel, Leiste und Statushinweis ab; das Widget der eigenen Startseite bleibt.

**Webcam-Einblendung:** Solange gedruckt wird (auch pausiert), blendet HomeApp **alle *n* Minuten** (Standard 15, einstellbar 1–240) das aktuelle Webcam-Bild mit Fortschritt, Restzeit und Temperaturen ein – auf allen Geräten gleichzeitig, für die eingestellte **Anzeigedauer** (Standard 20 s), klein in der Ecke oder mittig in drei Größen. Das erste Bild erscheint *n* Minuten nach Druckbeginn. Endet der Druck, erscheint auf Wunsch eine abschließende Einblendung („fertig“, „abgebrochen“ oder „mit Fehler beendet“). Weitere Regeln:

- **„Bis Druckende ausblenden“** in der Einblendung stoppt die regelmäßigen Bilder nur in diesem Browser und nur für den laufenden Druck; die abschließende Meldung erscheint trotzdem.
- Kamera-Einblendungen bei Bewegung haben **Vorrang** und verdrängen das Druckerbild.
- Auf der Seite 3D-Drucker selbst erscheinen keine regelmäßigen Einblendungen (die Webcam ist dort ohnehin sichtbar).
- Der Bildschirmschoner wird für Druckerbilder nicht geweckt.
- Ist OctoPrint bzw. der Drucker zwischendurch nicht erreichbar, gilt der Druck nicht als beendet; nach der Rückkehr laufen die Einblendungen weiter.

Im **Demo-Modus** zeigt die App einen simulierten Drucker, solange keiner eingerichtet ist – je nach gewähltem Druckertyp einen OctoPrint-Drucker oder einen „Bambu Lab P1S (Demo)“ mit AMS, Lüftern, Licht und Geschwindigkeit; ein eingerichteter Drucker wird auch im Demo-Modus verwendet.

---

## Spotify

HomeApp steuert Spotify Connect über die offizielle Spotify Web API – z. B. die Musik auf deinem Verstärker. Wie bei den anderen Integrationen läuft alles über den HomeApp-Server: Er hält die Anmeldung (Refresh-Token) und fragt alle 3 Sekunden ab, was gerade läuft; der Browser sieht keine Zugangsdaten.

**Voraussetzungen:** ein Spotify-**Premium**-Konto (Spotify erlaubt die Steuerung nur mit Premium; seit Februar 2026 braucht auch der Besitzer einer Entwickler-App Premium) und HomeApp über **HTTPS** (Standard, siehe [HTTPS](#https)) – Spotify akzeptiert nur HTTPS-Rücksprungadressen (lokal ausnahmsweise `http://127.0.0.1`).

**Einrichten** (*Einstellungen → Spotify*):

1. Im [Spotify-Developer-Dashboard](https://developer.spotify.com/dashboard) eine App anlegen, als API **Web API** wählen und als **Redirect-URI** die Adresse eintragen, die HomeApp in den Einstellungen anzeigt – z. B. `https://192.168.178.5:8095/api/spotify/callback` (genau die Adresse, über die du HomeApp öffnest).
2. Spotify in HomeApp einschalten, die **Client-ID** der App eintragen und speichern. Ein Client-Secret ist nicht nötig (Anmeldung per PKCE).
3. **Mit Spotify verbinden** wählen und den Zugriff erlauben. Danach steht „✓ Verbunden als …“ in den Einstellungen. Gehört das Konto nicht dem Besitzer der Entwickler-App, muss es im Dashboard unter *User Management* eingetragen werden (höchstens 5 Konten).
4. Unter **Gerät** deinen Verstärker wählen (die Liste zeigt die Spotify-Connect-Geräte des Kontos, die gerade eingeschaltet sind). Darauf startet die Wiedergabe, wenn gerade nichts läuft.

**Was angezeigt wird:**

| Ort | Inhalt |
|-----|--------|
| Seite **Spotify** (Menüpunkt erscheint, sobald Spotify eingeschaltet ist) | aktueller Titel mit großem Cover, Position (antippen zum Springen), Zufall, Zurück, Pause/Fortsetzen, Weiter, Wiederholen (aus → alle → dieser Titel), Lautstärke; Gerätewahl (übergibt die laufende Wiedergabe). Direkt darunter „Als Nächstes“ und „Zuletzt gehört“ nebeneinander, jede Liste scrollt für sich. Suche nach Titeln, Alben, Künstlern und Playlists (je höchstens 10 Treffer – Grenze von Spotify; auf breiten Bildschirmen neben dem Player). Ganz unten die eigenen Playlists als aufklappbare Liste (die gerade laufende ist markiert). Ein Tipp auf einen Titel spielt ihn ab, „+“ hängt ihn an die Warteschlange |
| Übersicht **Standard** | solange Musik läuft: Mini-Player unter Uhr und Wetter (neben dem 3D-Druck, falls einer läuft) mit allen Bedienelementen und ein Statushinweis mit dem Titel; im **Kioskmodus** eine einzeilige Leiste |
| Übersicht **Nexus** | Panel „Musik“ in der linken Spalte |
| **Eigene** Startseite | Widget „Spotify“ – erscheint ebenfalls nur, solange Musik läuft (beim Bearbeiten als Platzhalter sichtbar) |
| Seitenleiste / Kopfzeile | Verbindungspunkt „Spotify“ |

**Wann der Mini-Player erscheint:** solange Musik läuft – und nach dem Pausieren noch einige Minuten (Standard 5, einstellbar, 0 = sofort ausblenden), damit du sie von der Übersicht aus fortsetzen kannst. Mit „Nur anzeigen, wenn auf dem gewählten Gerät gespielt wird“ erscheint er nur, wenn der Verstärker spielt, nicht bei Musik auf dem Handy. „Mini-Player auf den Übersichten anzeigen“ schaltet ihn ganz ab.

**Datenschutz:** Die Cover lädt der **Browser** direkt vom Spotify-CDN (`i.scdn.co`). Der Refresh-Token steht in `config.json`; *Trennen* in den Einstellungen löscht ihn. Im **Demo-Modus** spielt ein simulierter Player mit erfundenen Titeln, solange kein Konto verbunden ist.

---

## Mähroboter (Navimow)

Segway-**Navimow**-Mähroboter bindet HomeApp über den ioBroker-Adapter [`navimow`](https://github.com/TA2k/ioBroker.navimow) an. Der Adapter meldet sich per OAuth an der offiziellen Navimow-Schnittstelle an (dieselbe, die die Home-Assistant-Integration von Navimow nutzt) und bekommt Live-Werte per MQTT; HomeApp liest und schreibt nur dessen Datenpunkte. Einen lokalen Zugriff ohne Cloud bietet Navimow nicht.

**Einrichten:**

1. In ioBroker den Adapter `navimow` installieren und anmelden (siehe Anleitung des Adapters). Für die Karte in den Adapter-Einstellungen **„mapEnabled“** einschalten – erst dann legt er Fahrspur (`mapTrack`), Kartenausschnitt (`mapFrame`) und Ladestation (`dockPosition`) an.
2. In HomeApp *Einstellungen → Geräte → + Gerät*, Typ **Mähroboter** wählen, Raum (z. B. Garten) festlegen und **„Aus navimow übernehmen“** tippen: Alle Datenpunkte werden aus dem Adapter eingetragen. Alternativ findet *Automatisch erkennen* den Mäher ebenfalls (Raum „Garten“). Speichern.
3. Die Knöpfe (`remote.start` usw.) gehören wie alle Adapter-Datenpunkte dem Administrator. Unter *Verbindungen & Zugriff → ioBroker → Schreibrechte prüfen* erscheinen sie in der Liste und im Korrektur-Skript (siehe [Verbindung zu ioBroker](#verbindung-zu-iobroker)).

Sobald ein Mähroboter eingerichtet ist, erscheint im Menü die Seite **Mähroboter**:

| Bereich | Inhalt |
|---------|--------|
| Karte | Gemähte Bahnen der aktuellen Sitzung (in der eingestellten Schnittbreite), die zuletzt gefahrene Strecke hervorgehoben, Startpunkt, Ladestation und der Mäher mit Fahrtrichtung, darunter ein Meter-Raster mit Maßstab. Positionen zwischen zwei Spur-Updates des Adapters zeichnet die App selbst weiter, die Karte folgt dem Mäher also live. Ein Tipp öffnet sie groß. Koordinaten sind Meter im System des Mähers (kein GPS) |
| Zustand | Fortschritt der Sitzung, Akku (mit Ladeanzeige in der Station), gemähte Fläche dieser Sitzung und dieser Woche |
| Steuerung | **Start**, **Pause**, **Fortsetzen**, **Zur Station** – die zum Zustand passenden Knöpfe sind hervorgehoben, alle bleiben aber bedienbar, weil die Cloud den Zustand bis zu einer Minute verzögert meldet. Auf schmaleren Bildschirmen (z. B. Wanddisplay hochkant mit 1200 × 1920 bei Pixelverhältnis 2) stehen Zustand und Steuerung nebeneinander über der Karte |
| Wartung | **Status abrufen**, **Karte zurücksetzen** und **Ladestation neu bestimmen** (die beiden letzten mit Rückfrage) |
| Details | Zustand im Wortlaut des Adapters, Modell, Firmware, Zeit der letzten Status- und Positionsmeldung, Position, Ladestation, Cloud-Verbindung |

Ist der Adapter nicht mit der Cloud verbunden oder meldet der Mäher *angehoben* bzw. einen Fehler, steht ein Hinweis über der Seite. Bei mehreren Mährobotern wechselt man oben zwischen ihnen. Unter *Räume* erscheint der Mäher als Karte mit Zustand, Akku, Fortschritt und dem passenden Befehl; ein Tipp öffnet die Seite.

**Optionen des Geräts:** *Schnittbreite* (Breite der gemähten Bahn auf der Karte, i-Serie 18 cm, H-Serie 21 cm; Standard 20) und *Karte drehen* (0°, 90°, 180°, 270°), damit die Karte zum Blick auf den Garten passt.

**Grenzen der Navimow-Schnittstelle:** Zeitpläne, Zonen, Schnitthöhe und die Rasenkarte der App sind nicht zugänglich. Die Karte zeigt deshalb die gefahrene Spur der aktuellen Sitzung, nicht die Rasenfläche. „Stopp“ des Adapters pausiert nur und fehlt deshalb als eigener Knopf.

**Benachrichtigungen:** z. B. eine Regel auf den Zustands-Datenpunkt mit *gleich* `isLifted` (Mäher angehoben) oder `Error`, Ziel *Mähroboter*.

Im **Demo-Modus** mäht ein simulierter Mäher einen Rasen in Bahnen, fährt bei leerem Akku zur Station, lädt und startet wieder; alle Knöpfe wirken.

---

## Benachrichtigungen

Unter *Einstellungen → Benachrichtigungen* legst du eigene **Alarme, Warnungen und Hinweise** an. Jede Regel überwacht einen Datenpunkt; der Server prüft sie bei jeder Wertänderung, auch wenn gerade niemand die App geöffnet hat.

| Feld | Bedeutung |
|------|-----------|
| Datenpunkt | ioBroker-Datenpunkt, mit Live-Suche – oder bequem „Datenpunkt eines Geräts übernehmen“ |
| Bedingung | größer / kleiner (oder gleich) als, gleich, ungleich, ist an/offen, ist aus/zu |
| Grenzwert | z. B. `65` (%) oder `16` (°C) |
| Hysterese | nur bei Zahlen: Die Meldung endet erst, wenn der Wert um so viel zurückgegangen ist (> 65 mit Hysterese 3 endet unter 62) – kein Flackern am Grenzwert |
| Verzögerung | Bedingung muss so lange (Sekunden) erfüllt sein, bevor gemeldet wird – kurze Spitzen werden ignoriert |
| Art | **Alarm** (rot), **Warnung** (orange) oder **Hinweis** (blau) |
| Bis zur Quittierung anzeigen | Meldung bleibt dauerhaft sichtbar, bis jemand „Quittieren“ drückt – auch wenn der Auslöser vorher wieder vorbei ist (bei Alarmen standardmäßig an) |
| Text | eigener Text, `{value}` wird durch den aktuellen Wert ersetzt |
| Beim Antippen öffnen | Seite der App (bei *Räume* auch der Raum), zu der ein Tipp auf die Meldung springt |

Vorlagen gibt es für *hohe Luftfeuchte*, *niedrige Temperatur* und *Tür / Fenster offen*.

In der App erscheinen aktive Meldungen als **Glocke mit Zähler** (Kopfzeile bzw. Seitenleiste), als **Leiste über jeder Seite** (Alarme und Warnungen) und beim Auftreten als kurze Einblendung. In der Liste lässt sich eine Meldung ausblenden, bis sie das nächste Mal auftritt. Verbindungsprobleme (Server, ioBroker, Surveillance Station) zeigt die App automatisch als Hinweis an. Im Demo-Modus sind Beispiel-Regeln aktiv, solange keine eigenen angelegt sind (u. a. ein Alarm „Haustür geöffnet“, der etwa alle zehn Minuten auftritt).

**Quittierung von Alarmen:** Meldungen mit Quittierungspflicht (standardmäßig alle Alarme) stehen als **rote, pulsierende Leiste über jeder Seite** und lassen sich nicht ausblenden. Sie bleiben, bis jemand **„Quittieren“** drückt – auch dann, wenn der Auslöser schon wieder vorbei ist (z. B. Tür wieder zu); die Leiste zeigt dann „beendet um …“. Die Quittierung gilt sofort für alle Geräte. Wird ein Alarm quittiert, während der Auslöser noch besteht, bleibt er als normale Meldung in der Liste, bis der Auslöser endet. Bei mehreren offenen Alarmen gibt es „Alle quittieren“. Offene Alarme werden in `/data/alerts.json` gespeichert und überstehen einen Neustart oder ein Update des Containers.

### Pushover (Push-Nachrichten aufs Handy)

Unter *Einstellungen → Pushover (Handy)* schickt der Server Meldungen über [Pushover](https://pushover.net) aufs Handy – auch wenn keine App geöffnet ist.

1. Bei pushover.net anmelden, die Pushover-App installieren und den **User Key** (oben auf der Startseite) kopieren.
2. Unter *Create an Application/API Token* eine Anwendung (z. B. „HomeApp“) anlegen und deren **API-Token** kopieren.
3. Beides eintragen (write-only, bleibt auf dem Server), **Testnachricht senden**, einschalten und speichern.

Je Ereignis lässt sich festlegen, ob es gesendet wird und mit welcher **Priorität** (*Leise*, *Normal*, *Hoch* – klingelt auch bei „Nicht stören“ – oder *Notfall* – wiederholt sich jede Minute bis zur Bestätigung, höchstens eine Stunde):

| Gruppe | Ereignisse (Standard) |
|--------|-----------------------|
| Eigene Benachrichtigungen (Sensoren) | Alarme (an, Hoch), Warnungen (an), Hinweise (aus), Entwarnung, wenn die Bedingung vorbei ist (aus) – einzelne Regeln lassen sich unter *Benachrichtigungen* mit „Per Pushover aufs Handy senden“ ausnehmen |
| Erinnerungen | Müllabfuhr (an), Lüftung (aus) |
| 3D-Drucker | Druck fertig (an, mit Dauer), Druckfehler (an, Hoch), abgebrochen (aus), pausiert – z. B. Filament leer (an), Statusupdates während des Drucks (aus, Leise) – alle 10 Minuten bis 4 Stunden (Standard 30 Minuten) mit Fortschritt, Schicht, Restzeit, voraussichtlichem Ende und Webcam-Foto |
| Kameras | Person erkannt (an), Bewegung (aus); standardmäßig nur, wenn auch das Pop-up erscheinen würde (Pop-up-Schalter und Zeitpläne) |

Kamera- und Druckermeldungen bekommen das aktuelle **Kamera- bzw. Webcam-Bild** angehängt (abschaltbar; die Statusupdates des Druckers immer). Das erste Statusupdate kommt ein Intervall nach Druckbeginn, während einer Pause oder ohne Verbindung zum Drucker keines. Mit der **Adresse der App** enthält jede Nachricht einen Link, der die passende Seite öffnet. In der **Ruhezeit** (Uhrzeit des Servers, Zeitzone über `TZ`) kommen normale und leise Nachrichten ohne Ton an; *Hoch* und *Notfall* klingeln weiter. Optional lassen sich bestimmte Geräte und ein Ton wählen.

Wie die Wanddisplays reagiert Pushover nur auf **neue** Meldungen: In der ersten Minute nach dem Start und nach jedem Speichern der Einstellungen wird nichts gesendet. Höchstens 30 Nachrichten in 10 Minuten (schützt das Monatskontingent der Pushover-Anwendung). Im Demo-Modus werden keine Ereignisse gesendet, die Testnachricht funktioniert.

---

## Müllabfuhr

Unter *Einstellungen → Müllabfuhr* trägst du die Adresse des **Abfuhrkalenders** deines Entsorgers ein (ICS/iCal oder `webcal://`). Viele Entsorger bieten auf ihrer Seite mit den Abfuhrterminen nach der Wahl der Straße einen Link wie *Kalender abonnieren* oder *iCal-Export* an, z. B. `https://entsorger.example/abfuhrkalender/<Straße>/ics`. *Testen* zeigt die gefundenen Abfallarten und die nächsten Termine.

- **Erinnerung:** Am Vorabend ab 17 Uhr erscheint „Morgen: Restmüll, Bio“, am Abholtag bis 10 Uhr „Heute: …“ (beide Zeiten einstellbar). Wahlweise als auffällige Warnung mit Banner oder nur als Hinweis in der Glocke.
- **Abfallarten** lassen sich einzeln abwählen, z. B. wenn Papier nicht vom eigenen Haus abgeholt wird. Farben und Kurznamen werden aus den Kalendertexten erkannt: Rest, Bio, Papier, Gelber Sack/Wertstoff, Glas, Sperrmüll, Schadstoffe, Weihnachtsbäume.
- **Übersicht:** Steht eine Abholung heute, morgen oder übermorgen an, zeigt die Standard-Übersicht einen Status-Chip. Für die eigene Startseite gibt es das Widget **„Müllabfuhr“** mit den nächsten Terminen.
- Der Server lädt den Kalender alle 6 Stunden (bei Fehlern nach 15 Minuten erneut) und hält eine Kopie in `/data/waste.json`. Ein Ausfall des Entsorger-Servers fällt deshalb nicht auf.
- **Jahreskalender:** Viele Entsorger veröffentlichen je Jahr einen eigenen Kalender. Endet der Kalender in weniger als drei Wochen, weist die Einstellungsseite darauf hin; dann die neue Adresse eintragen.

---

## Lüftungsempfehlung

*Einstellungen → Lüftung* berechnet je Raum, ob Lüften sinnvoll ist:

| Grund | Bedingung (Standardwerte) |
|---|---|
| **Zu feucht** | relative Luftfeuchte ≥ 60 % **und** die Außenluft enthält mindestens 1 g/m³ weniger Wasser (absolute Feuchte nach Magnus aus Temperatur und relativer Feuchte, innen und außen) |
| **CO₂ hoch** | ≥ 1000 ppm (*CO₂ ab*); ab 1400 ppm (*CO₂ dringend ab*) als Warnung mit Banner. Dieselben Schwellen gelten für die CO₂-Ampel der Wanddisplays |
| **Abkühlen** (optional) | Raum ≥ 25 °C und außen mindestens 3 K kühler |
| **Fenster schließen** | Fenster offen (Kontakt) und außen feuchter als innen |

Hysteresen (100 ppm, 3 % rF, 1 K) verhindern ein Flackern an den Grenzen. Ein offenes Fenster wird als „Wird gelüftet“ angezeigt.

**Räume:** Ohne eigene Liste nimmt die App automatisch alle Räume mit einem Sensor der Art *Luftfeuchte* oder *CO₂*. Die Temperatur kommt von einem Temperatursensor oder dem Ist-Wert eines Thermostats im selben Raum, der Fensterkontakt von einem Sensor der Art *Fenster*. Mit *Aus Geräten übernehmen* lässt sich diese Liste als Vorlage kopieren und je Raum anpassen. Außenräume (Garten, Balkon, Terrasse, „Außen“) werden übersprungen. **Wanddisplays mit CO₂-Sensor** (Kiosk-Agent) sind immer automatisch mit ihrem Namen dabei – mit dem CO₂-Wert der letzten Meldung, offline ohne Wert –, außer ihr CO₂-Datenpunkt ist bereits einem Raum zugeordnet.

**Außenluft:** Die Werte kommen aus eigenen Datenpunkten, sonst von der Wetterstation (*Einstellungen → Wetter*), sonst aus dem Internet-Wetter des Standorts.

Die Empfehlungen erscheinen in der Glocke (wahlweise auch als Banner), als Status-Chip auf der Übersicht („Bad lüften“) und im Widget **„Lüften“** der eigenen Startseite, das alle Räume mit ihren Werten zeigt.

---

## Kiosk-Sensoren am Raspberry Pi

Ein Wanddisplay am Raspberry Pi kann mit günstigen Sensoren schlauer werden. Der **Kiosk-Agent** im Ordner [`kiosk-agent/`](kiosk-agent/README.md) läuft als kleiner Python-Dienst auf dem Pi und liest:

- **HLK-LD2410** (24-GHz-Radar, UART): erkennt Anwesenheit auch ohne Bewegung. Ist eine einstellbare Zeit (Standard 3 Minuten) niemand da, **geht das Display aus**; sobald jemand kommt, geht es wieder an. In **„Immer an“-Zeiten** bleibt es an, und **Kamera-Einblendungen sowie neue Benachrichtigungen schalten es ein**, außer in **Ruhezeiten** (Standard 22–6 Uhr). Ohne Radar schaltet der Agent das Display nach festen **Aus-Zeiten**.
- **BH1750** (Lichtsensor, I²C): **Helligkeit des Displays nach dem Umgebungslicht**, logarithmisch zwischen „dunkel“ und „hell“ und geglättet. Ohne Lichtsensor dimmt der Agent nach festen **Dimmzeiten** auf eine einstellbare gedimmte bzw. helle Helligkeit.
- **Sensirion SCD41** (I²C): echtes **CO₂** (photoakustisch), dazu Temperatur und Luftfeuchte.

Verkabelung in Kurzform:

- LD2410: 5 V, GND, TX → GPIO15 (Pin 10), RX → GPIO14 (Pin 8).
- BH1750 und SCD41 an 3,3 V, GND, SDA GPIO2 (Pin 3) und SCL GPIO3 (Pin 5).

Installation: Ordner auf den Pi kopieren und `sudo ./install.sh` ausführen. Das Skript fragt nach der **Melde-Adresse** aus *Einstellungen → Kiosk-Sensoren*. Details, Tabelle der Display-Methoden (Touchdisplay-Hintergrundbeleuchtung, `wlr-randr`, `xset`, `ddcutil`, eigene Befehle) und Fehlersuche stehen in [`kiosk-agent/README.md`](kiosk-agent/README.md).

In HomeApp:

- *Einstellungen → Kiosk-Sensoren* zeigt alle Agenten mit Status, letzten Werten und Fehlern. Hier stellst du Ausschaltzeit, Zeitplan und Wecken (Immer-an-Zeiten, Wecken bei Kamera-Einblendungen und Benachrichtigungen ab einer Stufe, Ruhezeiten; in der Ortszeit des Pi), feste Aus- und Dimmzeiten samt gedimmter und heller Helligkeit für Displays ohne Sensoren, maximale Entfernung des Radars, Helligkeitskurve, Messintervall, Höhe über NN (CO₂-Korrektur) und eine Temperatur-Korrektur ein. Die Werte gelangen mit jeder Meldung zum Agenten.
- Die Messwerte werden zu lokalen, nur lesbaren Datenpunkten `homeapp.kiosk.<id>.presence`, `.moving`, `.still`, `.distance`, `.lux`, `.co2`, `.temperature`, `.humidity`, `.screen`, `.wake` (Display wird vom Zeitplan oder einer Benachrichtigung angehalten), `.brightness` und `.online`. Sie erscheinen in der Datenpunkt-Suche, lassen sich als **Sensor-Gerät** einem Raum zuordnen (das CO₂ nimmt auch ohne Zuordnung an der Lüftungsempfehlung teil), in **Benachrichtigungen** und im **Verlauf** nutzen. An ioBroker werden sie nicht weitergegeben.
- **Direkt sichtbar:** Standard- und Nexus-Übersicht zeigen die Sensorwerte automatisch je Wanddisplay; auf der eigenen Startseite lässt sich das Widget **Kiosk-Sensoren** hinzufügen. Die Radar-Seite zeigt CO₂ besonders groß sowie Temperatur, Luftfeuchte und Helligkeit. Die CO₂-Ampel nutzt die Schwellen der Lüftungsempfehlung: **grün unter *CO₂ ab*** (Standard 1.000 ppm), **gelb ab *CO₂ ab*** und **rot ab *CO₂ dringend ab*** (Standard 1.400 ppm), mit zusätzlichem Statustext. Die Werte werden alle 15 Sekunden aus der letzten Agent-Meldung geladen. Fehlende Messwerte erscheinen als Strich; Offline-Werte werden als letzte Werte ohne grüne Bewertung gekennzeichnet.
- *Anzeige & Bedienung → Präsenz- und Lichtsensor* (je Gerät):
  - Wer vor dem Display steht, weckt den Bildschirmschoner und hält ihn fern; ebenso, solange der Agent das Display per Zeitplan oder Benachrichtigung anhält.
  - Optional startet der Bildschirmschoner immer, sobald niemand da ist.
  - Optional dunkelt die App ab, wenn es im Raum dunkel ist.
- Meldet sich ein Agent 90 s lang nicht, gilt er als offline und seine Präsenz als „niemand da“.
- Im Demo-Modus meldet ein simuliertes „Wanddisplay (Demo)“ Werte, samt simuliertem Radar.

### Radar-Seite

Sobald ein Wanddisplay einen LD2410 meldet, erscheint im Menü die Seite **Radar**. Sie zeigt je Wanddisplay den Sichtbereich des Radars (±60°) mit Entfernungsringen:

- **Ziele als Bögen:** Der LD2410 misst nur die Entfernung, nicht die Richtung. Bewegung (grün) und ruhende Person (violett, z. B. Atmung) erscheinen deshalb als Bogen in ihrem Abstand, dicker bei stärkerem Signal, mit kurzem Nachleuchten.
- **Energie je Entfernungstor:** Die Ringe und ein Balkendiagramm zeigen, wie stark der Radar in jedem 0,75-m-Tor Bewegung und Anwesenheit sieht. Das hilft beim Ausrichten und beim Einstellen der maximalen Entfernung, die als gestrichelte Grenze erscheint.
- **Live:** Solange die Seite offen und sichtbar ist, sendet der Agent etwa viermal pro Sekunde ein Bild und schaltet den Radar dafür in den Engineering-Modus. Danach schaltet er ihn wieder zurück und meldet wie gewohnt. Dafür ist **Kiosk-Agent 1.3.0** nötig; ältere Agenten zeigen auf der Seite ihre regelmäßigen Meldungen ohne Energiewerte.

---

## Als App auf Android installieren

HomeApp ist eine installierbare Web-App: installiert startet sie mit eigenem Symbol im **eigenen Fenster ohne Adressleiste und Browserleisten**.

1. Die App in **Chrome** öffnen.
2. *Einstellungen → Allgemein & App → Als App installieren* tippen – oder im Chrome-Menü (⋮) **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“ wählen.

**Wichtig – HTTPS:** Android/Chrome installiert eine echte App nur für sichere Adressen mit vertrauenswürdigem Zertifikat. HomeApp verwendet standardmäßig HTTPS (siehe [HTTPS](#https)); ein selbstsigniertes Zertifikat mit bestätigter Browserwarnung reicht für die Installation möglicherweise nicht. Lösungen:

- Ein vertrauenswürdiges eigenes Zertifikat direkt in HomeApp verwenden (siehe [HTTPS](#https)).
- **Reverse Proxy der Synology**: *Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy* → Quelle `https://homeapp.<deine-domain>:443`, Ziel `http://localhost:8095` (dafür HomeApp mit `HTTPS=false` starten); unter *Benutzerdefinierter Header* „WebSocket“ hinzufügen. Ein Zertifikat (z. B. Let's Encrypt) unter *Sicherheit → Zertifikat* zuweisen.
- Alternativ ein vorhandener Zugang über HTTPS (z. B. Tailscale, eigener Proxy).

Mit Zugriffsschutz (`APP_USER` / `APP_PASSWORD`) fragt die installierte App beim ersten Start einmal nach den Zugangsdaten. Die Version der App steht in der Seitenleiste und unter *Einstellungen → Allgemein & App*; „Was ist neu?“ zeigt die Änderungen (nach einem Update öffnet sich die Übersicht einmal von selbst).

---

## Menü, Design und Kioskmodus (Wandtablet)

*Einstellungen → Anzeige & Bedienung* – diese Einstellungen gelten **nur für das jeweilige Gerät** (Browser) und wirken sofort. So kann ein Wandtablet im Kioskmodus laufen, während Handy und PC normal bleiben.

**Design der Übersicht:** „Standard“ (Kommandozentrale, folgt hellem/dunklem Farbschema: Uhr, Home Core und Wetter mit UV-Index samt kleiner UV-Prognose neben Sonnenauf- und -untergang, die Rundinstrumente Batterie, Licht und Wärmepumpe, Energiefluss – solange ein Mähroboter mäht, an dessen Stelle seine Live-Karte mit Fortschritt, Akku und gemähter Fläche –, Sicherheit, Räume und Szenen) oder **„Nexus“**: ein holografischer digitaler Zwilling des Hauses. Jede Etage schwebt einzeln über einem Projektor; die Räume werden automatisch aus deiner Raumliste angeordnet (kein Grundriss nötig – die Etage je Raum legst du unter *Einstellungen → Räume* fest, ohne Angabe gilt Erdgeschoss). Räume leuchten in der Farbe ihrer Temperatur und zeigen Licht, Anwesenheit (Bewegungs-/Präsenzmelder), Heizung, offene Fenster und Warnungen; Solardach, Wärmepumpe und Batterie erscheinen, wenn vorhanden. Drumherum: Uhr mit Tageslichtlinie, Hinweise, Raumklima, Wetter mit 12-h-Kurve, Kameras, Türen/Fenster, Licht, Energiefluss mit 24-h-Wellenform und Szenen. Nexus ist immer dunkel und passt sich vom Handy bis zum Kiosk-Bildschirm an. Per Adresse wählbar: `?design=nexus` bzw. `?design=standard` (kombinierbar mit `?kiosk=1`).

**Eigene Startseite:** Das dritte Design **„Eigene“** gestaltest du komplett selbst. Wähle es aus und tippe auf *Startseite bearbeiten* (oder auf der Übersicht auf *Bearbeiten*). Leg mit *Widget* neue Bausteine an – Uhr (optional mit Statuschips), Home Core, Wetter, ein einzelner Teil der Wetterseite (Aktuelle Werte, Stundenprognose, Temperaturverlauf, Sonne, UV-Index, Nächste 3 Tage, Regen oder Regenradar), ein Rundinstrument (Solar, Batterie, Autarkie, Raumklima, Licht oder Wärmepumpe), Energiefluss (optional mit 24-h-Kurve), ein einzelner Energiewert oder -verlauf (Erzeugung, Verbrauch, Netz, Batterie, Autarkie, Eigenverbrauch), Sicherheit, Kamera, alle Räume, ein einzelner Raum, Szenen, Licht mit „Alle aus“, eine eigene Geräteauswahl, der 3D-Drucker, der Spotify-Mini-Player, die Müllabfuhr, die Lüftungsempfehlung oder eine Notiz – oder beginne mit einer Vorlage. Das Raster hat 12 Spalten: Widgets verschiebst du am Griff, die Größe änderst du an der Ecke unten rechts (per Tastatur: Pfeiltasten auf dem Griff verschieben, mit Umschalt die Größe ändern); ⚙ öffnet Optionen sowie Position und Größe als Zahlen. Andere Widgets weichen beim Verschieben nach unten aus. Ist ein Widget größer als sein Inhalt, wird der Inhalt passend vergrößert (je Widget abschaltbar). Licht- und Geräte-Widgets zeigen Lampen und Schalter auf Wunsch als **kleine Schalter**. *Speichern* übernimmt das Layout für **alle Geräte**, die das Design „Eigene“ nutzen (die Auswahl des Designs bleibt je Gerät). Auf schmalen Bildschirmen stehen die Widgets untereinander (von oben links nach unten rechts); im Kioskmodus teilen sich die Zeilen die Bildschirmhöhe, solange sie dabei nicht zu klein werden – sonst lässt sich die Seite scrollen. Per Adresse: `?design=custom`.

**Wischen:** Auf Touch-Bildschirmen wechselt ein Wisch nach links zur nächsten, nach rechts zur vorherigen Seite (in der Reihenfolge des Menüs). Nur deutliche, schnelle Wischgesten zählen; kurzes Ziehen, Scrollen, Schieberegler, Diagramme und seitlich scrollende Leisten lösen keinen Seitenwechsel aus.

**Menügröße – Voll, Klein, Ausblenden:** Der Knopf unten in der Seitenleiste schaltet weiter: **Voll** (Seitenleiste mit Namen) → **Klein** (schmale Symbolleiste wie auf Tablets) → **Ausblenden**; auf Tablets blendet er direkt aus. Dieselbe Auswahl gibt es unter *Einstellungen → Anzeige & Bedienung → Menü*. Ausgeblendet nutzen die Seiten die volle Breite. Der Knopf **☰** (oben links, auf dem Handy unten rechts) öffnet es jederzeit als Einblendung, daneben bleibt die Glocke mit den Benachrichtigungen sichtbar. Mit **„Automatisch ausblenden“** verschwindet das Menü nach einer einstellbaren Zeit ohne Bedienung (Standard 20 s).

**Hochformat und Handy:** Steht der Bildschirm hochkant (z. B. Wandtablet mit 1200 × 1920), sitzt das Menü als **Leiste unten** in Daumenhöhe – *Voll* mit Namen, *Klein* nur mit Symbolen. Oben zeigt eine Kopfleiste die aktuelle Seite mit großen Seitenpunkten (antippen springt direkt), Glocke, Farbschema und Einstellungen. **☰** öffnet die **Seitenübersicht** als Blatt von unten: alle Seiten als große Kacheln, dazu Einstellungen, helles/dunkles Design, die Wahl der Menüleiste und der Verbindungsstatus; Wischen nach unten, ✕ oder Tippen daneben schließt sie. Auf dem Handy zeigt die Leiste unten vier Seiten, **„Mehr“** öffnet dieselbe Übersicht.

**Kioskmodus** – für eine dauerhafte Anzeige, optimiert für **1280 × 800** im Querformat und **800 × 1280** im Hochformat (z. B. 10″-Wandtablet):

- Die Übersicht passt ohne Scrollen auf einen Bildschirm: Uhr, Home Core und Wetter, Rundinstrumente, Energiefluss (bzw. der mähende Mähroboter), Kameras und offene Kontakte, Szenen und alle Räume als Leiste. Im Hochformat stehen die Bereiche untereinander, Nexus zeigt den Zwilling oben.
- Auf größeren Displays wachsen Schrift und Bedienelemente mit (z. B. 1,5-fach bei 1920 × 1200 oder 1200 × 1920), damit alles gleich groß lesbar bleibt.
- Das Menü ist ausgeblendet, bleibt aber über ☰ **immer erreichbar** – alle Seiten und Einstellungen sind weiter bedienbar. Alle Bedienelemente sind auf Fingerbedienung ausgelegt (mindestens etwa 44 × 44 Pixel bei 100 %).
- Nach einer Zeit ohne Bedienung (Standard 120 s, 0 = nie) kehrt die Anzeige zur Übersicht zurück und schließt offene Fenster; aus den Einstellungen heraus passiert das nicht.
- Optional: Mauszeiger nach 5 s ausblenden, Bild alle paar Minuten um wenige Pixel verschieben (gegen Einbrennen), Bildschirm eingeschaltet lassen (Wake Lock, im Browser nur über HTTPS).
- Auf kleineren Bildschirmen (unter 900 × 560 Pixel quer bzw. 768 × 1100 hochkant) erscheint die normale, scrollbare Übersicht. Meldet ein 10″-Display mit 1200 × 1920 nur 600 × 960 CSS-Pixel (Pixeldichte 2), im Kiosk-Browser die Skalierung auf 75 % stellen (z. B. Fully Kiosk: *Web Zoom and Scaling*), dann gilt das Kiosk-Layout für 800 × 1280.
- **Skalierung fest einstellen:** Unter *Anzeige → Skalierung* statt „Automatisch“ z. B. 150 % für ein 10″-Hochformat-Display mit 1200 × 1980 wählen. Die Bildschirm-Diagnose darunter zeigt, was der Browser meldet und welches Layout gilt.
- **Testen am Gerät:** `?fps=1` blendet eine Bildrate-Anzeige ein, `?effects=low|medium|high` setzt die Effektstufe (z. B. `/?kiosk=1&effects=medium` für schwächere Tablets).

Im Chrome-Vollbild werden Hintergrundunschärfen der Standard- und Kiosk-Übersicht deaktiviert, um Flackern zu reduzieren. Der animierte Hintergrund der Standard-Übersicht steht still.

**Startadresse für Kiosk-Browser** (z. B. *Fully Kiosk Browser* auf Android): `https://<IP>:8095/?kiosk=1` schaltet den Kioskmodus auf diesem Gerät ein, `?kiosk=0` wieder aus. Im Kiosk-Browser „Bildschirm anlassen“ aktivieren; in normalen Browsern gibt es unter *Anzeige* einen Knopf „Vollbild“.

**Nachts abdunkeln:** dunkelt den Bildschirm in einem Zeitfenster (Standard 22–6 Uhr) in drei Stufen ab; die App bleibt bedienbar.

**Präsenz- und Lichtsensor:** Mit einem [Kiosk-Agenten](#kiosk-sensoren-am-raspberry-pi) am Display weckt Anwesenheit den Bildschirmschoner. Auf Wunsch startet er auch außerhalb des Ruhezeitraums, sobald niemand da ist, und die App dunkelt bei wenig Umgebungslicht ab.

**Bildschirmschoner:** Im eingestellten Ruhezeitraum (Standard 23–6 Uhr) zeigt das Gerät nach einer Minute ohne Bedienung nur noch einen schwarzen Bildschirm, wahlweise mit kleiner Uhr samt Außentemperatur und Wetterlage, die jede Minute die Position wechselt (gegen Einbrennen). Die App wird dabei vollständig angehalten – keine Animationen, Kamerabilder oder Aktualisierungen – und spart so Prozessor- und Grafikleistung. Antippen weckt sie auf, ohne etwas auszulösen; eine Minute nach der letzten Berührung startet der Schoner erneut. Alarme und Kamera-Popups wecken den Bildschirm automatisch; in den Einstellungen und bei geöffneter Kamera startet er nicht.

**Updates:** Geöffnete Seiten laden nach einem Update des Containers automatisch die neue Version – beim Wiederverbinden mit dem Server und spätestens nach 5 Minuten. Ein Wandtablet muss dafür nicht angefasst werden.

---
## Konfiguration über Umgebungsvariablen

Alle Werte sind optional. Integrationswerte dienen nur als **Vorgabe**. Was du unter *Einstellungen* einträgst und speicherst, hat **immer Vorrang** – die Umgebungsvariable gilt nur für Felder, die du nie von Hand gesetzt hast. Die Einstellungen zeigen pro Feld, ob der Wert aus einer Variablen stammt oder manuell gesetzt ist; mit „Vorgabe wiederherstellen“ gibst du ein Feld wieder an die Variable zurück. Passwörter: Ein in der App gespeichertes Passwort hat Vorrang, sonst gilt das aus der Umgebung (Passwörter aus der Umgebung werden nie in `config.json` geschrieben). Serverwerte wie `PORT`, `HTTPS`, `TLS_CERT` und `TLS_KEY` werden ausschließlich über die Umgebung konfiguriert.

Eine Änderung der `.env` wirkt erst, wenn das Projekt neu erstellt wird (ein Neustart liest sie nicht neu ein). Leere Variablen zählen als nicht gesetzt.

| Variable | Beschreibung |
|----------|--------------|
| `PORT` | Server-Port (Standard `8080`); im Container unverändert lassen und stattdessen den Host-Port in Compose konfigurieren |
| `DATA_DIR` | Datenverzeichnis (im Container `/data`, sonst `./data` relativ zum Startverzeichnis) |
| `HTTPS` | Standard aktiv (auch leer); `false`, `0`, `no`, `off` deaktivieren HTTPS (Groß-/Kleinschreibung egal) |
| `TLS_CERT`, `TLS_KEY` | Zertifikat und privater Schlüssel (PEM), Standard `<DATA_DIR>/certs/cert.pem` und `<DATA_DIR>/certs/key.pem`; im Container erreichbare Pfade |
| `APP_USER`, `APP_PASSWORD` | Zugriffsschutz per HTTP Basic Auth |
| `DEMO_MODE` | `1` = Demo als Vorgabe, `0` = Live |
| `IOBROKER_MODE` | `demo` oder `socketio` |
| `IOBROKER_HOST`, `IOBROKER_PORT`, `IOBROKER_SECURE` | ioBroker-Adresse (`IOBROKER_HOST` schaltet automatisch auf Live) |
| `IOBROKER_PROTOCOL` | `ws` oder `socketio` |
| `IOBROKER_USER`, `IOBROKER_PASSWORD`, `IOBROKER_VERIFY_SSL` | Anmeldung / Zertifikatsprüfung |
| `SS_HOST`, `SS_PORT`, `SS_HTTPS` | Surveillance Station (`SS_HOST` aktiviert sie) |
| `SS_ACCOUNT`, `SS_PASSWORD`, `SS_VERIFY_SSL` | Anmeldung / Zertifikatsprüfung |
| `SS_DEVICE_ID` | Geräte-Token von DSM (2FA), normalerweise nicht nötig – die App speichert es selbst |
| `TZ` | Zeitzone, z. B. `Europe/Berlin` |
| `HOMEAPP_PORT` | Host-Port für `docker-compose.generic.yml` (Standard `8095`) |

---

## HTTPS

HTTPS ist **standardmäßig aktiv**, ohne Änderung des Ports: `https://<HomeApp-Host>:8095` (Container: `PORT=8080`, standardmäßiges Mapping `8095:8080`). WebSockets wechseln automatisch auf `wss://`.

Wer versehentlich `http://<HomeApp-Host>:8095` aufruft, wird automatisch auf `https://` mit derselben Adresse, demselben Port und Pfad umgeleitet (HomeApp erkennt am ersten Byte der Verbindung, ob verschlüsselt wird). Die Weiterleitung ist vorübergehend (307) und wird nicht zwischengespeichert, damit nach einem späteren Umschalten auf `HTTPS=false` keine alte Weiterleitung im Browser hängen bleibt.

Beim ersten Start erzeugt OpenSSL ein selbstsigniertes Zertifikat (10 Jahre gültig) unter `data/certs/cert.pem` und `data/certs/key.pem` (im Container `/data/certs`). Die Dateien bleiben im Daten-Volume bei Updates erhalten. Die **Browserwarnung einmalig bestätigen**; beim Zugriff über eine andere Host-IP passt außerdem der Zertifikatsname nicht zur Adresse.

Für ein **eigenes Zertifikat**, z. B. ein Let's-Encrypt-Zertifikat, Zertifikat (ggf. inklusive Zwischenzertifikaten) und privaten Schlüssel als `data/certs/cert.pem` / `data/certs/key.pem` ablegen. Alternativ `TLS_CERT` und `TLS_KEY` auf andere, im Container erreichbare PEM-Dateien setzen (bei Dateien außerhalb von `data` einen zusätzlichen Volume-Mount einrichten). Beide Dateien müssen vorhanden sein; fehlt eine, wird ein neues selbstsigniertes Paar erzeugt. Den privaten Schlüssel schützen und den Container nach Austausch oder Erneuerung des Zertifikats neu starten. Für ein vertrauenswürdiges Zertifikat muss die aufgerufene Adresse zum Zertifikat passen (bei Let's Encrypt üblicherweise der Domainname statt der IP).

Mit `HTTPS=false` in `.env` und neu erstelltem Compose-Projekt läuft HomeApp wieder über **reines HTTP auf demselben Port**. Das gilt auch für lokale Entwicklung: `HTTPS=false PORT=8099 npm start`; der Vite-Proxy zeigt weiterhin auf `http://localhost:8099`.

Bestehende **Webhook-URLs der Surveillance Station auf `https://` umstellen** – Aufrufe über `http://` bekommen ebenfalls nur die Weiterleitung, und ob DSM ihr folgt, hängt von der Version ab. Je nach DSM-Version werden selbstsignierte Zertifikate nicht akzeptiert; dann ein von der Station als vertrauenswürdig anerkanntes Zertifikat verwenden.

---

## Sicherheit

- Zugangsdaten für ioBroker, Synology, OctoPrint, Bambu Lab, Spotify und Pushover bleiben **auf dem Server**; der Browser sieht sie nie (auch nicht in den Einstellungen – Passwörter, der OctoPrint-API-Key, der Bambu-Zugangscode, die Spotify-Anmeldung sowie User Key und API-Token von Pushover sind „write-only“).
- `config.json` enthält die Passwörter, wenn du sie über die Oberfläche speicherst. Schütze das `data`-Verzeichnis entsprechend oder nutze Umgebungsvariablen.
- Die App kann nur Datenpunkte schreiben, die in der Konfiguration vorkommen.
- Setze `APP_USER` / `APP_PASSWORD`, bevor du die App über einen Reverse Proxy freigibst. Nur den **Webhook** (`/api/webhook/motion/…`) und die Adressen der Kiosk-Agenten (`/api/kiosk/report`, `/events`, `/radar`) erreichst du ohne Anmeldung – beide sind durch eigene zufällige Tokens geschützt. Kiosk-Agenten können nur ihre eigenen, nur lesbaren Werte melden.
- Verwende für ioBroker und Surveillance Station eigene Konten mit minimalen Rechten.

---

## Entwicklung

Voraussetzung für Backend und Frontend-Build: Node.js 20.19+ auf 20.x oder 22.12+.

```bash
# Backend (Demo-Modus, Port 8099)
cd server
npm install
HTTPS=false PORT=8099 DATA_DIR=./data npm start

# Frontend mit Hot-Reload (Port 5173, leitet /api und /ws an 8099 weiter)
cd client
npm install
npm run dev

# Produktions-Build des Frontends (wird vom Server aus client/dist ausgeliefert)
npm run build
```

Gegen einen echten ioBroker entwickeln:

```bash
IOBROKER_HOST=192.168.1.10 IOBROKER_PORT=8081 IOBROKER_SECURE=1 \
IOBROKER_USER=homeapp IOBROKER_PASSWORD=*** HTTPS=false DATA_DIR=./data-live PORT=8098 npm start
```

**Neue Version veröffentlichen:** Abschnitt `## [x.y.z] – Datum` oben in `CHANGELOG.md` ergänzen (die App zeigt diese Version und den Text unter „Was ist neu?“), committen und einen Tag pushen:

```bash
git tag -a v1.5.0 -m "HomeApp 1.5.0"
git push <remote> main v1.5.0
```

Der Push auf `main` baut das Docker-Image, der Tag erzeugt automatisch ein GitHub-Release mit dem passenden Changelog-Abschnitt als Release Notes (`.github/workflows/release.yml`).

---

## Erweiterbarkeit und Plugin-Aufwand

Ein Plugin-System ist noch nicht implementiert. Seiten wie Wetter, Drucker und Mähroboter werden
bereits teilweise erst beim Öffnen als Frontend-Code geladen; das ist jedoch kein Plugin-Mechanismus.
Navigation, Dashboard-Widgets, Einstellungen und Datentypen sind fest mit ihnen verdrahtet. Im
Backend sind Dienste, Konfiguration, API, Status und Ereignisse zentral registriert. Beispielsweise
nutzt die Lüftung das Wetter, der Mähroboter ioBroker-Datenpunkte und der Drucker zusätzlich
Einblendungen und Benachrichtigungen.

Für optionale Module wäre eine versionierte Schnittstelle für Lebenszyklus, Konfiguration und
Migrationen, API-Routen, Status/Ereignisse sowie Frontend-Seiten, Navigation, Widgets und
Einstellungen nötig. Abschalten müsste auch abhängige Funktionen, laufende Aufgaben und gespeicherte
Konfiguration berücksichtigen. Empfehlenswert ist zuerst ein **internes Modulregister** mit
ausgewählten gebündelten Modulen und anschließender Migration eines Pilotmoduls. Erst danach sollte
ein externes Plugin-Format samt Versionskompatibilität, Installation und Update-Regeln festgelegt
werden. Fremder Code im Serverprozess hätte grundsätzlich dieselben Rechte und Zugriffsmöglichkeiten
wie die App; echte Isolation erfordert eine separate Sicherheitsarchitektur.

Grobe Planung für eine mit dem Projekt vertraute Person, inklusive Tests und Migration, keine
verbindliche Zusage: internes Fundament und ein Pilotmodul etwa **2–4 Personenwochen**, Migration
weiterer eng gekoppelter Module jeweils etwa **1–3 Personenwochen**. Ein unterstütztes System für
unabhängig installierbare Drittanbieter-Plugins benötigt zusätzlich mindestens **4–8 Personenwochen**,
insbesondere für Verträge, Kompatibilität, Betrieb und Sicherheitskonzept. Aufwand und Reihenfolge
hängen davon ab, ob Nachladen zur Laufzeit, isolierte Ausführung und ein Plugin-Katalog verlangt werden.

---

## Aufbau des Projekts

```
HomeApp/
├─ Dockerfile, docker-compose.yml, .env.example
├─ server/                 Node.js (Express + ws)
│  └─ src/
│     ├─ index.js          Integrationen, WebSocket-Push, Serverstart
│     ├─ api.js            Authentifizierte REST-API-Routen
│     ├─ alerts.js         Benachrichtigungen (Regeln prüfen, aktive Meldungen, Quittierung)
│     ├─ auth.js           Zugriffsschutz (Basic Auth, Token-Vergleich)
│     ├─ config.js         Konfiguration (config.json + Umgebung)
│     ├─ iobroker.js       ioBroker-Verbindung (ws / socket.io, OAuth2)
│     ├─ permissions.js    Schreibrechte-Prüfung + Korrektur-Skript
│     ├─ synology.js       Surveillance Station Web API
│     ├─ cameras.js        Kameraliste (Surveillance Station + eigene Anpassungen)
│     ├─ motion.js         Bewegungsquellen zusammenführen
│     ├─ popup-rules.js    Zeitregeln für Bewegungs-Pop-ups
│     ├─ history.js        Verlaufsdaten (Minutenraster, 48 h)
│     ├─ layouts.js        Gruppierung/Reihenfolge der Seiten Licht und Klima
│     ├─ weather.js        Internet-Wetter, Ortssuche, Regenradar
│     ├─ octoprint.js      3D-Drucker über OctoPrint (Zustand, Webcam, Einblendungen, Demo-Drucker)
│     ├─ bambu.js          Bambu-Lab-Drucker lokal (MQTT-Bericht, Kamera, Befehle, Demo)
│     ├─ mqtt.js           schlanker MQTT-Client (3.1.1 über TLS) für Bambu Lab
│     ├─ spotify.js        Spotify Connect (Anmeldung per PKCE, Wiedergabe, Suche, Demo-Player)
│     ├─ kiosk.js          Kiosk-Sensoren (Meldungen der Pi-Agenten → lokale Datenpunkte)
│     ├─ waste.js          Müllabfuhr (ICS-Kalender, Erinnerungen)
│     ├─ ventilation.js    Lüftungsempfehlung (absolute Feuchte, CO₂, Kühlen)
│     ├─ pushover.js       Push-Nachrichten über Pushover (Ereignisse, Prioritäten, Ruhezeit)
│     ├─ discovery.js      Automatische Geräteerkennung
│     ├─ demo.js           Simulierte Installation (Demo-Modus)
│     ├─ demo-content.js   Beispielräume/-geräte
│     ├─ demo-mower.js     Simulierter Mähroboter (Datenpunkte wie der navimow-Adapter)
│     └─ util.js           Kleine gemeinsame Hilfsfunktionen
├─ kiosk-agent/            Python-Dienst für den Raspberry Pi (LD2410, BH1750, SCD41, Display an/aus/Helligkeit)
└─ client/                 React 19 + Vite + Tailwind 4 + Motion + Zustand
   └─ src/
      ├─ App.tsx           Layout, Navigation, Seiten-Wechsel (Ansichten werden bei Bedarf geladen)
      ├─ lib/              Store, API, Typen, Gerätetypen, Icons, Format, Kennzahlen der Übersicht,
      │                    Anzeige-Einstellungen, PWA
      ├─ components/       Gerätekarten, Energiefluss, Diagramme, Kameras, 3D-Drucker, Spotify-Player, Mähroboter-Karte, HUD-Anzeigen der Übersicht,
      │                    digitaler Zwilling (HomeTwin), Kiosk-Verhalten (DisplayEffects), UI
      ├─ assets/           Gebündelte Bilder (Mondbild des Wettersymbols)
      └─ views/            Übersicht (Standard, Nexus, Eigene), Wetter, Räume, Licht, Klima, Energie, Kameras,
                           Spotify, 3D-Drucker, Mähroboter, Radar, Einstellungen
```

---

## Konfigurationsformat (`config.json`)

Wird von den Einstellungen verwaltet; zur Orientierung ein verkürztes Beispiel:

```jsonc
{
  "app": { "name": "Zuhause", "motionPopup": true, "motionPopupSeconds": 30, "popupPosition": "center", "popupSize": "large", "snapshotRefreshSeconds": 3, "popupSnapshotRefreshSeconds": 1, "popupLiveVideo": true },
  "iobroker": { "mode": "socketio", "host": "192.168.1.10", "port": 8081, "secure": true, "protocol": "ws", "user": "homeapp" },
  "surveillance": { "enabled": true, "host": "192.168.1.5", "port": 5000, "account": "homeapp", "eventReasons": "2,3,9" },
  "octoprint": { "enabled": true, "type": "octoprint", "host": "192.168.1.20", "port": 80, "https": false, "apiKey": "…", "pollSeconds": 5,
                 "snapshotUrl": "", "streamUrl": "", "webcamRefreshSeconds": 2, "webcamLive": true, "dashboard": true,
                 "popup": true, "popupMinutes": 15, "popupSeconds": 20, "popupOnFinish": true, "popupPosition": "corner", "popupSize": "medium" },
  "bambu": { "host": "192.168.1.50", "serial": "01P00A123456789", "accessCode": "…", "camera": "auto", "streamUrl": "", "controls": true },
  "spotify": { "enabled": true, "clientId": "1a2b3c…", "refreshToken": "…", "account": "Alex", "device": "AV-Receiver Wohnzimmer",
               "onlyDevice": true, "dashboard": true, "pauseMinutes": 5, "pollSeconds": 3 },
  "rooms": [{ "id": "wohnzimmer", "name": "Wohnzimmer", "icon": "sofa", "floor": 0 }],
  "devices": [
    { "id": "stehlampe", "type": "light", "name": "Stehlampe", "room": "wohnzimmer",
      "states": { "power": "hue.0.Hue_Bridge.Stehlampe.on", "brightness": "hue.0.Hue_Bridge.Stehlampe.level" },
      "options": { "brightnessMax": 100 } },
    { "id": "navimow_0_s4rea2532k1983", "type": "mower", "name": "Navimow i105", "room": "garten",
      "states": { "state": "navimow.0.S4REA2532K1983.status.vehicleState", "battery": "navimow.0.S4REA2532K1983.status.battery",
                  "track": "navimow.0.S4REA2532K1983.mapTrack", "start": "navimow.0.S4REA2532K1983.remote.start", "…": "…" },
      "options": { "cutWidth": 18 } }
  ],
  "energy": { "enabled": true, "gridInvert": false, "batteryInvert": true,
              "states": { "production": "e3dc-rscp.0.EMS.POWER_PV", "consumption": "e3dc-rscp.0.EMS.POWER_HOME" } },
  "weather": { "enabled": true, "name": "Hamburg", "latitude": 53.5507, "longitude": 9.993, "radar": true, "windUnit": "kmh",
               "states": { "temperature": "mqtt.0.WeatherMan.temperatur", "humidity": "mqtt.0.WeatherMan.feuchte_rel" } },
  "scenes": [{ "id": "film", "name": "Filmabend", "icon": "clapperboard",
               "actions": [{ "state": "hue.0.Hue_Bridge.Wohnzimmer.on", "value": false }] }],
  "cameras": [{ "id": "1", "name": "Eingang", "popup": true, "motionState": null }],
  "alerts": [{ "id": "feuchte_bad", "name": "Luftfeuchte Bad", "enabled": true, "state": "hm-rpc.0.ABC.1.HUMIDITY",
               "op": ">", "value": 65, "hysteresis": 3, "delaySeconds": 300, "severity": "warning",
               "message": "Luftfeuchte im Bad bei {value} %", "view": "rooms", "room": "bad", "requireAck": false }],
  "layouts": { "lights": { "groupBy": "room", "groupOrder": ["wohnzimmer"], "deviceOrder": [], "hidden": [] },
               "climate": { "groupBy": "default", "groupOrder": [], "deviceOrder": [], "hidden": [] } },
  "waste": { "enabled": true, "url": "https://entsorger.example/abfuhrkalender/…/ics", "remindFrom": "17:00", "remindUntil": "10:00",
             "severity": "warning", "hidden": ["paper"] },
  "ventilation": { "enabled": true, "outdoor": { "temperature": "", "humidity": "" }, "rooms": [], "humidityMax": 60, "minDifference": 1,
                   "co2Max": 1000, "co2Warn": 1400, "cooling": false, "coolAbove": 25, "coolDifference": 3, "closeHints": true, "severity": "info" },
  "pushover": { "enabled": true, "user": "<User Key>", "token": "<API-Token>", "device": "", "sound": "", "appUrl": "https://homeapp.local:8080",
                "quietFrom": "22:00", "quietUntil": "07:00", "attachImage": true, "cameraFollowPopup": true, "printerProgressMinutes": 30,
                "events": { "alarm": { "enabled": true, "priority": 1 }, "printerDone": { "enabled": true, "priority": 0 }, "…": {} } },
  "kiosk": { "screenOff": true, "screenOffSeconds": 180, "autoBrightness": true, "minBrightness": 15, "maxBrightness": 100,
             "luxDark": 5, "luxBright": 400, "presenceMaxDistance": 0, "intervalSeconds": 10, "co2Altitude": 0, "temperatureOffset": 0 }
}
```

---

## API

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/api/health` | Health-Check |
| GET | `/api/bootstrap` | Konfiguration, aktuelle Werte, Status, Kameras, aktive Benachrichtigungen |
| GET | `/api/alerts` | Aktive Benachrichtigungen |
| POST | `/api/alerts/:id/ack`, `/api/alerts/ack` | Eine bzw. alle offenen Benachrichtigungen quittieren |
| POST | `/api/state` | Datenpunkt setzen `{ id, value }` |
| POST | `/api/scenes/:id/run` | Szene ausführen |
| GET | `/api/history?ids=a,b&hours=24` | Verlaufsdaten |
| GET/PUT | `/api/config` | Konfiguration lesen / speichern |
| PUT | `/api/dashboard` | Layout der eigenen Startseite speichern `{ widgets: [...] }` |
| GET | `/api/iobroker/search?q=` | Datenpunkt-Suche |
| GET | `/api/weather` | Internet-Vorhersage für den eingestellten Standort (gecacht) |
| GET | `/api/weather/geocode?q=` | Ortssuche (Name / Postleitzahl) |
| GET | `/api/weather/radar` | Bildindex des Regenradars |
| POST | `/api/discovery` | Automatische Erkennung |
| GET | `/api/cameras`, `/api/cameras/:id/snapshot`, `/api/cameras/:id/stream` | Kameras |
| GET | `/api/printer` | Zustand des 3D-Druckers (Druckauftrag, Fortschritt, Temperaturen) |
| GET | `/api/printer/temps` | Temperaturverlauf der letzten ~30 Minuten |
| GET | `/api/printer/snapshot`, `/api/printer/stream` | Webcam des Druckers (Standbild / MJPEG) |
| POST | `/api/printer/command` | Bambu Lab steuern: `{ action: 'pause' \| 'resume' \| 'stop' }`, `{ action: 'light', on }`, `{ action: 'speed', level: 1–4 }` |
| GET | `/api/spotify` | Spotify-Wiedergabe (Titel, Gerät, Position, Zufall, Wiederholen) |
| POST | `/api/spotify/command` | Steuern `{ action, … }`: `play` (optional `uris`, `contextUri`, `offsetUri`, `deviceId`), `pause`, `next`, `previous`, `seek` (`position` ms), `volume` (0–100), `shuffle` / `repeat` (`state`), `transfer` (`deviceId`), `queue` (`uri`) |
| GET | `/api/spotify/search?q=`, `/api/spotify/playlists`, `/api/spotify/devices`, `/api/spotify/queue`, `/api/spotify/recent` | Suche, eigene Playlists, Geräte, Warteschlange, zuletzt gehört |
| GET | `/api/spotify/login?origin=`, `/api/spotify/callback` | Anmeldung bei Spotify (PKCE) |
| POST | `/api/spotify/logout` | Spotify-Konto trennen |
| GET | `/api/waste` | Nächste Abholtermine und Abfallarten des Kalenders |
| POST | `/api/waste/refresh`, `/api/waste/preview` | Kalender neu laden / eine Adresse testen `{ url }` |
| GET | `/api/ventilation` | Lüftungsempfehlung je Raum und Außenwerte |
| GET | `/api/pushover` | Pushover: aktiv, zuletzt gesendet, letzter Fehler |
| POST | `/api/pushover/test` | Testnachricht mit den (ungespeicherten) Pushover-Einstellungen; leere Schlüssel = gespeicherte |
| GET | `/api/kiosk` | Kiosk-Agenten mit Status und letzten Werten |
| POST | `/api/kiosk/report?token=` | Meldung eines Kiosk-Agenten (ohne Anmeldung, Kiosk-Token); Antwort enthält die Agent-Einstellungen, das letzte Weck-Ereignis und ob die Radar-Seite offen ist |
| GET | `/api/kiosk/events?token=` | Server-Sent Events an die Kiosk-Agenten: Weck-Ereignisse und Anforderung des Live-Radars |
| POST | `/api/kiosk/radar?token=` | Live-Bild des Präsenzradars `{ id, radar }`, solange die Radar-Seite offen ist; Antwort `{ ok, live }` |
| ALL | `/api/webhook/motion/:cameraId?token=` | Bewegung melden (ohne Anmeldung, Token-geschützt) |
| WS | `/ws` | Live-Updates (`states`, `status`, `config`, `dashboard`, `motion`, `alerts`, `printer`, `printerPopup`, `spotify`, `waste`, `ventilation`, `radar`); der Browser meldet `{ t: 'radar', watch }`, solange er die Radar-Seite zeigt |

---

## Fehlersuche

| Symptom | Ursache / Lösung |
|---------|------------------|
| „Keine Berechtigung …“ | Der ioBroker-Benutzer ist keiner Gruppe zugeordnet (siehe [Berechtigungen](#verbindung-zu-iobroker)). |
| „Keine Schreibberechtigung für diesen Datenpunkt“ | Gruppenrechte sind nicht genug: die Datenpunkte haben eigene Rechte. *Einstellungen → Verbindungen & Zugriff → Schreibrechte prüfen* und das erzeugte Skript ausführen ([Anleitung](#keine-schreibberechtigung-für-diesen-datenpunkt-trotz-passender-gruppenrechte)). |
| „ioBroker nicht erreichbar“ | Host/Port prüfen, Protokoll (`ws` vs. `socket.io`) und HTTPS passend zum Adapter wählen. Ist ioBroker vom HomeApp-Container bzw. Server aus erreichbar? |
| „Anmeldung fehlgeschlagen“ | Benutzer/Passwort prüfen; Sonderzeichen im Passwort sind erlaubt. |
| Geräte zeigen „–“ | Datenpunkt-ID falsch oder keine Leseberechtigung. |
| Build bricht mit „npm error Exit handler never called!“ ab | Die generische Compose-Datei verwendet `Dockerfile.full` und führt `npm ci` im Build aus. Bei älteren Synology-Docker-Versionen ist das Legacy-`Dockerfile` eine Alternative: Dafür `server/node_modules/` und `client/dist/` vorab erstellen und mit hochladen. |
| „Kameras leer“ | Surveillance-Station-Verbindung unter *Einstellungen* prüfen; das Konto braucht das Recht „Live-Ansicht“ (bei 2FA siehe unten). |
| „DSM verlangt … 2-Faktor-Anmeldung … noch nicht eingerichtet“ (Code 406) | Für das Konto ist 2FA vorgeschrieben, aber noch nicht eingerichtet. In DSM unter *Persönlich → Konto* die 2-Faktor-Authentifizierung einrichten und danach den ersten Code in der App eintragen ([Anleitung](#konto-mit-2-faktor-anmeldung-2fa)) – oder die Pflicht in *Systemsteuerung → Sicherheit → Konto* aufheben. |
| „Das Konto benötigt einen 2-Faktor-Code“ (403) / „Code falsch oder abgelaufen“ (404) | Aktuellen Code in den Einstellungen eintragen und sofort speichern (Codes gelten ~30 s). Die App versucht fehlerhafte Anmeldungen nicht erneut, um DSMs Auto-Block nicht auszulösen – nach dem Speichern wird neu verbunden. |
| Livestream ruckelt / schwarz | Die App fällt automatisch auf Snapshots zurück. Ruckelt das Live-Video, liefert die Kamera selbst wenige Bilder pro Sekunde: in der Surveillance Station die Bildrate (FPS) des Stream-Profils erhöhen bzw. bei OctoPi die Bildrate in `/boot/octopi.txt` erhöhen (z. B. `camera_usb_options="-r 1280x720 -f 25"` bzw. `camera_raspi_options="-fps 25"`). Hinter einem Reverse Proxy darf der Stream nicht gepuffert werden (`proxy_buffering off;`). |
| Keine Bewegungs-Einblendung | Zeichnen die Kameras durchgehend auf, liefert die Station keine Bewegungsereignisse: Webhooks einrichten (siehe oben). Außerdem Sperrzeit pro Kamera und die Schalter unter *Einstellungen → Kameras & Einblendungen* prüfen. |
| Wetter zeigt „Standort festlegen“ oder „Wetterdaten nicht erreichbar“ | Standort unter *Einstellungen → Wetter* setzen. Meldung „nicht erreichbar“: der Container braucht Internetzugriff auf `api.open-meteo.com` (DNS / Firewall prüfen). Radar leer: der **Browser** braucht Zugriff auf `tilecache.rainviewer.com` und `server.arcgisonline.com`. |
| 3D-Drucker: „API-Key ungültig oder ohne Berechtigung“ | Key in OctoPrint unter *Einstellungen → Application Keys* prüfen bzw. neu erzeugen und in HomeApp eintragen; der Benutzer braucht das Recht „Status“. |
| 3D-Drucker: „nicht erreichbar“ / „Verbindung abgelehnt“ | Host und Port prüfen (OctoPi: 80, ohne Proxy: 5000) und ob der Drucker vom HomeApp-Container bzw. Server aus erreichbar ist. „HTTPS-Einstellung passt nicht zum Port“: Schalter *HTTPS verwenden* an den Port anpassen. |
| Bambu Lab: „Zugangscode abgelehnt“ | Zugangscode am Drucker (Netzwerk-Einstellungen) neu ablesen – er ändert sich beim erneuten Einschalten des LAN-Modus – und den **Entwicklermodus** einschalten. |
| Bambu Lab: „Verbunden, aber keine Daten vom Drucker“ | Seriennummer prüfen (Einstellungen → Gerät am Drucker). |
| Bambu Lab: kein Webcam-Bild | X1/H2/P2S: am Drucker „LAN-Liveview“ einschalten; „ffmpeg ist nicht installiert“ tritt nur ohne Docker-Image auf. Ist die Kamera schon von zu vielen Programmen geöffnet (Bambu Studio, Home Assistant …), go2rtc als gemeinsame Quelle nutzen und dessen MJPEG-Adresse eintragen. |
| 3D-Drucker: kein Webcam-Bild | Läuft die Webcam in OctoPrint? Sonst unter *Einstellungen → 3D-Drucker → Webcam* die Adresse des Standbilds von Hand eintragen (z. B. `http://192.168.1.20/webcam/?action=snapshot`). Der Benutzer des Keys braucht das Recht „Webcam“. |
| Spotify: „INVALID_CLIENT: Invalid redirect URI“ beim Verbinden | Die Redirect-URI im Developer-Dashboard muss **exakt** der Adresse entsprechen, die HomeApp unter *Einstellungen → Spotify* anzeigt (Protokoll, IP/Name und Port). Mit HTTP statt HTTPS lehnt Spotify sie ab. |
| Spotify: „Dieses Spotify-Konto ist für die App nicht freigegeben“ | Das Konto im Developer-Dashboard unter *User Management* eintragen (Entwicklungsmodus: höchstens 5 Konten). |
| Spotify: „Die Steuerung erfordert Spotify Premium“ | Steuern geht nur mit Premium; Anzeigen und Suchen funktionieren trotzdem. |
| Spotify: „Kein aktives Spotify-Gerät“ / Verstärker fehlt in der Liste | Den Verstärker einschalten und einmal in der Spotify-App als Gerät wählen – Spotify listet Connect-Geräte erst, wenn sie mit dem Konto verbunden sind. Der Name unter *Gerät* muss dem Namen in Spotify entsprechen. |
| Spotify: „Anmeldung abgelaufen“ | Die Freigabe wurde in Spotify widerrufen oder die Client-ID geändert: *Einstellungen → Spotify → Neu verbinden*. |
| Spotify: „Spotify nicht erreichbar: …“ nach der Rückkehr von Spotify (früher nur „fetch failed“) | Der **Server** erreicht `accounts.spotify.com` / `api.spotify.com` nicht. Details stehen im Container-Log (`[Spotify] …`). Test beim generischen Compose-Projekt: `docker compose -f docker-compose.generic.yml exec homeapp node -e "fetch('https://accounts.spotify.com').then(r => console.log('ok', r.status), e => console.log(e.cause ?? e))"`. DNS, Router und Firewall sowie bei Zertifikatsfehlern die Systemzeit und HTTPS-Inspektion prüfen. Das feste Netz `172.40.0.0/24` betrifft nur die Synology-Legacy-Compose-Dateien. |
| App hinter Reverse Proxy lädt, aber „Server“ ist rot | WebSocket wird nicht durchgereicht – Header `Upgrade`/`Connection` aktivieren. |
| Menü ist verschwunden | Es ist ausgeblendet: Knopf ☰ oben links (Handy: unten rechts) öffnet es; dauerhaft wieder anzeigen unter *Einstellungen → Anzeige & Bedienung*. |
| Wandtablet zeigt nach einem Update noch die alte Version | Die Seite lädt spätestens nach 5 Minuten selbst neu; sofort hilft „Neu laden“ im Browser bzw. Kiosk-Browser. |
