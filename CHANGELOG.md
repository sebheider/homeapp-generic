# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Das Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung an [SemVer](https://semver.org/lang/de/).

## [2.7.1] – 2026-11-26

Kioskmodus: Eiskristalle der Temperatur werden nicht mehr abgeschnitten.

### Behoben
- Im Kioskmodus wurden die Eiskristalle der Temperatur unter 0 °C am oberen Rand des Panels abgeschnitten; dort liegen sie jetzt enger an den Ziffern.

## [2.7.0] – 2026-11-25

Module: integrierte Funktionen abschalten, externe Module installieren – und Home Assistant als Datenquelle.

### Hinzugefügt
- **Externe Module** unter *Einstellungen → Module*: Erweiterungen (z. B. Pool, Wallbox, Bewässerung) werden als ZIP-Paket oder einzelne `module.json` hochgeladen, geprüft und installiert – ohne Änderung am Quellcode. Ein Modul bringt eine **eigene Seite** in der Navigation und/oder ein **Widget** für die eigene Startseite mit, entweder als fertige Kacheln der App (Wert, Schalter, Schieberegler, Taster, Text) oder als eigene HTML-Seite in einer Sandbox, die über das Modul-SDK (`/module-sdk.js`) mit der App spricht.
- Module folgen dem **Modul-Schema Version 1** (`docs/module.schema.json`, Anleitung in `docs/MODULES.md`, Beispiele unter `examples/modules/`). Fehlerhafte Pakete werden mit dem betroffenen Feld abgelehnt; ein misslungenes Update lässt die installierte Version unverändert.
- Datenpunkte legt nicht das Modul fest: Es meldet Plätze an, die du in den Einstellungen deinen ioBroker-States oder Home-Assistant-Entities zuordnest. Ein Modul sieht nur diese Werte und schreibt nur Plätze, die es ausdrücklich als schreibend anmeldet.
- **Integrierte Module** (Wetter, 3D-Drucker, Spotify, Mähroboter) lassen sich abschalten: Seite, Widgets und Schnittstellen sind dann aus, die Einstellungen bleiben erhalten.
- **Home Assistant als Datenquelle** neben ioBroker (*Einstellungen → Verbindungen & Zugriff*): Verbindung über die WebSocket-API mit langlebigem Zugriffstoken, Live-Werte, Datenpunktsuche und automatische Erkennung von Lichtern, Schaltern, Rollläden, Thermostaten, Sensoren und Szenen. Variablen `HOMEASSISTANT_URL`, `HOMEASSISTANT_TOKEN`, `HOMEASSISTANT_VERIFY_SSL`.
- Neue Variable `MODULES_DIR` für einen anderen Ordner der externen Module (Standard `data/modules`).

### Geändert
- **`docker compose up -d --build` funktioniert direkt aus dem Repository:** Das `Dockerfile` installiert die npm-Pakete und baut das Frontend im Container (bisher `Dockerfile.full`); vorher muss nichts mehr erstellt werden – auch nicht für den Synology Container Manager. Die bisherige Variante ohne npm im Container heißt jetzt `Dockerfile.prebuilt` und ist nur noch für ältere Docker-Versionen gedacht, bei denen `npm ci` mit „Exit handler never called!“ abbricht.
- Der (leere) Ordner `data/` ist im Repository enthalten, weil der Synology Container Manager den Datenordner nicht selbst anlegt. `HOMEAPP_PORT` in der `.env` gilt jetzt für alle Compose-Dateien. README und Compose-Dateien beschreiben, welche Werte (Port, Containername, Netzwerk, Image, Projektordner) bei mehreren Installationen auf einem Host anzupassen sind.
- Der Mond im Wettersymbol ist rund 20 % größer und sitzt etwas höher; auf der Wetterseite ist das Wettersymbol deutlich größer (160 statt 112 Pixel, auf Handys 124 Pixel).
- **Übersicht:** Das Wetter ist an die Uhr angeglichen – gleiche Höhe, Temperatur so groß wie die Uhrzeit, darunter wie bei der Uhr eine ruhige Zeile „Außen“, die Wetterlage und die Details. Das Wettersymbol ist größer (112 statt 88 Pixel, im Kioskmodus 128 statt 112) und steht rechts neben der Temperatur, etwas nach unten in Richtung der Zeile „Außen“ versetzt; der Wetterblock ist dafür vom rechten Rand eingerückt.
- **Temperatur mit Effekt (Übersicht):** Verlauf von Weiß in eine Farbe passend zur Temperatur (Eisblau bei 0 °C über Cyan, Grün und Gelb bis Orange bei 30 °C); unter 0 °C eisblau mit funkelnden Eiskristallen, ab 30 °C rot mit aufsteigender heißer Luft und Hitzeflimmern (echtes Flimmern nur mit Animationsstufe „Hoch“, sonst ohne Bewegung).
- **Warnungen und Alarme sind auf der Übersicht deutlich auffälliger:** leuchtender Rahmen und pulsierende Fläche in Orange bzw. Rot über dem oberen Panel (bei Alarm schneller und mit Warnstreifen), Warndreieck bzw. Sirene mit Schockwellen im Home Core und ein pulsierender Chip mit dem Namen der Meldung neben der Uhr; ebenso im Widget „Hausstatus“. Mit der Animationsstufe „Niedrig“ bleibt die Färbung ohne Bewegung.

### Sicherheit
- Ändernde API-Anfragen und WebSocket-Verbindungen von abgeschotteten Seiten (`Origin: null`) und fremden Websites (`Sec-Fetch-Site: cross-site`) werden abgelehnt.
- Der Service Worker speichert keine Seiten mehr, die in Frames angezeigt werden.

## [2.6.0] – 2026-11-25

Wetter: Der Mond im Wettersymbol sieht aus wie gerade draußen am Himmel.

### Hinzugefügt
- **Echter Mond im nächtlichen Wettersymbol** (klar, teils bewölkt, Schauer): ein Mondbild der NASA (Scientific Visualization Studio, gemeinfrei) mit der aktuellen **Mondphase**. Beleuchteter Teil, **Schattenseite** (weicher Übergang, schwacher Erdschein) und **Neigung** werden aus Uhrzeit und Standort (*Einstellungen → Wetter*) berechnet – so, wie der Mond dort gerade steht, auf der Südhalbkugel also „kopfüber“. Die Berechnung stimmt auf etwa 1° bzw. 0,5 Prozentpunkte mit JPL Horizons überein und wird jede Minute aktualisiert; ohne Standort zeigt Himmelsnord nach oben.

### Geändert
- Der Mond im Wettersymbol ist halb so groß, die beiden Sterne daneben funkeln jetzt als Sterne mit Strahlen und Glow.

## [2.5.0] – 2026-11-15

Pushover: regelmäßige Statusupdates vom 3D-Drucker.

### Hinzugefügt
- **Einstellungen → Pushover → 3D-Drucker: „Statusupdates während des Drucks“** (standardmäßig aus, Priorität wählbar): Solange gedruckt wird, kommt in einstellbarem Abstand (10 Minuten bis 4 Stunden, Standard 30 Minuten) eine Nachricht mit Fortschritt, Laufzeit, Schicht (Bambu Lab), Restzeit, voraussichtlichem Ende und aktuellem **Webcam-Foto**. Das erste Update kommt ein Intervall nach Druckbeginn; während einer Pause oder ohne Verbindung zum Drucker wird keines gesendet.

## [2.4.0] – 2026-11-15

Pushover: Push-Nachrichten aufs Handy.

### Hinzugefügt
- **Einstellungen → Pushover (Handy):** User Key und API-Token der eigenen Pushover-Anwendung (write-only, bleiben auf dem Server), Testnachricht, Geräte, Ton und Adresse der App für einen Link zur passenden Seite.
- **Je Ereignis an/aus und Priorität** (Leise, Normal, Hoch, Notfall): eigene Benachrichtigungen nach Art (Alarm, Warnung, Hinweis) samt optionaler Entwarnung, Müllabfuhr, Lüftung, 3D-Drucker (fertig, Fehler, abgebrochen, pausiert – z. B. Filament leer) und Kameras (Person, Bewegung; wahlweise nur, wenn das Pop-up erscheinen würde). Kamera- und Druckermeldungen mit aktuellem Bild.
- **Ruhezeit:** normale und leise Nachrichten kommen nachts ohne Ton an, *Hoch* und *Notfall* klingeln weiter.
- Unter *Benachrichtigungen* lässt sich jede Regel mit „Per Pushover aufs Handy senden“ einzeln ausnehmen.
- Gesendet wird nur Neues (nicht in der ersten Minute nach Start oder Speichern), höchstens 30 Nachrichten in 10 Minuten, im Demo-Modus nur die Testnachricht.

## [2.3.0] – 2026-11-15

3D-Drucker: Bambu-Lab-Drucker direkt über die lokale Schnittstelle (LAN- und Entwicklermodus).

### Hinzugefügt
- **Bambu Lab als Druckertyp** neben OctoPrint: Unter *Einstellungen → 3D-Drucker* wählt „Druckertyp“ zwischen OctoPrint und Bambu Lab; für Bambu Lab genügen IP-Adresse, Seriennummer und Zugangscode (write-only, bleibt auf dem Server). HomeApp verbindet sich per MQTT über TLS direkt mit dem Drucker – ohne Cloud.
- **Druckerseite für Bambu Lab:** Fortschritt, Restzeit, Fertigstellungszeit und Temperaturen (Düse, Bett, Kammer) mit Verlauf wie bei OctoPrint, dazu aktuelle Schicht, Druckschritt, Geschwindigkeitsstufe, Lüfter, Kammerlicht, **AMS** (Luftfeuchte, Temperatur, Spulen mit Farbe, Material, Restmenge und aktiver Spule, externe Spule), **HMS-Meldungen** mit Link ins Bambu-Wiki und Details (Modell, Firmware, Seriennummer, Düse, WLAN, Speicherkarte, Zeitraffer).
- **Steuerung** (abschaltbar): Pausieren, Fortsetzen, Abbrechen (mit Bestätigung), Geschwindigkeit (Leise/Standard/Sport/Ludicrous) und Licht.
- **Kamera:** Einzelbilder von A1/P1 (Port 6000), RTSP-Video von X1/X2D/H2/P2S (über ffmpeg, jetzt in den Docker-Images enthalten) oder eine eigene MJPEG-Adresse (z. B. go2rtc); Live-Bild, Übersicht und Webcam-Einblendungen funktionieren wie bei OctoPrint. Die Kamera wird nur geöffnet, solange jemand zusieht.
- **Zwei Düsen (X2D, H2D):** beide Düsentemperaturen, welche Düse aktiv ist und welche Spule (AMS oder externe Spule links/rechts) sie versorgt, Düsentyp und -durchmesser je Düse; beim X2D zusätzlich der rechte Hilfslüfter und die Lüfternamen wie am Druckerdisplay. Bei der H2-Serie schaltet „Licht“ beide Kammerleuchten.
- Übersichts-Panel und Kiosk-Leiste zeigen bei Bambu Lab zusätzlich Schicht und Druckschritt.
- **Demo-Modus:** Mit Druckertyp Bambu Lab erscheint ein simulierter „Bambu Lab P1S (Demo)“ mit AMS, Lüftern, Licht und Geschwindigkeit.

## [2.2.0] – 2026-11-05

Mähroboter: Segway Navimow über den ioBroker-Adapter `navimow`, aufgeräumte Standard-Übersicht.

### Hinzugefügt
- **Seite „Mähroboter“** (erscheint, sobald ein Mähroboter eingerichtet ist): Live-Karte der aktuellen Mähsitzung mit gemähten Bahnen, zuletzt gefahrener Strecke, Startpunkt, Ladestation und dem Mäher samt Fahrtrichtung; die Karte folgt dem Mäher auch zwischen zwei Spur-Updates des Adapters und lässt sich groß öffnen. Dazu Fortschritt, Akku (mit Ladeanzeige), gemähte Fläche der Sitzung und der Woche sowie Details (Modell, Firmware, letzte Meldungen, Position, Cloud-Verbindung).
- **Steuerung:** Start, Pause, Fortsetzen und Zur Station – die zum Zustand passenden Knöpfe sind hervorgehoben, alle bleiben bedienbar, weil die Cloud den Zustand verzögert meldet. Auf schmaleren Bildschirmen (z. B. Wanddisplay hochkant, 1200 × 1920 bei Pixelverhältnis 2) stehen Zustand und Steuerung nebeneinander, damit die Karte ohne Scrollen sichtbar ist. Unter „Wartung“: Status abrufen, Karte zurücksetzen und Ladestation neu bestimmen (mit Rückfrage). Hinweis über der Seite, wenn die Cloud-Verbindung fehlt oder der Mäher angehoben ist bzw. einen Fehler meldet.
- **Gerätetyp „Mähroboter“** mit Karte unter *Räume* (Zustand, Akku, Fortschritt, passender Befehl; ein Tipp öffnet die Seite) und Optionen für Schnittbreite und Drehung der Karte. Im Geräte-Editor trägt **„Aus navimow übernehmen“** alle Datenpunkte des Adapters ein; *Automatisch erkennen* findet Navimow-Mäher ebenfalls.
- Die Knöpfe des Mähers sind Teil von *Schreibrechte prüfen*; Benachrichtigungen können auf die Seite „Mähroboter“ springen.
- **Demo-Modus:** ein simulierter Mäher mäht in Bahnen, fährt zum Laden zurück und reagiert auf alle Knöpfe.
- **Übersicht (Standard): Mähroboter statt Energiefluss**, solange er mäht – Live-Karte mit Fortschritt, Akku und gemähter Fläche; ein Tipp öffnet die Mähroboter-Seite. Danach erscheint wieder der Energiefluss.
- **Übersicht (Standard): UV-Index im Wetter** neben Sonnenauf- und -untergang, mit kleiner Prognose als Balken für die kommenden Sonnenstunden (nach Sonnenuntergang für morgen) und dem Tageshöchstwert – ohne dass der Kopfbereich höher oder breiter wird. Wo der Platz fehlt (Kiosk im Hochformat), entfällt zuerst der Höchstwert, dann rückt der UV-Index neben die Überschrift „Außen“.

### Geändert
- **Übersicht (Standard):** nur noch die Rundinstrumente **Batterie, Licht und Wärmepumpe**; Solar, Autarkie und Raumklima entfallen (als Widgets der eigenen Startseite bleiben sie verfügbar). Die drei teilen sich den Platz gleichmäßig in einer Reihe und werden dadurch größer; im Kiosk-Hochformat bleibt ihre Reihe flacher, damit Energiefluss bzw. Mähroboter und Sicherheit mehr Höhe bekommen.

## [2.1.0] – 2026-11-04

Digitaler Zwilling (Design „Nexus“) für Wandtablets im Hochformat (10″, 1200 × 1980) neu aufgeteilt.

### Hinzugefügt
- **Datenströme im Zwilling:** Ändert sich ein angezeigter Wert, leuchtet der Raum kurz auf, ein Lichtpuls läuft über die Verbindungslinie zum Wert und dieser aktualisiert sich mit einem kurzen Glühen. Nur echte Wertänderungen lösen einen Puls aus, Nebenangaben (z. B. aktuelle Leistung) aktualisieren sich still. Bei Effektstufe *Niedrig* entfällt die Animation.
- **CO₂-Ampel und UV-Index** im Wetterbereich: CO₂ vom Sensor dieses Wanddisplays (sonst eines anderen Kiosk-Agenten oder des Raums mit dem höchsten Wert) mit den Schwellwerten aus den Lüftungs-Benachrichtigungen; UV-Index mit Einstufung und Tageshöchstwert.
- **Kameras nach Bewegung:** Nach einer Bewegungs- oder Personenmeldung bleibt die Kamera nach dem Popup noch 3 Minuten im Bereich „Sicherheit“ sichtbar (höchstens zwei), zusammen mit offenen Türen und Fenstern. Ohne Ereignis entfällt der Bereich.

### Geändert
- **Nexus im Hochformat-Kiosk:** Der Zwilling sitzt groß in einem eigenen Rahmen über die volle Breite, die Werte stehen als Karten in einer Spalte rechts daneben statt über anderen Infos zu schweben. Darunter folgen Licht, Szenen und nur bei Bedarf Sicherheit, 3D-Druck (während eines Drucks) und Musik (während der Wiedergabe), automatisch auf zwei Spalten verteilt.
- **Hinweise** haben im Hochformat-Kiosk keinen eigenen Bereich mehr; sie sind über die Glocke oben erreichbar (aktive Banner bleiben sichtbar). Das separate Wandpanel (Kiosk-Sensoren) entfällt dort, seine CO₂-Anzeige steckt in der Ampel.

## [2.0.0] – 2026-11-03

Überarbeitung von Bedienung und Optik mit Schwerpunkt auf Touch und Wandtablets im Hochformat (10″, 1200 × 1920).

### Hinzugefügt
- **Menüleiste unten im Hochformat:** Steht der Bildschirm hochkant (Tablet oder Kiosk), sitzt das Menü als Leiste unten in Daumenhöhe statt als Seitenleiste – *Voll* mit Namen, *Klein* nur mit Symbolen, oder ausgeblendet. Die Inhalte nutzen dadurch die volle Breite.
- **Kopfleiste im Hochformat:** aktuelle Seite mit großen, antippbaren Seitenpunkten, dazu ☰, Glocke, helles/dunkles Design und Einstellungen an einem festen Platz.
- **Seitenübersicht (☰):** alle Seiten als große Kacheln in einem Blatt von unten, dazu Einstellungen, Farbschema, Wahl der Menüleiste und Verbindungsstatus. Schließen per Wischen nach unten, ✕, Escape oder Tippen daneben.
- **Bereichswahl der Einstellungen als Kachel-Übersicht:** Auf Tablets, im Kiosk und am Handy öffnet ein großer Knopf alle Bereiche gruppiert, mit Symbolen und Suche, statt einer kleinen Auswahlliste. Am Desktop tragen die Reiter ebenfalls Symbole.

### Geändert
- **Handy:** Die Leiste unten zeigt vier Seiten mit gut lesbaren Namen, **„Mehr“** öffnet die übrigen in der Seitenübersicht. Bei ausgeblendetem Menü öffnet ein runder Knopf unten rechts dieselbe Übersicht.
- **Einheitliche Symbolknöpfe:** Alle reinen Symbolknöpfe (Schließen, Löschen, Bearbeiten, Plus/Minus am Thermostat, Zoom usw.) sind mindestens 44 × 44 Pixel groß (im Kiosk mitskaliert) und überall gleich gestaltet.
- **Räume im Blick (Kiosk-Übersicht):** statt eines Punkts je Lampe ein einzelner leuchtender Hinweis; die Leisten rasten beim Wischen sauber an einer Kachel ein.
- **Räume:** Die Raumauswahl bricht auf Tablets und Desktop um, statt seitlich zu scrollen.
- **Demo-Hinweis** lässt sich für die Sitzung schließen und passt sich dem hellen Design an; Meldungen (Toasts) erscheinen oberhalb der Menüleiste.
- **Code:** Navigation (Seitenleiste, Leisten, Seitenübersicht) in eine eigene Datei ausgelagert; die Wahl der Menüform ist getestet.

### Behoben
- **Rundinstrumente in flachen Kiosk-Panels:** Beschriftungen laufen nicht mehr über den Rand, sondern werden gekürzt.
- Beim Seitenwechsel über die Adresse (Zurück-Taste) schließt sich ein offenes Menü.

## [1.31.1] – 2026-11-03

### Geändert
- **CO₂-Ampel nutzt die Schwellen der Lüftungsempfehlung:** Gelb ab *CO₂ ab* (Standard 1.000 ppm), Rot ab *CO₂ dringend ab* (Standard 1.400 ppm) statt fest 1.000/2.000 ppm. Die Legende zeigt die eingestellten Werte; auch der CO₂-Tipp der Nexus-Übersicht folgt *CO₂ ab*.

### Behoben
- **Datenpunkt-Suche in den Einstellungen:** Die Trefferliste öffnet sich wieder über den folgenden Karten statt dahinter (z. B. bei *Lüftung → Außenluft*).
- **Kein Banner bei hohem CO₂ der Wanddisplays:** Der CO₂-Sensor eines Kiosk-Agenten floss nur in die Lüftungsempfehlung ein, wenn sein Datenpunkt von Hand als Sensor-Gerät einem Raum zugeordnet war. Bei aktivierter Lüftungsempfehlung nehmen Wanddisplays mit CO₂-Sensor jetzt automatisch teil: ab *CO₂ ab* erscheint ein Lüften-Hinweis, ab *CO₂ dringend ab* eine Warnung mit Banner. Offline-Agenten lösen nichts aus.

## [1.31.0] – 2026-11-03

### Hinzugefügt
- **Kiosk-Sensorwerte auf den Dashboards:** CO₂, Temperatur, Luftfeuchte, Helligkeit und Präsenz je Wanddisplay automatisch auf der Standard- und Nexus-Übersicht sowie als Widget **Kiosk-Sensoren** auf der eigenen Startseite.
- **CO₂-Ampel in der Radar-Ansicht:** großer ppm-Wert mit Text und Grün unter 1.000 ppm, Gelb ab 1.000 ppm und Rot ab 2.000 ppm. Fehlende Werte und Offline-Agenten erhalten keine gesunde Bewertung.

### Behoben
- **SCD41-Anlaufphase:** Ein noch nicht bereiter CO₂-Sensor wird nicht mehr unmittelbar nach dem Messstart geschlossen und für 60 Sekunden gesperrt. Der Einmal-Test kann damit den ersten Messwert nach etwa fünf Sekunden ausgeben. Manuelle Sensortests sind ohne parallel laufenden Dienst dokumentiert.

## [1.30.0] – 2026-11-03

### Hinzugefügt
- **Radar-Seite für den Präsenzradar LD2410** (Menüpunkt *Radar*, erscheint, sobald ein Wanddisplay einen Radar meldet; Live-Ansicht ab Kiosk-Agent 1.3.0):
  - Sichtbereich des Radars (±60°) mit Entfernungsringen und Sweep. Bewegung (grün) und ruhende Person (violett) erscheinen als Bogen in ihrem Abstand, dicker bei stärkerem Signal, mit kurzem Nachleuchten. Der LD2410 misst nur die Entfernung, nicht die Richtung.
  - Energie je Entfernungstor als Ringe und Balkendiagramm, dazu die maximale Entfernung aus den Kiosk-Einstellungen als gestrichelte Grenze. Das hilft beim Ausrichten des Radars.
  - Solange die Seite offen und sichtbar ist, sendet der Agent etwa viermal pro Sekunde ein Live-Bild (`POST /api/kiosk/radar`) und schaltet den Radar dafür in den Engineering-Modus, danach wieder zurück. Ältere Agenten zeigen ihre regelmäßigen Meldungen.
  - Im Demo-Modus läuft ein simulierter Besucher über das Radar.

### Behoben
- **Kiosk-Agent 1.2.1: Display blieb nach einigen Stunden dunkel.** Fehlte ein I²C-Sensor (BH1750, SCD41), verlor der Agent bei jedem minütlichen Neuversuch einen Dateideskriptor. Nach etwa 8 Stunden konnte er weder melden noch das Display schalten („Too many open files“). Der Agent schließt den Bus jetzt bei jedem fehlgeschlagenen Start und startet sich zur Sicherheit selbst neu, wenn fast alle Dateideskriptoren belegt sind. Zum Übernehmen `sudo ./install.sh` erneut ausführen.

## [1.29.1] – 2026-11-02

### Geändert
- **Energiefluss auf der Übersicht:** Die Knoten nutzen die Fläche des Panels besser – Solar oben, das Haus in der Mitte, Netz und Batterie in den unteren Ecken (die Wallbox darunter). Kreise und Beschriftungen wachsen mit der Breite des Diagramms, sodass keine leeren Streifen mehr bleiben; neben Solar steht der Tagesertrag. Im Kiosk stehen die Kennzahlen bei breiten, flachen Panels neben dem Diagramm, das dadurch größer wird. Die Größe der Panels bleibt unverändert.

## [1.29.0] – 2026-11-02

### Hinzugefügt
- **Wanddisplay: Helligkeit der Dimmzeiten einstellbar** (*Einstellungen → Kiosk-Sensoren → Feste Zeiten ohne Sensoren → Gedimmt*, Kiosk-Agent ab 1.2.0): Neben den Dimmzeiten lassen sich jetzt die **gedimmte Helligkeit** (in den Dimmzeiten) und die **helle Helligkeit** (außerhalb) getrennt von der minimalen und maximalen Helligkeit des Lichtsensors einstellen. Bestehende Installationen übernehmen beim Update die bisherigen Werte (minimale bzw. maximale Helligkeit); ältere Agenten nutzen weiter diese.

## [1.28.0] – 2026-11-02

### Hinzugefügt
- **Wanddisplay: Zeitplan und Wecken** (*Einstellungen → Kiosk-Sensoren → Zeitplan und Wecken*, Kiosk-Agent ab 1.1.0):
  - **Immer an:** Zeiträume je Wochentag, in denen das Display auch ohne Präsenz an bleibt, z. B. werktags 6:30–8:00.
  - **Wecken:** Kamera-Einblendungen und neue Benachrichtigungen (Glocke, Müllabfuhr, Lüften, 3D-Druck beendet) schalten das Display ein; danach bleibt es eine einstellbare Zeit an. Benachrichtigungen lassen sich auf Warnungen oder Alarme beschränken.
  - **Ruhezeiten:** In diesen Zeiträumen (Standard 22–6 Uhr) wecken Einblendungen und Benachrichtigungen das Display nicht; Präsenz und Berührung wirken weiterhin.
  - Der Server meldet Weck-Ereignisse sofort über `GET /api/kiosk/events` (Server-Sent Events) und wiederholt das letzte mit jeder Antwort an den Agenten. Zeitpläne gelten in der Ortszeit des Pi.
  - **Feste Zeiten ohne Sensoren** (*Kiosk-Sensoren → Feste Zeiten ohne Sensoren*): Liefert kein Präsenzradar Werte, geht das Display in festen **Aus-Zeiten** aus (eine Berührung, „Immer an“ und das Wecken schalten es ein). Ohne Lichtsensor gilt in festen **Dimmzeiten** die minimale, sonst die maximale Helligkeit. Beides greift auch, wenn ein Sensor ausfällt oder die jeweilige Automatik ausgeschaltet ist. Die Agentenliste zeigt, welcher Ersatz gerade gilt.
  - Neuer Datenpunkt `homeapp.kiosk.<id>.wake`: Das Display wird gerade vom Zeitplan oder einer Benachrichtigung angehalten. Der Bildschirmschoner im Browser behandelt das wie Anwesenheit, damit das eingeschaltete Display nicht schwarz bleibt.
- **Kiosk-Agent: `install.sh` richtet den systemd-Dienst vollständig ein.** Das Skript prüft systemd, Benutzer und `python3`, aktiviert `homeapp-kiosk.service` für den Systemstart, startet den Dienst und prüft, dass er läuft. Bei einem Fehler zeigt es die letzten Log-Zeilen. Ein erneuter Aufruf aktualisiert Programm und Dienst; `sudo ./install.sh --uninstall` entfernt beides (die Konfiguration bleibt).

### Behoben
- **Kiosk-Agent startete nicht beim Booten:** Die Unit war nach `graphical.target` geordnet, aber von `multi-user.target` angefordert. Daraus entstand ein Ordnungs-Zyklus, und systemd verwarf den Startjob. Die Unit wartet jetzt nur auf Netzwerk und Benutzersitzungen; der Agent findet die Display-Sitzung selbst. Zum Übernehmen `sudo ./install.sh` erneut ausführen.
- Gruppenrechte: Fehlte auf dem System eine der Gruppen (z. B. `gpio`), wurde der Benutzer in keine Gruppe aufgenommen. Jetzt werden alle vorhandenen Gruppen gesetzt.

## [1.27.0] – 2026-11-02

### Hinzugefügt
- **Kiosk-Sensoren am Raspberry Pi:** Der neue Kiosk-Agent (Ordner `kiosk-agent/`, Installation mit `sudo ./install.sh`) liest drei Sensoren:
  - Präsenzradar **LD2410**: Das Display geht aus, wenn eine einstellbare Zeit niemand da war, und wieder an, sobald jemand kommt oder den Bildschirm berührt.
  - Lichtsensor **BH1750**: Die Helligkeit folgt dem Umgebungslicht.
  - CO₂-Sensor **SCD41**: misst CO₂, Temperatur und Luftfeuchte.

  Die Werte stehen als Datenpunkte `homeapp.kiosk.<id>.…` für Geräte, Benachrichtigungen, Verläufe und die Lüftungsempfehlung bereit. Einstellungen und Status gibt es unter *Einstellungen → Kiosk-Sensoren*.
- **Präsenz im Browser:** Unter *Anzeige & Bedienung → Präsenz- und Lichtsensor* lässt sich je Gerät einstellen:
  - Anwesenheit weckt den Bildschirmschoner.
  - Bei Abwesenheit startet der Bildschirmschoner auch außerhalb des Ruhezeitraums.
  - Die App dunkelt ab, wenn es im Raum dunkel ist.
- **Müllabfuhr:** Abfuhrkalender per ICS/webcal-Adresse des Entsorgers abonnieren; mit *Testen* prüfbar.
  - Erinnerung am Vorabend („Morgen: Restmüll, Bio“) und am Abholtag, Zeiten einstellbar; einzelne Abfallarten lassen sich abwählen.
  - Status-Chip auf der Übersicht und neues Widget „Müllabfuhr“.
  - Hinweis, wenn der Jahreskalender bald endet.
- **Lüftungsempfehlung:** je Raum aus relativer und absoluter Luftfeuchte innen und außen, CO₂ und optional zum Abkühlen, dazu „Fenster schließen“, wenn draußen feuchtere Luft hereinkommt.
  - Schwellen, Außenwerte und Räume sind unter *Einstellungen → Lüftung* einstellbar; ohne eigene Räume werden alle Räume mit Feuchte- oder CO₂-Sensor genutzt.
  - Status-Chip auf der Übersicht, Hinweise in der Glocke und neues Widget „Lüften“.

## [1.26.0] – 2026-11-02

### Hinzugefügt
- **Flüssiges Live-Video statt Einzelbildern:** Die Kamera-Einblendung bei Bewegung und die Webcam des 3D-Druckers (Übersicht, Druckerseite, Einblendung) zeigen jetzt den MJPEG-Stream mit voller Bildrate statt alle 1–2 Sekunden ein neues Standbild. Ist der Stream nicht verfügbar, erscheinen wie bisher Einzelbilder, und die App versucht es alle 30 s erneut. Abschaltbar unter *Kameras & Einblendungen* („Live-Video statt Einzelbildern“) bzw. *3D-Drucker → Webcam* („Webcam als Live-Video anzeigen“).
- **Manuelle Kiosk-Skalierung und Bildschirm-Diagnose:** Unter *Einstellungen → Anzeige* lässt sich die Skalierung fest einstellen (Automatisch, 100–200 %), z. B. 150 % für ein 10″-Hochformat-Display mit 1200 × 1980. Eine Diagnose zeigt Fenstergröße, Pixeldichte, Ausrichtung, aktive Skalierung und gibt Hinweise, wenn das Kiosk-Layout nicht greift.
- **Animierte Geräte-Icons:** Lampen leuchten mit einem Halo in Lichtfarbe und Helligkeit, laufende Geräte bewegen sich passend: Waschmaschine wackelt, Lüfter dreht sich, Steckdose pulsiert, die Klimaanlage zeigt ihren Betriebsmodus. Türen und Fenster schwingen beim Öffnen auf, Rauch- und Wassermelder rütteln mit Pulsring.
- **Mehr Wetter im Symbol:** Schauer mit Sonne bzw. Mond hinter der Wolke, Starkregen, Eisregen, Hagel und Windböen ab 30 km/h.
- **Ambiente:** Der Hintergrund färbt sich nach Morgen-, Tages-, Abend- und Nachtstimmung (nach Sonnenauf- und -untergang). Bei Regen oder Schnee fallen Tropfen bzw. Flocken durch das Hauptpanel der Übersicht (nur Effektstufe „Hoch“). Szenen-Knöpfe zeigen beim Antippen eine Welle vom Berührungspunkt.
- **Wetter im Bildschirmschoner:** Unter der Uhr stehen Außentemperatur und Wetterlage (ohne Animation).
- **Adress-Parameter für Tests am Gerät:** `?fps=1` blendet eine Bildrate-Anzeige ein, `?effects=low|medium|high` setzt die Effektstufe des Geräts.

### Geändert
- **Ein Stream für alle Geräte:** Der Server öffnet jede Kamera bzw. Webcam nur noch einmal und verteilt die Bilder an alle Zuschauer. Langsame Geräte überspringen Bilder, statt mit wachsender Verzögerung hinterherzuhängen; neue Zuschauer sehen sofort das letzte Bild, und jedes Bild wird ohne Wartezeit auf das nächste angezeigt. Bricht die Verbindung zur Kamera ab, wird sie im Hintergrund neu aufgebaut, und hinter einem Reverse Proxy (nginx) wird der Stream nicht mehr gepuffert.
- Live-Streams pausieren, solange der Browser-Tab im Hintergrund ist.
- **Kiosk im Hochformat (z. B. 1200 × 1980):** Der Energiefluss bekommt eine KPI-Spalte daneben und kräftigere Beschriftungen und wird dadurch deutlich größer; die Kameras werden größer, die Räume stehen als Streifen mit vier Spalten. Druck und Musik erscheinen nur noch als eigene Leisten, nicht zusätzlich als Status-Chips. Licht, Räume und Klima nutzen zwei Spalten.
- **Nexus im Hochformat** passt auf einen Bildschirm und nutzt die verbleibende Höhe.
- **Kein Quetschen mehr:** Reicht die Höhe nicht (z. B. bei mehreren Bannern), scrollt die Kiosk-Übersicht, statt Panels zusammenzudrücken oder übereinanderzulegen.
- **Energiefluss:** Die Punkte laufen umso schneller, je mehr Leistung fließt.

### Performance
- Das umlaufende Randlicht läuft nur noch im Hauptpanel. Equalizer, Leucht-Puls der Energieknoten und die Flusslinien im Nexus animieren nur noch Transform und Deckkraft statt Höhe, Schatten oder Filter.
- Die Partikel des Nexus-Zwillings erscheinen nur bei Effektstufe „Hoch“ (32 statt 46). Bei „Niedrig“ entfallen die Flusspunkte.
- Icon-Halos pulsieren bei „Mittel“ nicht mehr, bei „Niedrig“ stehen alle Icon-Animationen still.

### Behoben
- **Abgeschnittenes Hauptpanel im Kiosk:** Mit Bannern schob sich die Druck- und Musikleiste bzw. die Raumleiste über Uhr und Wetter.

## [1.25.0] – 2026-11-01

### Hinzugefügt
- **Icons auf den Rundinstrumenten:** Jede Kachel zeigt vor dem Titel ein passendes Symbol – Sonne (dreht sich langsam, solange Solarstrom fließt), Batterie nach Ladestand bzw. mit Blitz beim Laden, Blatt für die Autarkie, Thermometer, Glühbirne und Lüfter für die Wärmepumpe. In schmalen Kiosk-Kacheln ersetzt das Symbol den Punkt vor dem Titel.
- **Wärmepumpe in Aktion:** Solange der Verdichter läuft, dreht sich ein Lüfter im Ring und im Titel; die Beschriftung zeigt den Stromverbrauch hervorgehoben („⚡ 780 W“ – im Kiosk in einer eigenen Zeile), auch auf der Gerätekarte und im Nexus-Zwilling.
- **Verdichter über die Drehzahl:** Der Datenpunkt „Verdichter läuft / Drehzahl“ darf jetzt auch eine Drehzahl sein – die Wärmepumpe läuft, solange der Wert über 0 liegt.
- **Leistung in W oder kW:** Neue Option „Einheit der Leistungen“ bei der Wärmepumpe für Datenpunkte, die Kilowatt liefern.

### Behoben
- **Energiefluss im Kiosk:** Die Sonne oben im Energiefluss wurde auf der Übersicht abgeschnitten. Das Diagramm lässt über ihr jetzt Platz.
- Hinweise zu Datenpunkten werden im Geräte-Editor angezeigt.

## [1.24.3] – 2026-11-01

### Geändert
- **Versetzte Rundinstrumente auch in höheren Kacheln:** Die Ansicht mit dem Ring rechts und Titel und Beschriftung links greift jetzt schon ab einem Seitenverhältnis der Kachel von 1,5 statt 2 – z. B. auf einem 1200 × 1920 großen Hochformat-Display ohne Druck- oder Musikleiste (dort ist der Ring jetzt 163 px groß, die Zahl 42 px). Der Ring lässt links immer mindestens 7 rem für den Text frei, die Beschriftung darf drei Zeilen nutzen, und lange Titel wie „Wärmepumpe“ reichen bis in die freie Ecke neben dem Ring.

## [1.24.2] – 2026-11-01

### Geändert
- **Besser lesbare Rundinstrumente im Kiosk:** In breiten, flachen Kacheln – etwa drei nebeneinander auf einem Hochformat-Display mit 1200 × 1920 – steht der Ring jetzt rechts über die volle Kachelhöhe, Titel und Beschriftung links daneben. Der Ring wird dadurch deutlich größer (z. B. 66 → 107 px), die Zahl wächst mit (19 → 28 px), die Einheit steht darunter, und die Beschriftung ist größer (17 → 22 px), bricht bei Bedarf auf zwei Zeilen um und überdeckt den Ring nicht mehr. In hohen Kacheln dürfen Zahl und Beschriftung mit großen Ringen weiter wachsen als bisher. Schmale Kacheln (z. B. im Querformat) bleiben unverändert.

## [1.24.1] – 2026-11-01

### Behoben
- **Spotify verbinden: „fetch failed“ nach der Rückkehr von Spotify.** Erreicht der Server Spotify nicht (z. B. DNS oder Internetzugang des Docker-Containers), stand dort nur die nichtssagende Meldung von Node. Jetzt nennt HomeApp den Grund – Adresse nicht auflösbar, keine Verbindung, Zeitüberschreitung, Zertifikat nicht akzeptiert oder Verbindung abgebrochen – samt Hinweis, wo zu suchen ist; das gilt auch für die laufende Verbindung (Token-Erneuerung, Wiedergabe, Suche). Schlägt nur der Verbindungsaufbau fehl, versucht der Server es nach einer Sekunde ein zweites Mal (der einmalige Anmeldecode bleibt dabei gültig). Fehlgeschlagene Anmeldungen stehen mit der genauen Ursache im Container-Log (`[Spotify] …`).
- Ist nach erfolgreicher Anmeldung nur der Kontoname nicht abrufbar, scheitert die Verbindung nicht mehr daran.

## [1.24.0] – 2026-10-25

### Geändert
- **Spotify-Seite neu aufgeteilt:** „Als Nächstes“ und „Zuletzt gehört“ stehen jetzt direkt unter dem Player nebeneinander (auf dem Handy untereinander); jede Liste scrollt für sich, ohne die Seite mitzuziehen, und zeigt alle Titel statt nur zehn. Die Suche steht auf breiten Bildschirmen neben dem Player, im Hochformat unter den beiden Listen; ihre Treffer scrollen ebenfalls für sich.
- **Playlists als aufklappbare Liste:** „Meine Playlists“ steht ganz unten und ist zunächst zugeklappt (sie werden erst beim Aufklappen geladen). Aufgeklappt erscheinen sie als Liste mit Cover, Name, Besitzer, Titelanzahl und Abspielknopf, auf breiten Bildschirmen zweispaltig; die gerade laufende Playlist ist markiert. Alben, Künstler und Playlists in der Suche nutzen dieselbe Listenform.
- Ein mit „+“ angehängter Titel erscheint sofort unter „Als Nächstes“.

## [1.23.2] – 2026-10-25

### Behoben
- **Spotify und 3D-Drucker im vergrößerten Kioskmodus:** Auf großen Displays (z. B. 1200 × 1920 hochkant) richtete sich die Aufteilung der Seiten nach den echten Bildschirmpixeln statt nach der vergrößerten Darstellung. Der Spotify-Player wurde dadurch in eine schmale Spalte gequetscht (Titel ein Wort pro Zeile, Steuerung zerrissen), beim 3D-Drucker waren die Zeiten abgeschnitten. Die Seiten richten sich jetzt nach dem tatsächlich verfügbaren Platz: im Hochformat einspaltig – Spotify mit Player, Suche, Playlists, Warteschlange und zuletzt gehört in dieser Reihenfolge, der 3D-Drucker mit Webcam, aktuellem Druck, Temperaturen und Details –, im Querformat zweispaltig mit passend großem Cover.
- Spotify-Suche: Der Knopf zum Leeren sitzt wieder im Suchfeld statt darunter, das doppelte × des Browsers ist ausgeblendet.

## [1.23.1] – 2026-10-25

### Geändert
- **Weiterleitung von HTTP auf HTTPS:** Läuft HomeApp mit HTTPS (Standard) und wird über `http://` aufgerufen, leitet sie jetzt automatisch auf `https://` mit derselben Adresse, demselben Port und Pfad weiter, statt mit einem Verbindungsfehler zu enden. HTTPS und die WebSocket-Verbindung laufen unverändert auf demselben Port. Die Weiterleitung ist vorübergehend (307) und wird nicht zwischengespeichert.

## [1.23.0] – 2026-10-25

### Hinzugefügt
- **Spotify (Spotify Connect):** Neue Seite „Spotify“ – aktueller Titel mit großem Cover, Position zum Antippen, Zufallswiedergabe, Zurück, Pause/Fortsetzen, Weiter, Wiederholen (aus → alle → dieser Titel) und Lautstärke (mit Stummschalten). Dazu die Wahl des Wiedergabegeräts (z. B. der Verstärker; die laufende Musik wird übergeben), eine Suche nach Titeln, Alben, Künstlern und Playlists, die eigenen Playlists, „Als Nächstes“ und zuletzt gehörte Titel. Titel lassen sich direkt abspielen oder an die Warteschlange hängen.
- **Mini-Player auf den Übersichten:** Solange Musik läuft, zeigt Standard einen Mini-Player mit allen Bedienelementen und einen Statushinweis mit dem Titel (im Kioskmodus als Leiste, neben einem laufenden 3D-Druck in derselben Zeile), Nexus ein Panel „Musik“; für die eigene Startseite gibt es das Widget „Spotify“. Nach dem Pausieren bleibt er noch einige Minuten sichtbar (einstellbar), damit sich die Musik fortsetzen lässt – danach verschwindet er. Auf Wunsch nur, wenn der gewählte Verstärker spielt.
- **Einstellungen → Spotify:** Anleitung mit der passenden Redirect-URI zum Kopieren, Client-ID der eigenen Spotify-App (kein Client-Secret nötig, Anmeldung per PKCE), „Mit Spotify verbinden“ / „Trennen“, Wahl des Verstärkers aus den gefundenen Geräten und die Anzeige auf den Übersichten. Die Anmeldung bleibt auf dem Server.
- Im Demo-Modus spielt ein simulierter Spotify-Player, solange kein Konto verbunden ist.
- API: `GET /api/spotify`, `POST /api/spotify/command`, Suche, Playlists, Geräte, Warteschlange, zuletzt gehört, Anmeldung; WebSocket-Nachricht `spotify`.

## [1.22.0] – 2026-10-25

### Hinzugefügt
- **3D-Drucker (OctoPrint):** Neue Seite „3D-Drucker“ für einen über OctoPrint angebundenen Drucker – Webcam-Bild (antippen bzw. „Live“ öffnet den MJPEG-Livestream), Fortschritt als Rundinstrument, Datei, Restzeit, voraussichtliches Ende, Druckzeit, Düsen- und Bett-Temperaturen mit Verlauf der letzten 30 Minuten sowie Details zum Druckauftrag. Der Menüpunkt erscheint, sobald ein Drucker eingerichtet ist; die Seitenleiste zeigt den Verbindungsstatus.
- **Einstellungen → 3D-Drucker:** Host, Port, HTTPS und API-Key (Application Key) von OctoPrint, Abfrage-Intervall, optionaler Anzeigename sowie eigene Adressen für Webcam-Standbild und -Stream. Der API-Key bleibt auf dem Server. Die Webcam-Adresse wird automatisch erkannt – auch bei OctoPi, das intern nur `127.0.0.1:8080` meldet.
- **Während des Drucks auf der Übersicht:** Standard zeigt ein Panel mit Webcam, Fortschritt, Restzeit und Temperaturen sowie den Statushinweis „3D-Druck 76 % · noch 1 h 20 min“, im Kioskmodus eine einzeilige Leiste; Nexus zeigt ein Panel „3D-Druck“ in der rechten Spalte. Für die eigene Startseite gibt es das Widget „3D-Drucker“.
- **Webcam-Einblendung während des Drucks:** Alle *n* Minuten (Standard 15) erscheint auf allen Geräten das aktuelle Webcam-Bild mit Fortschritt und Restzeit, klein in der Ecke oder mittig, mit einstellbarer Anzeigedauer – auf Wunsch auch, wenn der Druck fertig ist, abgebrochen wird oder mit Fehler endet. Je Browser lässt sie sich „bis Druckende ausblenden“; Kamera-Einblendungen bei Bewegung haben Vorrang.
- Im Demo-Modus druckt ein simulierter Drucker, solange kein OctoPrint eingerichtet ist.
- API: `GET /api/printer`, `/api/printer/temps`, `/api/printer/snapshot`, `/api/printer/stream`; WebSocket-Nachrichten `printer` und `printerPopup`.

## [1.21.0] – 2026-10-24

### Hinzugefügt
- **Bildschirmschoner:** Unter Einstellungen → Anzeige & Bedienung lässt sich je Gerät ein Ruhezeitraum festlegen (Standard 23–6 Uhr). Darin zeigt das Gerät nach einer Minute ohne Bedienung nur noch einen schwarzen Bildschirm, wahlweise mit kleiner, wandernder Uhr. Die App wird dabei vollständig angehalten und spart Prozessor- und Grafikleistung. Antippen weckt sie auf, ohne etwas auszulösen; eine Minute nach der letzten Berührung startet der Schoner erneut. Alarme und Kamera-Popups wecken den Bildschirm automatisch.

## [1.20.0] – 2026-10-24

### Hinzugefügt
- **Kiosk im Hochformat:** Der Kioskmodus unterstützt jetzt hochkant montierte Displays – optimiert für 800 × 1280 und z. B. 1,5-fach vergrößert auf einem 10-Zoll-Display mit 1200 × 1920. Die Standard-Übersicht stapelt Uhr & Wetter, Rundinstrumente, Energiefluss & Sicherheit, Räume und Szenen untereinander; Nexus zeigt den digitalen Zwilling oben und die Panels in zwei Spalten darunter. Die eigene Startseite verteilt ihre Zeilen auf die volle Höhe.

### Geändert
- **Menüknopf im Hochformat:** Bei ausgeblendetem Menü sitzen ☰ und Benachrichtigungen im Hochformat oben in der Kopfzeile statt in einer eigenen Spalte links – der Inhalt nutzt die volle Breite.
- **Alle Seiten im Hochformat:** Kameras stehen auf Tablets im Hochformat zu zweit nebeneinander, die Wetter-Messwerte haben genug Platz für ihre Namen, und die Einstellungen zeigen auf dem vergrößerten Kiosk im Hochformat die Bereichsauswahl oben statt einer schmalen Seitenleiste.

### Behoben
- Kamerakacheln füllen ihre Spalte wieder vollständig aus, statt nur 300 Pixel breit zu sein.
- Thermostat-Regler wachsen im vergrößerten Kioskmodus mit; Sollwert und Ist-Temperatur überlappen nicht mehr mit den Plus/Minus-Knöpfen.
- Raumsymbole in der Auswahlleiste der Räume werden bei Platzmangel nicht mehr zusammengedrückt.
- Kioskmodus: Die Kamera-Vorschau der Sicherheitskachel lässt Platz für die Hinweise auf offene Türen und Fenster.

## [1.19.0] – 2026-10-23

### Hinzugefügt
- **Kiosk auf großen Displays:** Im Kioskmodus wachsen Schrift, Symbole und Bedienelemente auf Bildschirmen über 1280 × 800 automatisch mit – z. B. 1,5-fach auf einem 10-Zoll-Display mit 1920 × 1200. Das gilt für alle Seiten und die Designs Standard, Nexus und Eigene; kleinere Bildschirme bleiben unverändert.

### Geändert
- **Größere Uhr und Wetter im Kiosk:** Auf der Startseite (Standard) sind Uhrzeit, Außentemperatur, Wettersymbol und Wetterdetails im Kioskmodus deutlich größer.
- **Rundinstrumente und Energiefluss im Kiosk:** Die Instrumente nutzen ihre Kachel besser aus, Werte bleiben im Ring; der Energiefluss passt immer in seine Kachel.

## [1.18.0] – 2026-10-21

### Hinzugefügt
- **Kompaktes Menü am Desktop:** Das Menü gibt es jetzt in drei Größen – **Voll** (Seitenleiste mit Namen), **Klein** (schmale Symbolleiste wie auf Tablets) und **Ausblenden** (Knopf ☰). Der bisherige Ausblenden-Knopf unten im Menü schaltet weiter: Voll → Klein → Ausblenden; auf Tablets blendet er wie bisher direkt aus. Wählbar auch unter Einstellungen → Anzeige & Bedienung → Menü (je Gerät, auch vom Handy aus).

## [1.17.0] – 2026-10-20

### Hinzugefügt
- **Eigene Startseite – Inhalt wächst mit:** Zieht man ein Widget größer als seinen Inhalt, wird der Inhalt passend vergrößert (Schrift, Symbole, Diagramme), statt mit leerem Rand oben links zu stehen. Abschaltbar je Widget über ⚙ („Inhalt an die Widgetgröße anpassen“); auf dem Handy, bei Rundinstrumenten, Kameras, Home Core, Energiefluss (ohne Verlauf) und Regenradar passt sich der Inhalt wie bisher selbst an.
- **Einzelne Teile als Widget:**
  - **Wetter-Detail:** Aktuelle Werte, Stundenprognose, Temperaturverlauf, Sonne, UV-Index, Nächste 3 Tage, Regen oder Regenradar (die Karte füllt das Widget).
  - **Energie-Detail:** Erzeugung, Verbrauch, Netz, Batterie, Autarkie, Eigenverbrauch oder einer der drei 24-h-Verläufe.
  - Im Dialog „Widget hinzufügen“ lassen sich die Teile (auch die Rundinstrumente) direkt antippen; jedes startet in einer passenden Größe.
- **Kleine Schalter:** Die Widgets „Eingeschaltete Lichter“ und „Geräte“ können Lampen und Schalter als kompakte Kacheln zeigen (⚙ → „Kleine Schalter“); ein Tipp schaltet, Dimmer zeigen ihre Helligkeit. Das Geräte-Widget kann dafür auch nur 2 Spalten breit sein.

## [1.16.0] – 2026-10-20

### Hinzugefügt
- **Eigene Startseite:** Neben „Standard“ und „Nexus“ gibt es das Design **„Eigene“** (Einstellungen → Anzeige & Bedienung, je Gerät; per Adresse `?design=custom`). Die Seite besteht aus frei platzierbaren Widgets in einem 12-spaltigen Raster:
  - Uhr, Home Core, Wetter, Rundinstrumente (Solar, Batterie, Autarkie, Raumklima, Licht, Wärmepumpe), Energiefluss, Sicherheit, Kamera, alle Räume, einzelner Raum, Szenen, Licht mit „Alle aus“, eigene Geräteauswahl und Notiz.
  - Bearbeitet wird direkt auf der Übersicht: Widgets hinzufügen, am Griff verschieben, an der Ecke in der Größe ändern (auch per Tastatur), über ⚙ einstellen oder löschen; andere Widgets weichen nach unten aus. Auf Wunsch mit Vorlage als Startpunkt.
  - Das Layout wird auf dem Server gespeichert und gilt für alle Geräte mit diesem Design; Änderungen erscheinen auf offenen Geräten sofort.
  - Auf dem Handy stehen die Widgets untereinander, im Kioskmodus füllt das Raster den Bildschirm.
- API: `PUT /api/dashboard` speichert das Layout der eigenen Startseite.

## [1.15.0] – 2026-10-20

### Hinzugefügt
- **Animationsdetails** (Einstellungen → Anzeige & Bedienung, je Gerät) in drei Stufen, um die Grafik schwacher Geräte zu entlasten:
  - **Hoch:** alle Effekte wie bisher.
  - **Mittel:** ruhender Hintergrund, leichtere Glas-Unschärfe, keine dauerhaften Zier-Animationen (Lauflicht, Radar, drehende Ringe, Wellen, Nexus-Orbits und -Partikel); Statusanzeigen bewegen sich weiter.
  - **Niedrig:** zusätzlich keine Unschärfe und keine Farbflecken im Hintergrund, keine Dauer- oder Einblend-Animationen und schlichte Seitenwechsel; nur Ladeanzeigen und Alarme bewegen sich noch.

## [1.14.0] – 2026-10-19

### Hinzugefügt
- **Lichtschein:** Eingeschaltete Lampen werfen einen sanften Lichtkegel auf ihre Kachel, der mit der Helligkeit stärker oder schwächer wird.
- **Füllstandsbalken:** Prozent-Sensoren (z. B. Luftfeuchte, Batterie) zeigen ihren Wert zusätzlich als Balken; Batteriesensoren nutzen ein Symbol passend zum Ladestand und färben sich bei 15 % und weniger rot.
- **Lebendige Diagramme:** Verlaufslinien zeichnen sich beim Öffnen ein, Flächen blenden weich ein, der aktuelle Wert pulsiert als Punkt am Linienende.
- **Dezente Rückmeldungen:** Symbole „ploppen“ beim Einschalten kurz auf, eingeschaltete Schalter leuchten leicht, geänderte Messwerte gleiten sanft ein, Szenen-Knöpfe leuchten beim Auslösen kurz auf, laufende Steckdosen-Verbraucher „atmen“, der Sollwert-Regler gleitet zum neuen Wert.
- Ladeanzeigen mit drehendem Symbol, schwebende Symbole in leeren Seiten und ein leichtes Anheben klickbarer Kacheln unter der Maus (nicht auf Touch-Bildschirmen).

### Hinweise
- Alle neuen Animationen entfallen bei „Bewegung reduzieren“ des Betriebssystems.

## [1.13.0] – 2026-10-19

### Geändert
- **Schnellere Oberfläche:** Seiten und Kacheln aktualisieren sich nur noch, wenn sich ihre eigenen Datenpunkte ändern; Wetterdaten werden von allen Ansichten gemeinsam geladen und zehn Minuten wiederverwendet; Zahlen- und Zeitformate werden nicht mehr bei jeder Anzeige neu erzeugt.
- **Entlasteter Server:** Die wirksame Konfiguration wird zwischengespeichert, statt sie bei jeder Statusänderung neu aufzubauen.
- **Einheitliches Layout:** Räume nutzen dieselben Abschnittsüberschriften wie Lichter und Klima, Diagrammkarten und Legenden von Energie und Wetter sind vereinheitlicht, Ladeanzeigen sehen überall gleich aus.
- Leere Seiten (keine Geräte, Räume, Lichter, Heizgeräte, Kameras, Energiesystem oder ausgeschaltetes Wetter) bieten jetzt einheitlich „Einstellungen öffnen“ an; die ausgeschaltete Wetterseite zeigt ihren Seitentitel.
- Die Client-Tests laufen jetzt mit `npm test` und in der CI.

### Behoben
- Steckdosen mit Status `1` oder `"on"` werden auf der Lichter-Seite als eingeschaltet erkannt, wie auf den Gerätekarten.
- Dimmer, deren Helligkeit als Text gemeldet wird, gelten bei Helligkeit über 0 als an.
- Bei leicht abweichenden Uhren von Server und Browser erscheint kein „vor -2 s“ mehr.
- Nach dem Wechsel vom Demo-Modus zu ioBroker laufen keine Demo-Timer (Bewegung, Türen, Rollläden) mehr weiter; noch nicht gesendete Werte der alten Quelle werden verworfen.
- Rollläden im Demo-Modus bleiben bei Zielwerten außerhalb von 0–100 nicht endlos in Bewegung.
- Kann die Konfiguration beim Öffnen der Einstellungen nicht geladen werden, erscheint ein Hinweis mit „Erneut versuchen“ statt einer endlosen Ladeanzeige.

## [1.12.1] – 2026-10-19

### Behoben
- Flackern der Standard-Übersicht in Chrome im Vollbild reduziert: Hintergrundanimationen stehen still und Glas-/HUD-Unschärfen werden deaktiviert.

## [1.12.0] – 2026-10-19

### Hinzugefügt
- **Kamera-Popups vorübergehend unterdrücken:** Direkt im Popup über „Kamera Popups unterdrücken“ für 15 oder 30 Minuten sowie 1, 2, 4 oder 8 Stunden pausieren. Die Pause gilt für Bewegungs- und Personenmeldungen aller Kameras im aktuellen Browser, übersteht Neuladen und wird zwischen geöffneten Tabs synchronisiert.
- **Dauerhafte Statusmeldung:** Auf allen Seiten bleiben Endzeit und Restdauer sichtbar. „Unterdrückung beenden“ aktiviert Kamera-Popups vorzeitig wieder; nach Ablauf geschieht das automatisch gemäß den bestehenden Einstellungen und Zeitregeln.

### Hinweise
- Bewegungshistorie, Kamerabilder und andere Benachrichtigungen bleiben aktiv. Während der Pause eingegangene Ereignisse werden nicht nachträglich als Popup angezeigt; andere Browser und Geräte bleiben unabhängig.

## [1.11.0] – 2026-10-19

### Hinzugefügt
- **Sichtbare Wischbewegung:** Der Seiteninhalt folgt horizontalen Touch-Gesten und gleitet beim Seitenwechsel passend zur Menüreihenfolge zur Seite. Abgebrochene Gesten federn zurück; Scrollen, Regler und Dialoge bleiben unabhängig bedienbar.
- **Dauerhafte Seitenposition:** Seitenname, Position und beschriftete, antippbare Menümarkierungen bleiben auch bei verborgenem Menü und im Kioskmodus sichtbar. Deaktiviertes Wetter wird nicht mitgezählt; Einstellungen liegen außerhalb der Wischfolge.
- **Kamera-Zoom:** Kameraeinblendungen zoomen beim Öffnen hinein und beim Schließen hinaus, auch in der Ecke und in der Vorschau. Bei „Bewegung reduzieren“ entfallen große Wisch- und Zoombewegungen.

## [1.10.0] – 2026-10-19

### Hinzugefügt
- **Wischgesten:** Auf Touch-Bildschirmen wechselt ein Wisch nach links zur nächsten, nach rechts zur vorherigen Seite. Kurzes Ziehen, Scrollen, Schieberegler, Diagramme und seitlich scrollende Leisten lösen keinen Wechsel aus; Tippen auf das Menü funktioniert wie bisher.
- **Bildwiederholung der Kameras getrennt einstellbar** unter *Einstellungen → Allgemein*: für die Vorschau in der App (Standard weiterhin 3 s) und für die Einblendung bei Bewegungserkennung (Standard weiterhin 1 s).

### Behoben
- Starkes Flackern der Standard-Übersicht im Kioskmodus auf Wandtablets: Dort laufen das Randlicht der Panels und die Farbflächen im Hintergrund nicht mehr ständig mit, und die Panels werden nicht mehr weichgezeichnet. Nexus und die übrigen Ansichten bleiben unverändert.

## [1.9.0] – 2026-10-18

### Hinzugefügt
- HTTPS ist standardmäßig aktiv, mit automatisch erzeugtem selbstsigniertem Zertifikat im Datenverzeichnis oder eigenen Zertifikaten über `TLS_CERT` / `TLS_KEY`. WebSockets verwenden automatisch WSS.

### Geändert
- Der Port bleibt unverändert: im Container `8080`, auf der Synology `8095` (`https://<IP-der-Synology>:8095`). `HTTPS=false` ermöglicht weiterhin reines HTTP.
- Beide Docker-Images enthalten OpenSSL und prüfen den Zustand passend zum gewählten Protokoll.

## [1.8.0] – 2026-10-18

Neues, wählbares Design der Übersicht: **„Nexus“** – ein holografischer digitaler Zwilling des Hauses im Cockpit-Look. Das bisherige Design bleibt unverändert der Standard.

### Hinzugefügt
- **Design der Übersicht** unter *Einstellungen → Anzeige* (pro Gerät): „Standard“ oder „Nexus“; für Kiosk-Browser auch per Adresse `/?design=nexus`.
- **Digitaler Zwilling:** Das Haus schwebt als Hologramm über einem Projektor, jede Etage einzeln mit ihren Räumen – automatisch aus den eingerichteten Räumen erzeugt, kein Grundriss nötig. Räume leuchten in der Farbe ihrer Temperatur und zeigen eingeschaltetes Licht, Anwesenheit, Heizung, offene Fenster und Warnungen; Solardach, Wärmepumpe und Batterie (mit Füllstand) erscheinen, wenn vorhanden. Beschriftungen mit Live-Werten zeigen auf die Räume. Ein Tipp auf Raum oder Wert öffnet die passende Seite.
- **Etage pro Raum** unter *Einstellungen → Räume* (Keller bis Dachgeschoss) für die Anordnung im Zwilling.
- Cockpit-Panels rund um den Zwilling: Uhr mit Tageslichtlinie, Hinweise (Benachrichtigungen und Tipps wie Solarüberschuss, Lüften oder offenes Fenster bei laufender Heizung), Raumklima, Wetter mit 12-Stunden-Kurve, Kameras mit Zielrahmen, Türen und Fenster, Licht mit „Alle aus“, Energiefluss mit 24-h-Wellenform (Erzeugung und Verbrauch) sowie Szenen.
- Nexus passt sich an: Cockpit auf großen Bildschirmen, zwei Spalten auf Tablets, eine Spalte auf dem Handy; im Kioskmodus füllt es genau einen Bildschirm (1280 × 800).

### Hinweise
- Nexus ist immer dunkel; solange es angezeigt wird, schaltet die App auf das dunkle Farbschema. Die übrigen Seiten bleiben wie gewählt.
- Nexus und seine Schriften werden nur geladen, wenn ein Gerät das Design nutzt. Alle Animationen sind langsam und ruhen bei „Bewegung reduzieren“.

## [1.7.2] – 2026-10-18

### Geändert
- Übersicht: Der Radar-Strahl im „Home Core“ dreht deutlich langsamer (16 s statt 4,5 s pro Umdrehung) und ist dezenter.

## [1.7.1] – 2026-10-18

### Geändert
- Übersicht: Die waagerecht über den Kopfbereich und das Sicherheits-Panel (Kameras) wandernde Scan-Linie ist entfernt – ruhigeres Bild, besonders auf Daueranzeigen.

## [1.7.0] – 2026-10-18

Ausblendbares Menü und ein Kioskmodus für Wandtablets (1280 × 800) – das Menü bleibt dabei jederzeit erreichbar, alle Funktionen sind weiter nutzbar.

### Hinzugefügt
- **Menü ausblendbar:** Der Knopf unten in der Seitenleiste blendet das Menü aus, die Seiten nutzen dann die volle Breite. Der Knopf ☰ (oben links, auf dem Handy unten rechts) öffnet es jederzeit als Einblendung, die Glocke mit den Benachrichtigungen bleibt daneben sichtbar. Auf dem Handy wird entsprechend die untere Navigation ausgeblendet.
- **Automatisch ausblenden:** Das Menü verschwindet nach einer einstellbaren Zeit ohne Bedienung (Standard 20 s).
- **Kioskmodus** für eine Daueranzeige, optimiert für 1280 × 800: Die Übersicht passt ohne Scrollen auf einen Bildschirm (kompakte Rundinstrumente, Energiefluss, Kameras und offene Kontakte, Szenen, Räume als Leiste). Das Menü ist ausgeblendet, bleibt aber über ☰ immer erreichbar. Nach einer Zeit ohne Bedienung geht es zurück zur Übersicht; optional Mauszeiger ausblenden, Bild gegen Einbrennen leicht verschieben und Bildschirm eingeschaltet lassen.
- Startadresse `/?kiosk=1` für Kiosk-Browser wie Fully Kiosk (schaltet den Kioskmodus auf dem Gerät ein, `?kiosk=0` wieder aus); Vollbild-Knopf für normale Browser.
- **Nachts abdunkeln** in einem einstellbaren Zeitfenster und drei Stufen.
- Neuer Reiter *Einstellungen → Anzeige*: gilt nur für das jeweilige Gerät und wirkt sofort – das Wandtablet kann im Kioskmodus laufen, während Handy und PC normal bleiben.

### Geändert
- Geöffnete Seiten laden nach einem Update automatisch die neue Version (beim Wiederverbinden mit dem Server und spätestens nach 5 Minuten) – ein Wandtablet muss dafür nicht angefasst werden.

### Behoben
- Eine nach einem Update noch geöffnete Seite konnte beim Wechsel auf eine andere Seite mit einem Ladefehler hängen bleiben; sie lädt jetzt von selbst neu.

## [1.6.0] – 2026-10-18

Die Übersicht ist jetzt eine futuristische Kommandozentrale mit animierten Live-Anzeigen – alles Wichtige auf einen Blick. Die Einzelseiten bleiben schlicht und funktional.

### Hinzugefügt
- **Hero-Bereich:** große Digitaluhr mit Sekundenbalken, Begrüßung und leuchtenden Status-Chips (Lichter, Heizung, Solar, Kameras, letzte Bewegung, offene Fenster), dazu das Wetter mit animiertem Symbol.
- **„Home Core“:** animierter Reaktor in der Mitte (rotierende Ringe, Radar-Sweep, Satelliten, pulsierender Kern). Seine Farbe zeigt den Zustand des Hauses – Cyan „System OK“, Orange „Warnung“, Rot „Alarm“; ein Tipp öffnet die Benachrichtigungen.
- **Live-Rundinstrumente:** Solar, Batterie als Flüssigkeitsanzeige mit Wellen und aufsteigenden Blasen beim Laden, Autarkie, Raumklima (Farbverlauf kalt → warm), Licht als Segmentring (ein Segment pro Lampe) und Wärmepumpe (COP, Lüfter dreht bei laufendem Verdichter). Werte zählen animiert hoch.
- **Energiefluss** mit Kennzahlen und Verlaufskurve der letzten 24 Stunden.
- **Sicherheit:** Kamerabilder im HUD-Rahmen (Ecken, Scanlinien, LIVE), Aktivitäts-Zeitleiste der letzten 6 Stunden und Status aller Türen und Fenster; das Panel färbt sich bei Bewegung rot.
- **Räume im Blick:** jede Kachel zeigt Temperatur mit Skala, Sollwert, Luftfeuchte bzw. CO₂, heizende Räume, Lampen als leuchtende Punkte und offene Fenster.
- Szenen als Neon-Schaltflächen; eingeschaltete Lichter bleiben direkt schaltbar.

### Hinweise
- Alle Dauer-Animationen laufen über CSS-Transformationen (sparsam für Wandtablets) und werden abgeschaltet, wenn im System „Bewegung reduzieren“ aktiv ist.

## [1.5.0] – 2026-10-18

Eigene Benachrichtigungen mit Quittierung, anpassbare Seiten Licht und Klima, eine große Kamera-Einblendung in der Bildschirmmitte, „Was ist neu?“ in der App und Installation als App auf Android. Dazu ein durchgehendes Refactoring mit kommentiertem Quellcode und deutlich mehr Tests.

### Hinzugefügt
- **Benachrichtigungen:** eigene Alarme und Hinweise unter *Einstellungen → Benachrichtigungen*, z. B. bei zu hoher Luftfeuchte oder zu niedriger Temperatur. Pro Regel: Datenpunkt (auch direkt aus einem Gerät übernehmbar), Bedingung (größer/kleiner/gleich, an/aus), Grenzwert, Hysterese gegen Flackern, Verzögerung, Art (Alarm, Warnung, Hinweis), eigener Text mit `{value}` und Sprungziel (Seite und Raum). Vorlagen für hohe Luftfeuchte, niedrige Temperatur und offene Fenster.
- Glocke mit Zähler in der Kopfzeile bzw. Seitenleiste, Benachrichtigungsliste (Antippen springt zum Bereich, Einträge lassen sich bis zum nächsten Auftreten ausblenden), Hinweisleiste über jeder Seite bei Alarmen und Warnungen und eine kurze Einblendung, wenn ein Alarm neu auftritt. Verbindungsprobleme (Server, ioBroker, Surveillance Station) erscheinen automatisch als Hinweis.
- **Quittierungspflicht:** Alarme (pro Regel einstellbar, bei Alarmen standardmäßig an) bleiben als rote Leiste über jeder Seite dauerhaft sichtbar, bis sie quittiert werden – auch wenn der Auslöser schon vorbei ist. Die Quittierung gilt für alle Geräte; offene Alarme überstehen einen Neustart (`/data/alerts.json`). „Alle quittieren“ bei mehreren offenen Alarmen.
- **Seiten Licht und Klima anpassbar** (*Einstellungen → Seiten*): Gruppierung (Standard, nach Raum, nach Gerätetyp, ohne Gruppen), Reihenfolge der Gruppen und Geräte sowie Ausblenden einzelner Geräte pro Seite.
- **Kamera-Einblendung:** erscheint jetzt standardmäßig groß in der Bildschirmmitte. Position (Mitte oder Ecke) und Größe (Mittel, Groß, Fast Vollbild) sind unter *Einstellungen → Allgemein* einstellbar, inklusive Vorschau.
- **Versionshinweis:** aktuelle Version in der Seitenleiste und unter *Einstellungen → Allgemein*; „Was ist neu?“ zeigt diesen Changelog. Nach einem Update öffnet er sich einmal von selbst.
- **Als App installierbar (Android):** Web-App-Manifest mit PNG-Symbolen (auch „maskable“), Service Worker und Button „Als App installieren“. Installiert startet HomeApp im eigenen Fenster ohne Browserleisten (erfordert HTTPS, siehe README).
- Demo-Modus mit Beispiel-Benachrichtigungen (Haustür-Alarm mit Quittierung, CO₂ Büro, Luftfeuchte, Frost, Waschmaschine).
- Server: `GET /api/alerts`, `POST /api/alerts/:id/ack` und `POST /api/alerts/ack` (Quittierung), Push-Nachricht `alerts`, neue Konfigurationsbereiche `alerts` und `layouts`, `app.popupPosition` / `app.popupSize`.

### Geändert
- **Refactoring** von Server und Oberfläche ohne Verhaltensänderung: doppelte Logik zusammengeführt (Datenpunktsuche, Pop-up-Freigabe, Maskierung von Passwörtern, Sitzungs-Wiederholung der Surveillance Station, Geräteerkennung), Zugriffsschutz und Kameraliste als eigene Module, Einstellungen in einzelne Dateien je Reiter aufgeteilt, gemeinsame UI-Bausteine. Durchgehend kommentierter Quellcode.
- Mehr automatische Tests (Geräteerkennung, Bewegung, Zugriffsschutz, Kameraliste, Benachrichtigungen, Seiten-Layouts).
- Versions-Tags (`v1.5.0`) erzeugen automatisch ein GitHub-Release mit dem passenden Changelog-Abschnitt als Release Notes.

## [1.4.1] – 2026-10-18

### Geändert
- **Wetter hat eine eigene Seite** (Menüpunkt „Wetter“ hinter der Übersicht, auch in der Handy-Leiste). Die Übersicht zeigt wieder nur die Haussteuerung; die Kachel „Außen“ führt zum Wetter. Der Menüpunkt verschwindet, wenn das Wetter in den Einstellungen ausgeschaltet ist.
- **UV-Index:** immer die Online-Prognose für den Standort (kein lokaler UV-Sensor mehr). Nach Sonnenuntergang zeigt die Stundenprognose den nächsten Tag.

### Behoben
- UV- und Regen-Balken: Balken und Uhrzeiten lagen auf unterschiedlichen Höhen, wodurch die Zeiten versetzt wirkten. Alle Balken stehen jetzt auf einer gemeinsamen Grundlinie.

## [1.4.0] – 2026-10-18

### Hinzugefügt
- **Wetter auf der Übersicht:** aktuelles Wetter mit animiertem Symbol (lokale Wetterstation hat Vorrang, fehlende Werte kommen aus dem Internet), Stundenverlauf, Temperaturkurve (gemessen + Prognose), Sonnenauf-/-untergang mit Sonnenstand, UV-Index mit Stundenprognose und Sonnenschutz-Hinweis, Vorschau für die nächsten 3 Tage, Regen der nächsten Stunden und animiertes Regenradar (Zoom, Zeitleiste).
- *Einstellungen → Wetter:* Standort per Ortsname/Postleitzahl oder Koordinaten, Zuordnung der lokalen Wetterstation (automatische Erkennung für MQTT „WeatherMan“), Einheit der Windsensoren, Radar ein/aus.
- Server: `/api/weather`, `/api/weather/geocode`, `/api/weather/radar` (Open-Meteo und RainViewer, 10 min Cache, letzte Daten bei Internetausfall), Demo-Wetter ohne Internet.
- Tests für Normalisierung, Cache und Konfigurationsbereinigung des Wetters.

### Hinweise
- Der UV-Index kommt immer aus der Online-Prognose für den Standort, nicht aus einem lokalen Sensor.

## [1.3.2] – 2026-10-18

### Geändert
- **Rangfolge der Konfiguration umgedreht:** Umgebungsvariablen (`.env`) liefern nur noch Vorgaben. Was in den Einstellungen gespeichert wird, hat immer Vorrang. Die von Hand gesetzten Felder merkt sich die App in `config.json` (`userSet`); nur die übrigen Felder folgen der Umgebung. Bestehende `config.json`-Dateien werden beim ersten Start migriert: Werte, die von den Standardwerten abweichen, zählen als manuell gesetzt.
- Die Einstellungen zeigen pro Verbindungsfeld die Herkunft („Vorgabe aus `SS_HOST`“ / „Manuell gesetzt“) und bieten „Vorgabe wiederherstellen“.
- `.env.example`: Beispielwerte sind auskommentiert, damit eine kopierte Datei keine Platzhalter vorgibt.

### Behoben
- Eine aus der Vorlage kopierte `.env` mit Platzhalter-Adressen überschrieb die korrekten gespeicherten Verbindungen (Zeitüberschreitung bei ioBroker und Surveillance Station). Leere Variablen zählen jetzt als nicht gesetzt.

## [1.3.1] – 2026-10-18

### Geändert
- **Automatische Updates ohne SSH und ohne globale Änderungen auf der Synology:** Das Zugriffstoken für das private Image steht nur in der `.env` im Projektordner. Das Update-Skript meldet sich pro Lauf in einem temporären Ordner an und löscht ihn danach; es gibt kein `docker login` in `/root/.docker` mehr. Die Einrichtung geschieht komplett über File Station und Aufgabenplaner.
- Das Skript entfernt nach einem Update nur noch das alte HomeApp-Image (vorher `docker image prune`, das alle ungenutzten Images der Synology betraf), ersetzt den Container nur, wenn er schon existiert, und trägt gleiche Fehlermeldungen nur einmal ins `update.log` ein.

### Behoben
- Eine `.env` mit Windows-Zeilenenden (CRLF) hätte den Image-Namen im Update-Skript verfälscht.

### Hinzugefügt
- Automatische Tests für das Update-Skript aus dem README (läuft mit simuliertem `docker`, auch in GitHub Actions).

## [1.3.0] – 2026-10-18

### Hinzugefügt
- **Automatische Updates aus GitHub:** Der Workflow `.github/workflows/docker.yml` führt bei jedem Push auf `main` die Server-Tests aus und veröffentlicht das fertige Image (`linux/amd64` und `linux/arm64`) in der GitHub Container Registry. Mit `docker-compose.ghcr.yml` und einer Aufgabe im DSM-Aufgabenplaner übernimmt die Synology neue Versionen selbstständig (README → Variante C). Auf der Synology ist weder Quellcode noch npm nötig.

### Behoben
- `Dockerfile.full` war durch die `.dockerignore` (schließt `client/src` aus) nicht baubar. Es hat jetzt eine eigene Ignore-Datei (`Dockerfile.full.dockerignore`).

## [1.2.1] – 2026-10-17

### Behoben
- **„Keine Schreibberechtigung für diesen Datenpunkt“ trotz passender Gruppenrechte:** ioBroker prüft zusätzlich die Rechte jedes Objekts (Besitzer `admin`, Gruppe `administrator`, Recht `664` – „Andere“ dürfen nur lesen). Die Fehlermeldung nennt jetzt die Ursache und verweist auf die neue Prüfung.

### Hinzugefügt
- *Einstellungen → Verbindung → Schreibrechte prüfen*: ermittelt aus Gruppenzugehörigkeit und Objektrechten, welche gesteuerten Datenpunkte nicht beschreibbar sind, und erzeugt ein Skript für den ioBroker-Adapter *javascript*, das genau diese freigibt (`/api/iobroker/permissions`).
- Automatische Tests für die Rechteberechnung.

## [1.2.0] – 2026-10-17

### Hinzugefügt
- **Zeitpläne für die Kamera-Einblendung** (Einstellungen → Allgemein): Regeln mit Art der Erkennung (Bewegung / Person), Wochentagen, Uhrzeitfenster (auch über Mitternacht) und Kameraauswahl. Beispiel: tagsüber nur Person, nachts beides. Mit Vorschau, was nach dem gespeicherten Stand gerade einblendet (`/api/popup-preview`).
- Automatische Tests für die Regel-Logik (`npm test` im Ordner `server`).

## [1.1.1] – 2026-10-17

### Hinzugefügt
- Feste Container-IP `172.40.0.10` in einem eigenen Docker-Netzwerk `homeapp_net` (`172.40.0.0/24`) in der `docker-compose.yml`.

## [1.1.0] – 2026-10-17

### Hinzugefügt
- **Normale Bewegung und erweiterte Erkennung (Person) werden getrennt:** eigene Farbe/Icon/Titel („Bewegung“ blau, „Person erkannt“ rot), eigene Anzeigedauer (30 s / 60 s), eigene Sperrzeit pro Kamera und Art, getrennte Schalter global (Einstellungen → Allgemein) und pro Kamera. Eine Personen-Einblendung ersetzt eine Bewegungs-Einblendung, nicht umgekehrt.
- Webhooks je Art: `/api/webhook/motion/<Kamera>` und `/api/webhook/people/<Kamera>` (alternativ `?type=people`); die Kamera kann per ID oder Name angegeben werden. Fertige URLs je Kamera in den Einstellungen.
- Pro Kamera ein zusätzlicher ioBroker-Datenpunkt für Personenerkennung.
- Anzeige der zuletzt gesehenen Ereignis-Codes der Station (Einstellungen → Verbindung) zur Zuordnung von Bewegung/Person.
- „Letzte Bewegungen“ zeigen die Art der Erkennung.

### Geändert
- Die Station wird über die **Event-API** abgefragt und Ereignisse nach `reason` eingeordnet.

### Behoben
- **Fehlalarme alle 30 Minuten:** Kameras mit Dauer-Aufzeichnung erzeugen alle 30 Minuten einen neuen Aufzeichnungsblock (`reason` 0). Diese wurden bisher als Bewegung gemeldet und werden jetzt ignoriert.
- Kameranamen der Station (`newName`) werden korrekt übernommen.

## [1.0.1] – 2026-10-17

### Behoben
- Kameraseite blieb leer, wenn die Surveillance Station ihre Kameraliste erst nach dem Öffnen der Seite lieferte, obwohl Bewegungs-Einblendungen funktionierten: Die Kameraliste wird jetzt beim Öffnen der Seite, bei Statusänderungen und bei Bewegung einer unbekannten Kamera neu geladen.

### Hinzugefügt
- Kameras, die Bewegung melden, erscheinen auch dann auf der Kameraseite, wenn die Kameraliste leer ist.
- Einstellungen → Kameras: Kameras lassen sich manuell über ihre ID hinzufügen.
- Diagnose: Liefert die Surveillance Station keine Kameras, zeigt die App einen Hinweis (Berechtigungen des Kontos) und schreibt die Antwortfelder ins Protokoll; abweichende Antwortformate der Kameraliste werden akzeptiert.

## [1.0.0] – 2026-10-17

Erste Version.

### Hinzugefügt

**Oberfläche**
- Responsive React-App (Handy: untere Navigation, Tablet: Icon-Leiste, Desktop/Wandtablet: Seitenleiste, Skalierung für große Displays).
- Dunkles und helles Design mit animiertem Hintergrund, Glas-Karten, Spring-Animationen und selbsterklärenden Icons; `prefers-reduced-motion` wird respektiert.
- Ansichten: Übersicht, Räume, Licht, Klima & Heizung, Energie, Kameras, Einstellungen.
- Gerätekarten für Licht (Dimmer, Farben, reine Dimmer ohne Ein/Aus), Steckdosen, Heizkörper-Thermostate (Drehregler), Rollläden (animiert), Sensoren (inkl. Tür/Fenster/Bewegung), Klimaanlagen (Sollwert je Betriebsart, Lüfter), Wärmepumpe (Kennzahlen, Warmwasser, Betriebsart).
- Szenen mit einem Tipp; „Alle aus“-Funktionen.
- Animierter Energiefluss (PV, Netz, Batterie, Haus, Wallbox) mit Kennzahlen und Verlaufsdiagrammen (6/24/48 h, ohne externe Chart-Bibliothek).
- Kameras: Live-Bilder, MJPEG-Livestream mit automatischem Snapshot-Fallback, Vollbild-Viewer.
- Temporäre Einblendung des Kamerabilds bei Bewegung (Dauer einstellbar, Fortschrittsbalken).
- Einstellungsseite mit Live-Suche nach ioBroker-Datenpunkten, Raum-/Geräte-/Szenen-/Kamera-/Energie-Editor.
- PWA-Manifest, Favicon.

**Server**
- Node.js-Server (Express + WebSocket) mit Live-Push aller Datenpunkt-Änderungen (gebündelt in 80-ms-Paketen).
- ioBroker-Anbindung per reinem WebSocket (`@iobroker/ws`, Admin ab v6) und socket.io, mit OAuth2-Anmeldung und automatischer Token-Erneuerung; verständliche Hinweise bei fehlenden Berechtigungen.
- Synology Surveillance Station Web API: Anmeldung mit automatischer Session-Erneuerung, **2-Faktor-Konten über das DSM-Geräte-Token** (Code nur einmalig, wird nie gespeichert), Kameraliste, Snapshots (gecacht), MJPEG-Proxy, Bewegungsereignisse über Aufzeichnungsliste; Login-Fehler werden verständlich erklärt und nicht endlos wiederholt (Schutz vor DSM-Auto-Block).
- Drei Bewegungsquellen: Surveillance-Station-Polling, Webhook (Token-geschützt), ioBroker-Datenpunkt; Sperrzeit pro Kamera.
- Eigene Verlaufsdaten (Minutenraster, 48 h, Persistenz in `history.json`).
- Automatische Geräteerkennung für Hue, Homematic/HomematicIP, E3/DC, Daikin Cloud und MQTT-Wetterstation.
- Demo-Modus mit simulierter Installation (Physik für Temperaturen, PV, Batterie, Rollläden, zufällige Bewegung).
- Optionaler Zugriffsschutz per HTTP Basic Auth (`APP_USER` / `APP_PASSWORD`).
- Konfiguration in `config.json` (atomar geschrieben) plus Überschreiben per Umgebungsvariablen; Passwörter verlassen den Server nie.
- Es werden nur Datenpunkte geschrieben, die in der Konfiguration vorkommen.

**Betrieb**
- `Dockerfile` ohne npm im Container-Build (nutzt die mitgelieferten `server/node_modules` und das gebaute `client/dist`; vermeidet den npm-Fehler „Exit handler never called!“ auf älteren Docker-Versionen der Synology), `Dockerfile.full` als vollständiger Multi-Stage-Build, `docker-compose.yml` (Host-Port 8095, optionale Werte über `.env`), `.env.example`, Health-Check.
- README mit Installation auf der Synology, Einrichtung von ioBroker und Surveillance Station, Konfigurationsformat, API und Fehlersuche.
