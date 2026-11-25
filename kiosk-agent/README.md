# HomeApp Kiosk-Agent (Raspberry Pi)

Kleiner Dienst für den Raspberry Pi eines Wanddisplays. Er

- erkennt mit dem Radar **HLK-LD2410** (auch B/C), ob jemand vor dem Display ist, auch wenn die Person ruhig steht oder sitzt,
- misst mit dem **BH1750** die Umgebungshelligkeit,
- misst mit dem **Sensirion SCD41** CO₂, Temperatur und Luftfeuchte,
- **schaltet das Display aus**, wenn eine einstellbare Zeit niemand da war, und wieder ein, sobald jemand kommt oder den Bildschirm berührt,
- schaltet und dimmt das Display **ohne Sensoren nach festen Zeiten** (Aus-Zeiten, Dimmzeiten),
- hält das Display in **„Immer an“-Zeiten** an und **schaltet es bei Kamera-Einblendungen und neuen Benachrichtigungen ein**, außer in **Ruhezeiten** (z. B. nachts),
- **regelt die Helligkeit** nach dem Umgebungslicht,
- liefert der **Radar-Seite** von HomeApp ein Live-Bild des LD2410, solange sie offen ist,
- meldet alle Werte an HomeApp. Dort erscheinen sie als Datenpunkte `homeapp.kiosk.<id>.presence`, `.lux`, `.co2`, `.temperature`, `.humidity` … für Geräte (Sensor-Kacheln), Benachrichtigungen, Verläufe und die Lüftungsempfehlung.

Alle Einstellungen (Ausschaltzeit, Zeitplan und Wecken, Helligkeitskurve, Reichweite, Höhe für die CO₂-Korrektur …) liegen in HomeApp unter **Einstellungen → Kiosk-Sensoren** und gelangen mit jeder Antwort auf eine Meldung zum Agenten. Jeder Sensor ist optional.

## Verkabelung

| Sensor | Pin am Sensor | Raspberry Pi (Pin) |
|---|---|---|
| LD2410 | VCC (5 V) | 5 V (Pin 2/4) |
| | GND | GND (Pin 6) |
| | TX | GPIO15 / RXD (Pin 10) |
| | RX | GPIO14 / TXD (Pin 8) |
| | OUT (optional) | z. B. GPIO17 (Pin 11), nur ohne UART nötig |
| BH1750 | VCC | 3,3 V (Pin 1) |
| | GND | GND (Pin 9) |
| | SDA / SCL | GPIO2 SDA (Pin 3) / GPIO3 SCL (Pin 5) |
| | ADDR | offen oder GND → Adresse 0x23 |
| SCD41 | VDD | 3,3 V (Pin 17) |
| | GND | GND (Pin 14) |
| | SDA / SCL | parallel zum BH1750 (Pin 3 / 5) |

Die UART-Pegel des LD2410 sind 3,3 V und passen direkt zum Pi; nur die Versorgung braucht 5 V.
Den SCD41 nicht direkt neben den Pi oder das Netzteil setzen, weil die Abwärme die Temperatur verfälscht. Eine Abweichung lässt sich in den Einstellungen per Temperatur-Korrektur ausgleichen.
Den Radar so ausrichten, dass er auf den Bereich vor dem Display zeigt. Er „sieht“ durch dünne Wände; das lässt sich mit der maximalen Entfernung begrenzen.

## Installation

```bash
# Ordner kiosk-agent/ auf den Pi kopieren, z. B.:
scp -r kiosk-agent pi@wanddisplay:~
ssh pi@wanddisplay
cd kiosk-agent && sudo ./install.sh
```

Das Skript erledigt Folgendes:

- Es aktiviert I²C und die serielle Schnittstelle und schaltet dabei die Login-Konsole auf UART ab.
- Es installiert `python3-serial`.
- Es nimmt den Benutzer in die Gruppen `i2c`, `dialout`, `gpio`, `input` und `video` auf.
- Es fragt nach der **Melde-Adresse**. Diese steht in HomeApp unter Einstellungen → Kiosk-Sensoren und enthält den geheimen Schlüssel.
- Es richtet den systemd-Dienst `homeapp-kiosk.service` ein. Der Dienst läuft als dieser Benutzer und startet beim Booten. Fällt er aus, startet systemd ihn nach 5 s neu. Belegt der Agent fast alle erlaubten Dateideskriptoren (ein Leck), beendet er sich selbst, damit systemd ihn neu startet und das Display weiter geschaltet wird.
- Es startet den Dienst und prüft, dass er läuft. Andernfalls zeigt es die letzten Log-Zeilen und endet mit Fehler.

Der Benutzer lässt sich angeben: `sudo ./install.sh kiosk`. Ein erneuter Aufruf aktualisiert Programm und Dienst; `/etc/homeapp-kiosk.json` bleibt erhalten. Zum Entfernen: `sudo ./install.sh --uninstall`. Die Konfiguration bleibt dabei liegen.

Wurden I²C oder UART eben erst aktiviert, den Pi einmal neu starten.

```bash
systemctl status homeapp-kiosk
sudo systemctl restart homeapp-kiosk     # nach Änderungen an /etc/homeapp-kiosk.json
sudo systemctl stop homeapp-kiosk        # vor manuellen Tests: Sensoren nicht parallel öffnen
python3 /opt/homeapp-kiosk/homeapp_kiosk.py --config /etc/homeapp-kiosk.json --once          # Sensoren lesen
python3 /opt/homeapp-kiosk/homeapp_kiosk.py --config /etc/homeapp-kiosk.json --test-display  # Display 5 s aus
sudo systemctl start homeapp-kiosk       # nach den manuellen Tests
journalctl -u homeapp-kiosk -f
i2cdetect -y 1          # BH1750 = 23, SCD41 = 62
```

`--once` wartet etwa sieben Sekunden, damit der SCD41 seinen ersten Messwert liefern kann (Messintervall fünf Sekunden). Im Dienst gilt ein noch nicht bereiter SCD41 während der ersten 30 Sekunden nicht als Sensorfehler; danach werden fehlende oder veraltete Messwerte als Fehler gemeldet.

Bleibt beim LD2410 die Meldung „keine Daten“, zuerst ohne parallel laufenden Dienst erneut testen. Danach TX/RX wie oben gekreuzt, gemeinsame Masse, die aktivierte UART-Schnittstelle ohne serielle Login-Konsole sowie `ld2410.port` (Standard `/dev/serial0`) und `ld2410.baudrate` (Standard `256000`) prüfen. „ld2410 bereit“ bestätigt nur das Öffnen der Schnittstelle, noch keinen empfangenen Radar-Frame.

## Display-Steuerung

`display.method` in `/etc/homeapp-kiosk.json`:

| Methode | Wofür | Aus/An | Helligkeit |
|---|---|---|---|
| `auto` | wählt das Erste, das passt: eigene Befehle → `backlight` → `wlr-randr` → `xset` → `ddcutil` | | |
| `backlight` | offizielles Raspberry-Pi-Touchdisplay (DSI) und andere Panels mit `/sys/class/backlight` | ✔ | ✔ |
| `wlr-randr` | HDMI-Bildschirm unter Raspberry Pi OS Bookworm (Wayland: labwc/Wayfire) | ✔ | – |
| `xset` | HDMI-Bildschirm mit X11 (ältere Systeme) | ✔ | – |
| `ddcutil` | HDMI-Monitor mit DDC/CI (`sudo apt install ddcutil`, Benutzer in Gruppe `i2c`) | ✔ | ✔ |
| `command` | eigene Befehle `on_command`, `off_command`, `brightness_command` (mit `{brightness}` = 0–100) | ✔ | ✔ |
| `none` | nur messen und melden | – | – |

## Zeitplan und Wecken

In HomeApp unter *Einstellungen → Kiosk-Sensoren → Zeitplan und Wecken* (wirkt nur, wenn das Display bei Abwesenheit ausgeht):

- **Immer an:** In diesen Zeiträumen bleibt das Display auch ohne Präsenz an.
- **Wecken:** Kamera-Einblendungen (nur, wenn die Einblendung laut *Kameras & Einblendungen* erscheint) und neue Benachrichtigungen, optional erst ab Warnung oder Alarm, schalten das Display ein. Ohne Präsenz geht es nach der eingestellten Zeit (Standard 120 s) wieder aus.
- **Ruhezeiten:** In diesen Zeiträumen (Standard 22–6 Uhr) wecken Einblendungen und Benachrichtigungen das Display nicht. Präsenz und Berührung wirken weiterhin, „Immer an“ hat Vorrang.

**Ohne Sensoren** (*Feste Zeiten ohne Sensoren*):

- **Aus-Zeiten:** Liefert kein Präsenzradar Werte (nicht angeschlossen, abgeschaltet mit `"ld2410": {"enabled": false}` oder ausgefallen) oder ist das Ausschalten bei Abwesenheit aus, geht das Display in diesen Zeiträumen aus. Beim Beginn einer Aus-Zeit und nach einer Berührung bleibt es noch die Ausschaltzeit lang an. „Immer an“ und das Wecken wirken wie mit Radar.
- **Dimmzeiten:** Liefert kein Lichtsensor Werte oder ist die automatische Helligkeit aus, gilt in diesen Zeiträumen die gedimmte, sonst die helle Helligkeit (beide in den Einstellungen wählbar, ab Agent 1.2.0; ältere Agenten nutzen minimale und maximale Helligkeit). Das geht nur mit Methoden, die die Helligkeit einstellen können (`backlight`, `ddcutil`, `command` mit `brightness_command`). Sonst hilft die Nachtabdunkelung der App unter *Anzeige*.

Alle Zeiten gelten in der **Ortszeit des Pi** (`timedatectl` zeigt sie, `sudo raspi-config` → Localisation stellt sie ein). Ein Zeitraum darf über Mitternacht gehen; „von = bis“ bedeutet ganztägig.

Der Agent hält dazu eine Verbindung zu `GET /api/kiosk/events?token=…` (Server-Sent Events) offen und erfährt Weck-Ereignisse so sofort. Bricht sie ab (z. B. weil ein Reverse Proxy puffert), kommt das letzte Ereignis mit der nächsten Meldung, also spätestens nach dem Meldeintervall. Bei nginx sollte `proxy_buffering off;` für diesen Pfad gesetzt sein; HomeApp sendet zusätzlich `X-Accel-Buffering: no`.

Bei Sensorfehlern bleibt das Display an; das Verhalten ist also fail-safe. Eine Berührung des Bildschirms (oder Maus/Tastatur) weckt es sofort.

Bei der Methode `backlight` ist nur die Beleuchtung aus, der Touchscreen bleibt aktiv. Die erste Berührung kann deshalb schon in der App landen. In der Praxis hat der Radar das Display meist schon eingeschaltet, bevor man den Bildschirm erreicht.

Zusätzlich kann HomeApp im Browser auf den Sensor reagieren: Einstellungen → Anzeige & Bedienung → **Präsenz- und Lichtsensor**. Dort lässt sich einstellen, dass Präsenz den Bildschirmschoner weckt, dass der Bildschirmschoner bei Abwesenheit startet und dass das Bild bei Dunkelheit gedimmt wird. Das ist nützlich, wenn der Bildschirm selbst nicht schaltbar ist.

## Radar-Seite (Live-Ansicht)

Öffnet jemand in HomeApp die Seite **Radar**, fordert der Server über den Ereignis-Stream Live-Bilder an (ersatzweise mit der nächsten Antwort auf eine Meldung). Der Agent (ab 1.3.0) schickt dann etwa viermal pro Sekunde Abstand und Energie beider Ziele an `POST /api/kiosk/radar?token=…`. Die Verbindung bleibt dabei offen, damit nicht jedes Bild einen neuen TLS-Aufbau kostet. Jede Antwort sagt, ob noch jemand zusieht. Schließt der letzte Browser die Seite, hört der Agent sofort auf; ohne Antwort spätestens nach 10 s.

Für die Energie je Entfernungstor schaltet der Agent den LD2410 während der Live-Ansicht per UART in den **Engineering-Modus** und danach wieder zurück. Die Präsenzerkennung und das Schalten des Displays laufen dabei unverändert weiter. Mit dem OUT-Pin allein zeigt die Seite nur Präsenz ohne Entfernung.

Die Tore sind ab Werk 0,75 m breit. Wer den Radar mit dem HLKRadarTool auf 0,2 m umgestellt hat, trägt das in `/etc/homeapp-kiosk.json` ein:

```json
"ld2410": { "gate_cm": 20 }
```

## Entwicklung

```bash
python3 -m unittest discover -s tests
```
