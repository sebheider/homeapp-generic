#!/usr/bin/env python3
"""
HomeApp Kiosk-Agent für den Raspberry Pi eines Wanddisplays.

Liest
  * den Präsenzradar HLK-LD2410 (UART, optional nur der OUT-Pin),
  * den Lichtsensor BH1750 (I²C, 0x23) und
  * den CO₂-Sensor Sensirion SCD41 (I²C, 0x62; CO₂, Temperatur, Luftfeuchte),
schaltet das Display bei Abwesenheit aus (Touch oder Präsenz weckt es), hält es in „Immer an“-Zeiten
an, schaltet es bei Kamera-Einblendungen und neuen Benachrichtigungen ein (außer in Ruhezeiten),
regelt die Helligkeit nach dem Umgebungslicht und meldet alle Werte an HomeApp
(POST /api/kiosk/report?token=…). Die Weck-Ereignisse kommen sofort über
GET /api/kiosk/events?token=… (Server-Sent Events) und zur Sicherheit mit jeder Meldung.
Die Einstellungen (Ausschaltzeit, Zeitpläne, Helligkeitskurve, …) kommen mit jeder Antwort vom Server
(Einstellungen → Kiosk-Sensoren). Zeitpläne gelten in der Ortszeit des Pi.
Ohne Präsenzradar schaltet der Agent das Display nach festen Aus-Zeiten, ohne Lichtsensor dimmt er
es nach festen Dimmzeiten.
Solange jemand die Radar-Seite von HomeApp offen hat, sendet er etwa viermal pro Sekunde ein Live-Bild
des Radars (POST /api/kiosk/radar?token=…) und schaltet den LD2410 dafür in den Engineering-Modus
(Energie je Entfernungstor).

Nur Python-Standardbibliothek; für den LD2410 per UART wird pyserial benötigt
(`sudo apt install python3-serial`), für den OUT-Pin gpiozero (auf Raspberry Pi OS vorinstalliert).

Aufruf:  python3 homeapp_kiosk.py --config /etc/homeapp-kiosk.json [--once] [--test-display]
"""
from __future__ import annotations

import argparse
import collections
import datetime
import errno
import glob
import http.client
import json
import math
import os
import re
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

VERSION = '1.3.0'
RADAR_INTERVAL = 0.25  # s between two live radar frames
RADAR_LINGER = 10.0  # s the live radar keeps running after the server last asked for it

# Einstellungen, solange der Server noch nicht geantwortet hat (wie server/src/kiosk.js sanitizeKiosk)
DEFAULT_SETTINGS = {
    'screenOff': True,
    'screenOffSeconds': 180,
    'alwaysOn': [],
    'wakeOnCamera': True,
    'wakeOnAlerts': True,
    'wakeSeverity': 'info',
    'wakeSeconds': 120,
    'quietHours': [{'days': [0, 1, 2, 3, 4, 5, 6], 'from': '22:00', 'to': '06:00'}],
    'offTimes': [],
    'dimTimes': [],
    'dimBrightness': None,  # None (älterer Server) = minBrightness
    'fullBrightness': None,  # None (älterer Server) = maxBrightness
    'autoBrightness': True,
    'minBrightness': 15,
    'maxBrightness': 100,
    'luxDark': 5,
    'luxBright': 400,
    'presenceMaxDistance': 0,
    'intervalSeconds': 10,
    'co2Altitude': 0,
    'temperatureOffset': 0,
}

DEFAULT_CONFIG = {
    'url': '',  # Melde-Adresse aus den HomeApp-Einstellungen inkl. ?token=…
    'id': socket.gethostname().split('.')[0].lower(),
    'name': '',
    'insecure_tls': True,  # HomeApp nutzt meist ein selbst signiertes Zertifikat
    # gate_cm: width of a distance gate (75, or 20 after switching the radar to the fine resolution)
    'ld2410': {'enabled': True, 'port': '/dev/serial0', 'baudrate': 256000, 'out_pin': None, 'gate_cm': 75},
    'bh1750': {'enabled': True, 'bus': 1, 'address': 0x23},
    'scd41': {'enabled': True, 'bus': 1},
    'display': {
        'method': 'auto',  # auto | backlight | wlr-randr | xset | ddcutil | command | none
        'backlight': '',  # Ordner unter /sys/class/backlight (leer = erster gefundener)
        'output': '',  # wlr-randr-Ausgang, z. B. HDMI-A-1 (leer = alle)
        'on_command': '',
        'off_command': '',
        'brightness_command': '',  # {brightness} wird durch 0–100 ersetzt
    },
    'touch_wake': True,
}


def log(*args):
    print(time.strftime('%H:%M:%S'), *args, flush=True)


def merge(base: dict, extra: dict) -> dict:
    out = dict(base)
    for k, v in (extra or {}).items():
        out[k] = merge(out[k], v) if isinstance(out.get(k), dict) and isinstance(v, dict) else v
    return out


def fds_nearly_exhausted(share: float = 0.9) -> bool:
    """Sind fast alle erlaubten Dateideskriptoren belegt (Leck)? Nur unter Linux, sonst immer False."""
    try:
        import resource
    except ImportError:
        return False
    limit = resource.getrlimit(resource.RLIMIT_NOFILE)[0]
    if limit == resource.RLIM_INFINITY or limit <= 0:
        return False
    try:
        used = len(os.listdir('/proc/self/fd'))
    except OSError as e:
        return e.errno in (errno.EMFILE, errno.ENFILE)
    return used >= limit * share


# --------------------------------------------------------------------------- Berechnungen


def sensirion_crc(data: bytes) -> int:
    """CRC-8 der Sensirion-Sensoren (Polynom 0x31, Startwert 0xFF)."""
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def brightness_for(lux: Optional[float], s: dict) -> int:
    """Zielhelligkeit (%) zum Umgebungslicht: logarithmisch zwischen luxDark (min) und luxBright (max)."""
    lo, hi = int(s['minBrightness']), int(s['maxBrightness'])
    if hi < lo:
        lo, hi = hi, lo
    if lux is None:
        return hi
    dark = max(0.1, float(s['luxDark']))
    bright = max(dark + 1, float(s['luxBright']))
    if lux <= dark:
        return lo
    if lux >= bright:
        return hi
    f = (math.log(lux) - math.log(dark)) / (math.log(bright) - math.log(dark))
    return round(lo + (hi - lo) * f)


ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
SEVERITY_RANK = {'info': 0, 'warning': 1, 'alarm': 2}


def to_minutes(text) -> Optional[int]:
    """„HH:MM“ → Minuten seit Mitternacht (24:00 erlaubt) oder None."""
    m = re.fullmatch(r'(\d{1,2}):(\d{2})', str(text or ''))
    if not m:
        return None
    minutes = int(m.group(1)) * 60 + int(m.group(2))
    return minutes if minutes <= 1440 else None


def in_window(w: dict, now: datetime.datetime) -> bool:
    """
    Liegt `now` im Zeitfenster {days, from, to}? Wie server/src/popup-rules.js inWindow: Tage 0 = Sonntag … 6,
    leere Tage = alle, von = bis = ganzer Tag, über Mitternacht zählt der Teil nach 0 Uhr zum Starttag.
    """
    days = [int(d) for d in (w.get('days') or [])] or ALL_DAYS
    start = to_minutes(w.get('from'))
    end = to_minutes(w.get('to'))
    start = 0 if start is None else start
    end = 0 if end is None else end
    minutes = now.hour * 60 + now.minute
    today = (now.weekday() + 1) % 7  # Python: Montag = 0
    yesterday = (today + 6) % 7
    if start == end:
        return today in days
    if start < end:
        return start <= minutes < end and today in days
    return (minutes >= start and today in days) or (minutes < end and yesterday in days)


def in_any_window(windows, now: datetime.datetime) -> bool:
    return any(isinstance(w, dict) and in_window(w, now) for w in (windows or []))


def should_wake(event: dict, s: dict, now: datetime.datetime) -> bool:
    """Soll ein Weck-Ereignis des Servers (Kamera, Benachrichtigung, 3D-Druck) das Display einschalten?"""
    if in_any_window(s.get('quietHours'), now):
        return False
    if event.get('reason') == 'camera':
        return bool(s.get('wakeOnCamera', True))
    if not s.get('wakeOnAlerts', True):
        return False
    return SEVERITY_RANK.get(event.get('severity'), 0) >= SEVERITY_RANK.get(s.get('wakeSeverity'), 0)


def scheduled_brightness(s: dict, now: datetime.datetime) -> int:
    """Helligkeit ohne Lichtsensor: in den Dimmzeiten dimBrightness, sonst fullBrightness."""
    dim = s.get('dimBrightness')
    full = s.get('fullBrightness')
    lo, hi = sorted((int(s['minBrightness'] if dim is None else dim), int(s['maxBrightness'] if full is None else full)))
    return lo if in_any_window(s.get('dimTimes'), now) else hi


class BrightnessSmoother:
    """Glättet Helligkeitsänderungen (schnell heller, langsam dunkler) und ignoriert kleine Sprünge."""

    def __init__(self, step=2):
        self.value: Optional[float] = None
        self.step = step

    def update(self, target: int) -> int:
        if self.value is None:
            self.value = float(target)
        else:
            alpha = 0.5 if target > self.value else 0.2
            self.value += (target - self.value) * alpha
            if abs(target - self.value) < self.step:
                self.value = float(target)
        return round(self.value)


class PresenceTimer:
    """
    Entscheidet, ob das Display an sein soll: an bei Präsenz oder Berührung und noch
    `screenOffSeconds` danach, außerdem in den „Immer an“-Zeiten und nach einem Weck-Ereignis
    für `wakeSeconds`. Ohne (funktionierenden) Präsenzsensor oder mit ausgeschalteter
    Präsenz-Abschaltung gelten die festen Aus-Zeiten (`offTimes`); ohne solche bleibt es an.
    """

    def __init__(self, now=time.monotonic, clock=datetime.datetime.now):
        self.now = now
        self.clock = clock
        self.last_active = now()
        self.wake_until = 0.0

    def touched(self):
        self.last_active = self.now()

    def wake(self, seconds: float):
        self.wake_until = max(self.wake_until, self.now() + seconds)

    def forced(self, settings: dict) -> bool:
        """An ohne Präsenz: „Immer an“-Zeit oder Weck-Ereignis."""
        return self.now() < self.wake_until or in_any_window(settings.get('alwaysOn'), self.clock())

    def screen_on(self, presence: Optional[bool], settings: dict) -> bool:
        if presence is None or not settings.get('screenOff', True):
            # fixed off times; entering one (or a touch inside) keeps the screen on for screenOffSeconds
            if not in_any_window(settings.get('offTimes'), self.clock()):
                self.last_active = self.now()
                return True
        elif presence:
            self.last_active = self.now()
            return True
        if self.forced(settings):
            return True
        return self.now() - self.last_active < float(settings.get('screenOffSeconds', 180))


# --------------------------------------------------------------------------- LD2410

LD_HEAD = b'\xf4\xf3\xf2\xf1'
LD_TAIL = b'\xf8\xf7\xf6\xf5'
LD_CMD_HEAD = b'\xfd\xfc\xfb\xfa'
LD_CMD_TAIL = b'\x04\x03\x02\x01'


def parse_ld2410_payload(payload: bytes) -> Optional[dict]:
    """
    Nutzdaten eines Report-Frames (Basis- 0x02 oder Engineering-Modus 0x01). Im Engineering-Modus folgen auf die
    Ziele die höchsten Tore N (Bewegung, ruhend) und die Energie (0–100) der Tore 0 … N.
    """
    if len(payload) < 13 or payload[0] not in (0x01, 0x02) or payload[1] != 0xAA:
        return None
    state, mov_d, mov_e, still_d, still_e, det_d = struct.unpack_from('<BHBHBH', payload, 2)
    frame = {
        'state': state,  # 0 niemand, 1 Bewegung, 2 ruhend, 3 beides
        'moving': bool(state & 1),
        'still': bool(state & 2),
        'moving_distance': mov_d,
        'moving_energy': mov_e,
        'still_distance': still_d,
        'still_energy': still_e,
        'detect_distance': det_d,
    }
    if payload[0] == 0x01 and len(payload) >= 15:
        n_moving, n_still = payload[11] + 1, payload[12] + 1
        end = 13 + n_moving + n_still
        if end <= len(payload) - 2:  # the frame ends with 0x55 0x00
            frame['moving_gates'] = list(payload[13:13 + n_moving])
            frame['still_gates'] = list(payload[13 + n_moving:end])
    return frame


def ld2410_command(word: int, value: bytes = b'') -> bytes:
    """Befehlsrahmen für den LD2410 (Befehlswort und Wert little-endian)."""
    data = struct.pack('<H', word) + value
    return LD_CMD_HEAD + struct.pack('<H', len(data)) + data + LD_CMD_TAIL


class LD2410Parser:
    """Sucht vollständige Report-Frames im UART-Datenstrom."""

    def __init__(self):
        self.buf = bytearray()

    def feed(self, data: bytes) -> list:
        self.buf += data
        frames = []
        while True:
            start = self.buf.find(LD_HEAD)
            if start < 0:
                del self.buf[:-3]  # evtl. angefangener Kopf bleibt stehen
                return frames
            if start:
                del self.buf[:start]
            if len(self.buf) < 6:
                return frames
            length = struct.unpack_from('<H', self.buf, 4)[0]
            if length > 64:  # kein Report-Frame: Kopf überspringen
                del self.buf[:4]
                continue
            end = 6 + length + 4
            if len(self.buf) < end:
                return frames
            if self.buf[6 + length:end] == LD_TAIL:
                frame = parse_ld2410_payload(bytes(self.buf[6:6 + length]))
                if frame:
                    frames.append(frame)
                del self.buf[:end]
            else:
                del self.buf[:4]


def ld2410_presence(frame: dict, max_distance: int) -> tuple:
    """(Präsenz, Abstand in cm) eines Frames; `max_distance` > 0 ignoriert weiter entfernte Ziele."""
    dists = []
    if frame['moving']:
        dists.append(frame['moving_distance'])
    if frame['still']:
        dists.append(frame['still_distance'])
    if not dists:
        return False, 0
    distance = min(dists)
    if max_distance and distance > max_distance:
        return False, distance
    return True, distance


def radar_payload(frame: dict, max_distance: int, gate_cm: int) -> dict:
    """Live-Bild eines Frames für die Radar-Seite: Ziele mit Abstand (cm) und Energie (0–100), im Engineering-Modus je Tor."""
    def target(kind: str) -> Optional[dict]:
        return {'distance': frame[f'{kind}_distance'], 'energy': frame[f'{kind}_energy']} if frame[kind] else None

    out = {'mode': 'basic', 'presence': ld2410_presence(frame, max_distance)[0], 'moving': target('moving'), 'still': target('still'), 'gateCm': gate_cm}
    if 'moving_gates' in frame:
        out['mode'] = 'engineering'
        out['gates'] = {'moving': frame['moving_gates'], 'still': frame['still_gates']}
    return out


class LD2410:
    """Liest den Radar in einem eigenen Thread (UART) oder fragt den OUT-Pin ab."""

    STALE = 5.0  # s ohne Frame = Sensorfehler

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.frame: Optional[dict] = None
        self.frame_at = 0.0
        self.error: Optional[str] = None
        self.pin = None
        self.serial = None
        self.parser = LD2410Parser()
        try:
            try:
                import serial  # type: ignore
            except ImportError:
                raise RuntimeError('pyserial fehlt (sudo apt install python3-serial)') from None
            self.serial = serial.Serial(cfg.get('port', '/dev/serial0'), int(cfg.get('baudrate', 256000)), timeout=0.5)
            threading.Thread(target=self._read, daemon=True).start()
        except Exception as e:  # pyserial fehlt oder UART nicht frei
            if self.serial is not None:
                self.serial.close()
                self.serial = None
            if cfg.get('out_pin') is None:
                raise RuntimeError(f'LD2410: {e}') from e
            log(f'LD2410 UART nicht verfügbar ({e}), nutze OUT-Pin GPIO{cfg["out_pin"]}')
        if cfg.get('out_pin') is not None and self.serial is None:
            from gpiozero import DigitalInputDevice  # type: ignore
            self.pin = DigitalInputDevice(int(cfg['out_pin']), pull_up=False)

    def _read(self):
        while True:
            try:
                data = self.serial.read(256)
                for f in self.parser.feed(data):
                    self.frame, self.frame_at, self.error = f, time.monotonic(), None
            except Exception as e:
                self.error = f'LD2410: {e}'
                time.sleep(2)

    def read(self, max_distance: int) -> dict:
        if self.pin is not None:
            return {'presence': bool(self.pin.value)}
        frame = self._latest()
        presence, distance = ld2410_presence(frame, max_distance)
        return {'presence': presence, 'moving': presence and frame['moving'], 'still': presence and frame['still'], 'distance': distance}

    def radar(self, max_distance: int, gate_cm: int) -> dict:
        """Live-Bild für die Radar-Seite (mit dem OUT-Pin nur die Präsenz)."""
        if self.pin is not None:
            return {'mode': 'pin', 'presence': bool(self.pin.value)}
        return radar_payload(self._latest(), max_distance, gate_cm)

    def set_engineering(self, on: bool):
        """Schaltet den Engineering-Modus (Energie je Entfernungstor) ein oder aus; nur per UART."""
        if self.serial is None:
            return
        for cmd in (ld2410_command(0x00FF, b'\x01\x00'), ld2410_command(0x0062 if on else 0x0063), ld2410_command(0x00FE)):
            self.serial.write(cmd)
            time.sleep(0.1)  # the radar needs a moment per command; the parser skips its answers

    def _latest(self) -> dict:
        if self.frame is None or time.monotonic() - self.frame_at > self.STALE:
            raise RuntimeError(self.error or 'LD2410: keine Daten (Verkabelung TX/RX, UART aktiviert?)')
        return self.frame


# --------------------------------------------------------------------------- I²C

I2C_SLAVE = 0x0703


class I2CDevice:
    def __init__(self, bus: int, address: int):
        import fcntl

        self.fd: Optional[int] = os.open(f'/dev/i2c-{bus}', os.O_RDWR)
        try:
            fcntl.ioctl(self.fd, I2C_SLAVE, address)
        except BaseException:
            self.close()
            raise

    def write(self, data: bytes):
        os.write(self.fd, data)

    def read(self, n: int) -> bytes:
        return os.read(self.fd, n)

    def close(self):
        fd, self.fd = self.fd, None
        if fd is not None:
            os.close(fd)


class BH1750:
    def __init__(self, cfg: dict):
        self.dev = I2CDevice(int(cfg.get('bus', 1)), int(cfg.get('address', 0x23)))
        # the agent retries a missing sensor every minute, so a failed start must not leak the descriptor
        try:
            self.dev.write(b'\x01')  # power on
            self.dev.write(b'\x10')  # continuous high resolution (1 lx, 120 ms)
            time.sleep(0.2)
        except BaseException:
            self.dev.close()
            raise

    def read(self) -> dict:
        hi, lo = self.dev.read(2)
        return {'lux': round(((hi << 8) | lo) / 1.2, 1)}


def scd41_words(data: bytes) -> list:
    """Prüft die CRC jedes 16-Bit-Worts (2 Byte + CRC) und liefert die Werte."""
    words = []
    for i in range(0, len(data), 3):
        chunk = data[i:i + 2]
        if sensirion_crc(chunk) != data[i + 2]:
            raise RuntimeError('SCD41: CRC-Fehler')
        words.append((chunk[0] << 8) | chunk[1])
    return words


def scd41_convert(words: list) -> dict:
    co2, t_raw, rh_raw = words
    return {'co2': co2, 'temperature': round(-45 + 175 * t_raw / 65535, 2), 'humidity': round(100 * rh_raw / 65535, 1)}


class SCD41:
    def __init__(self, cfg: dict, altitude: int):
        self.dev = I2CDevice(int(cfg.get('bus', 1)), 0x62)
        self.altitude = None
        self.last: Optional[dict] = None
        self.last_at = 0.0
        try:
            self.start(altitude)
        except BaseException:
            self.dev.close()
            raise

    def cmd(self, code: int, arg: Optional[int] = None):
        data = struct.pack('>H', code)
        if arg is not None:
            word = struct.pack('>H', arg)
            data += word + bytes([sensirion_crc(word)])
        self.dev.write(data)

    def start(self, altitude: int):
        self.cmd(0x3F86)  # stop_periodic_measurement
        time.sleep(0.5)
        self.cmd(0x2427, max(0, min(3000, int(altitude))))  # set_sensor_altitude
        time.sleep(0.01)
        self.cmd(0x21B1)  # start_periodic_measurement (alle 5 s)
        self.started_at = time.monotonic()
        self.altitude = altitude

    def read(self, altitude: int) -> Optional[dict]:
        if altitude != self.altitude:
            self.start(altitude)
        self.cmd(0xE4B8)  # get_data_ready_status
        time.sleep(0.001)
        ready = scd41_words(self.dev.read(3))[0] & 0x07FF
        if ready:
            self.cmd(0xEC05)  # read_measurement
            time.sleep(0.001)
            self.last, self.last_at = scd41_convert(scd41_words(self.dev.read(9))), time.monotonic()
        if self.last is None and time.monotonic() - self.started_at <= 30:
            return None
        if self.last is None or time.monotonic() - self.last_at > 30:
            raise RuntimeError('SCD41: keine Messwerte')
        return dict(self.last)


# --------------------------------------------------------------------------- Display


def run(cmd: list, env: Optional[dict] = None) -> None:
    subprocess.run(cmd, check=True, timeout=10, env={**os.environ, **(env or {})}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def wayland_env() -> dict:
    """Umgebung für wlr-randr, wenn der Agent als Dienst läuft (Socket der laufenden Sitzung)."""
    runtime = os.environ.get('XDG_RUNTIME_DIR') or f'/run/user/{os.getuid()}'
    if os.environ.get('WAYLAND_DISPLAY'):
        return {'XDG_RUNTIME_DIR': runtime}
    sockets = sorted(p for p in glob.glob(os.path.join(runtime, 'wayland-*')) if not p.endswith('.lock'))
    return {'XDG_RUNTIME_DIR': runtime, 'WAYLAND_DISPLAY': os.path.basename(sockets[0])} if sockets else {}


class Display:
    """Schaltet das Display und setzt die Helligkeit (je nach Methode)."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.method = cfg.get('method', 'auto')
        self.backlight = None
        if self.method == 'auto':
            self.method = self.detect()
        if self.method == 'backlight':
            base = cfg.get('backlight') or next(iter(sorted(glob.glob('/sys/class/backlight/*'))), None)
            if not base:
                raise RuntimeError('Display: keine Hintergrundbeleuchtung unter /sys/class/backlight')
            self.backlight = base if base.startswith('/') else f'/sys/class/backlight/{base}'
            with open(os.path.join(self.backlight, 'max_brightness')) as f:
                self.max = int(f.read().strip() or 255)
        self.on: Optional[bool] = None
        self.brightness: Optional[int] = None

    def detect(self) -> str:
        if self.cfg.get('on_command') or self.cfg.get('brightness_command'):
            return 'command'
        if glob.glob('/sys/class/backlight/*'):
            return 'backlight'
        if shutil.which('wlr-randr') and wayland_env():
            return 'wlr-randr'
        if shutil.which('xset') and (os.environ.get('DISPLAY') or os.path.exists('/tmp/.X11-unix/X0')):
            return 'xset'
        if shutil.which('ddcutil'):
            return 'ddcutil'
        return 'none'

    @property
    def dims(self) -> bool:
        return self.method in ('backlight', 'ddcutil') or (self.method == 'command' and bool(self.cfg.get('brightness_command')))

    def set_power(self, on: bool):
        if on == self.on or self.method == 'none':
            return
        m = self.method
        if m == 'backlight':
            with open(os.path.join(self.backlight, 'bl_power'), 'w') as f:
                f.write('0' if on else '4')
        elif m == 'wlr-randr':
            outputs = [self.cfg['output']] if self.cfg.get('output') else self.wlr_outputs()
            for o in outputs:
                run(['wlr-randr', '--output', o, '--on' if on else '--off'], wayland_env())
        elif m == 'xset':
            run(['xset', 'dpms', 'force', 'on' if on else 'off'], {'DISPLAY': os.environ.get('DISPLAY', ':0')})
        elif m == 'ddcutil':
            run(['ddcutil', 'setvcp', 'D6', '01' if on else '04'])
        elif m == 'command':
            cmd = self.cfg.get('on_command' if on else 'off_command')
            if cmd:
                subprocess.run(cmd, shell=True, check=True, timeout=10)
        self.on = on
        log('Display', 'an' if on else 'aus')

    def wlr_outputs(self) -> list:
        out = subprocess.run(['wlr-randr'], capture_output=True, text=True, timeout=10, env={**os.environ, **wayland_env()}).stdout
        return [line.split()[0] for line in out.splitlines() if line and not line[0].isspace()]

    def set_brightness(self, percent: int):
        percent = max(1, min(100, int(percent)))
        if percent == self.brightness or not self.dims:
            return
        if self.method == 'backlight':
            with open(os.path.join(self.backlight, 'brightness'), 'w') as f:
                f.write(str(max(1, round(self.max * percent / 100))))
        elif self.method == 'ddcutil':
            run(['ddcutil', 'setvcp', '10', str(percent)])
        elif self.method == 'command':
            subprocess.run(self.cfg['brightness_command'].replace('{brightness}', str(percent)), shell=True, check=True, timeout=10)
        self.brightness = percent


class TouchWatcher:
    """Meldet Eingaben an /dev/input/event* (Touch, Maus, Tastatur), um das Display aufzuwecken."""

    def __init__(self, on_touch):
        self.on_touch = on_touch
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        import select

        fds = {}
        while True:
            for path in glob.glob('/dev/input/event*'):
                if path not in fds.values():
                    try:
                        fds[os.open(path, os.O_RDONLY | os.O_NONBLOCK)] = path
                    except OSError:
                        pass
            if not fds:
                time.sleep(30)
                continue
            ready, _, _ = select.select(list(fds), [], [], 30)
            for fd in ready:
                try:
                    if os.read(fd, 4096):
                        self.on_touch()
                except OSError:  # Gerät entfernt
                    os.close(fd)
                    fds.pop(fd, None)


def sibling_url(report_url: str, name: str) -> str:
    """Andere Agent-Adresse zur Melde-Adresse (…/api/kiosk/report?token= → …/api/kiosk/<name>?token=), sonst ''."""
    u = urllib.parse.urlsplit(report_url)
    if not u.path.endswith('/report'):
        return ''
    return urllib.parse.urlunsplit(u._replace(path=u.path[: -len('report')] + name))


def events_url(report_url: str) -> str:
    """Adresse des Ereignis-Streams (Weck-Ereignisse, Anforderung des Live-Radars)."""
    return sibling_url(report_url, 'events')


def radar_url(report_url: str) -> str:
    """Adresse für die Live-Bilder des Präsenzradars."""
    return sibling_url(report_url, 'radar')


def parse_sse(lines):
    """Liefert die Daten jedes Ereignisses eines Server-Sent-Events-Streams (Zeilen als bytes oder str)."""
    data = []
    for raw in lines:
        line = (raw.decode('utf-8', 'replace') if isinstance(raw, bytes) else raw).rstrip('\r\n')
        if not line:
            if data:
                yield '\n'.join(data)
            data = []
        elif line.startswith('data:'):
            data.append(line[6:] if line.startswith('data: ') else line[5:])


class WakeStream:
    """Hält die Verbindung zu GET /api/kiosk/events und meldet jedes Weck-Ereignis sofort."""

    def __init__(self, url: str, insecure: bool, on_event):
        self.url = url
        self.ctx = ssl._create_unverified_context() if insecure and url.startswith('https') else None
        self.on_event = on_event
        self.error: Optional[str] = None
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while True:
            try:
                req = urllib.request.Request(self.url, headers={'Accept': 'text/event-stream'})
                # the server sends a ping every 25 s, so a silent connection is a dead one
                with urllib.request.urlopen(req, timeout=70, context=self.ctx) as res:
                    if self.error is not None:
                        log('Ereignis-Stream verbunden')
                    self.error = None
                    for data in parse_sse(res):
                        try:
                            event = json.loads(data)
                        except ValueError:
                            continue
                        if isinstance(event, dict):
                            self.on_event(event, 0.0)
                raise RuntimeError('Verbindung beendet')
            except Exception as e:
                msg = f'Ereignis-Stream: {e}'
                if msg != self.error:
                    log(msg + ' (neuer Versuch alle 10 s)')
                self.error = msg
            time.sleep(10)


class RadarStream:
    """
    Sendet Live-Bilder des Präsenzradars an POST /api/kiosk/radar, solange HomeApp sie anfordert (jemand hat die
    Radar-Seite offen). Jede Antwort sagt, ob noch jemand zusieht; ohne Antwort endet der Stream nach `linger` s.
    Die Verbindung bleibt dabei offen (keep-alive), damit nicht jedes Bild einen neuen TLS-Aufbau kostet.
    """

    def __init__(self, url: str, insecure: bool, agent_id: str, frame, on_idle, interval: float = RADAR_INTERVAL, linger: float = RADAR_LINGER):
        u = urllib.parse.urlsplit(url)
        self.https = u.scheme == 'https'
        self.host, self.port = u.hostname, u.port
        self.path = urllib.parse.urlunsplit(('', '', u.path, u.query, ''))
        self.ctx = ssl._create_unverified_context() if insecure and self.https else None
        self.agent_id = agent_id
        self.frame = frame
        self.on_idle = on_idle
        self.interval = interval
        self.linger = linger
        self.until = 0.0
        self.requests = 0
        self.conn: Optional[http.client.HTTPConnection] = None
        self.error: Optional[str] = None
        self.wakeup = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    def request(self):
        """Der Server möchte Live-Bilder (Ereignis-Stream oder Antwort auf eine Meldung)."""
        self.requests += 1
        self.until = time.monotonic() + self.linger
        self.wakeup.set()

    def _post(self, body: dict) -> dict:
        if self.conn is None:
            if self.https:
                self.conn = http.client.HTTPSConnection(self.host, self.port, timeout=5, context=self.ctx)
            else:
                self.conn = http.client.HTTPConnection(self.host, self.port, timeout=5)
        self.conn.request('POST', self.path, body=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        res = self.conn.getresponse()
        data = res.read()
        if res.status != 200:
            raise RuntimeError(f'HTTP {res.status}' + (' (Token falsch?)' if res.status == 403 else ''))
        return json.loads(data or b'{}')

    def _close(self):
        conn, self.conn = self.conn, None
        if conn is not None:
            conn.close()

    def _run(self):
        active = False
        while True:
            if time.monotonic() >= self.until:
                self._close()
                if active:
                    active = False
                    log('Radar-Live-Ansicht beendet')
                    self.on_idle()
                self.wakeup.wait()
                self.wakeup.clear()
                continue
            if not active:
                active = True
                log('Radar-Live-Ansicht gestartet')
            started = time.monotonic()
            requests = self.requests
            try:
                answer = self._post({'id': self.agent_id, 'radar': self.frame()})
                self.error = None
                if answer.get('live'):
                    self.until = max(self.until, time.monotonic() + self.linger)
                elif self.requests == requests:  # a request during this post wins over its answer
                    self.until = 0.0
            except Exception as e:
                self._close()
                msg = f'Radar-Live-Ansicht: {e}'
                if msg != self.error:
                    log(msg)
                self.error = msg
                time.sleep(1)
            time.sleep(max(0.0, self.interval - (time.monotonic() - started)))


# --------------------------------------------------------------------------- Agent


class Agent:
    def __init__(self, config: dict):
        self.config = config
        self.settings = dict(DEFAULT_SETTINGS)
        self.sensors: dict = {}
        self.sensor_errors: dict = {}
        self.retry_at: dict = {}
        self.timer = PresenceTimer()
        self.smoother = BrightnessSmoother()
        self.display: Optional[Display] = None
        self.display_error: Optional[str] = None
        self.values: dict = {}
        self.last_report = 0.0
        self.reported_key = None
        self.lux_at = self.co2_at = 0.0
        self.wake_lock = threading.Lock()
        self.wake_seen = collections.deque(maxlen=50)  # ids: the stream and the reports deliver the same event
        self.radar_stream: Optional[RadarStream] = None
        self.engineering = False  # LD2410 switched to engineering mode for the live radar
        try:
            self.display = Display(config['display'])
            log('Display-Steuerung:', self.display.method)
        except Exception as e:
            self.display_error = str(e)
            log(e)
        if config.get('touch_wake', True):
            TouchWatcher(self.timer.touched)

    def on_wake(self, event: dict, age: float):
        """Weck-Ereignis des Servers (`age` = Sekunden seit dem Ereignis)."""
        wid = event.get('id')
        with self.wake_lock:
            if not wid or wid in self.wake_seen:
                return
            self.wake_seen.append(wid)
        remaining = float(self.settings['wakeSeconds']) - age
        if remaining <= 0:
            return
        what = f'{event.get("reason")} {event.get("title") or ""}'.strip()
        if not should_wake(event, self.settings, self.timer.clock()):
            log('Weck-Ereignis ignoriert (Ruhezeit oder Einstellung):', what)
            return
        self.timer.wake(remaining)
        log('Display geweckt:', what)

    def on_event(self, event: dict, age: float):
        """Ereignis des Servers: Anforderung des Live-Radars oder Weck-Ereignis."""
        if event.get('type') == 'radar':
            self.request_radar()
        else:
            self.on_wake(event, age)

    def request_radar(self):
        """Jemand hat die Radar-Seite offen: Live-Bilder senden (nur mit Präsenzradar)."""
        if self.radar_stream is not None and self.config.get('ld2410', {}).get('enabled', True):
            self.radar_stream.request()

    def radar_frame(self) -> dict:
        """Live-Bild für den Radar-Stream (läuft in dessen Thread); schaltet den Engineering-Modus beim ersten Bild ein."""
        radar = self.sensors.get('ld2410')
        if radar is None:
            return {'mode': 'none', 'error': self.sensor_errors.get('ld2410') or 'LD2410: noch nicht bereit'}
        if not self.engineering and radar.serial is not None:
            self.engineering = True
            try:
                radar.set_engineering(True)
            except Exception as e:
                log(f'LD2410: Engineering-Modus nicht verfügbar ({e})')
        cfg = self.config.get('ld2410', {})
        try:
            return radar.radar(int(self.settings['presenceMaxDistance']), int(cfg.get('gate_cm', 75)))
        except Exception as e:
            return {'mode': 'none', 'error': str(e)}

    def radar_idle(self):
        """Niemand sieht mehr zu: den Radar wieder in den normalen Modus schalten."""
        radar = self.sensors.get('ld2410')
        if self.engineering and radar is not None:
            self.engineering = False
            try:
                radar.set_engineering(False)
            except Exception as e:
                log(f'LD2410: Engineering-Modus nicht ausgeschaltet ({e})')

    # sensors are (re)opened lazily so a missing sensor only produces an error and a retry every minute
    def sensor(self, name: str):
        cfg = self.config.get(name, {})
        if not cfg.get('enabled', True):
            return None
        if name in self.sensors:
            return self.sensors[name]
        if time.monotonic() < self.retry_at.get(name, 0):
            return None
        try:
            if name == 'ld2410':
                s = LD2410(cfg)
            elif name == 'bh1750':
                s = BH1750(cfg)
            else:
                s = SCD41(cfg, int(self.settings['co2Altitude']))
            self.sensors[name] = s
            self.sensor_errors.pop(name, None)
            log(f'{name} bereit')
            return s
        except Exception as e:
            self.fail(name, e)
            return None

    def fail(self, name: str, e: Exception):
        msg = str(e) if name.upper() in str(e).upper() else f'{name.upper()}: {e}'
        if self.sensor_errors.get(name) != msg:
            log(msg)
        self.sensor_errors[name] = msg
        self.retry_at[name] = time.monotonic() + 60
        s = self.sensors.pop(name, None)
        if s is not None and name != 'ld2410' and hasattr(s, 'dev'):
            try:
                s.dev.close()
            except OSError:
                pass

    def measure(self):
        now = time.monotonic()
        s = self.settings
        radar = self.sensor('ld2410')
        presence = None
        if radar:
            try:
                r = radar.read(int(s['presenceMaxDistance']))
                presence = r['presence']
                self.values.update(r)
                self.sensor_errors.pop('ld2410', None)
            except Exception as e:
                self.sensor_errors['ld2410'] = str(e)  # thread keeps trying; no re-open needed
        for key in ('presence', 'moving', 'still', 'distance'):
            if presence is None:
                self.values.pop(key, None)
        if now - self.lux_at >= 2:
            self.lux_at = now
            light = self.sensor('bh1750')
            if light:
                try:
                    self.values.update(light.read())
                except Exception as e:
                    self.values.pop('lux', None)
                    self.fail('bh1750', e)
        if now - self.co2_at >= 5:
            co2 = self.sensor('scd41')
            self.co2_at = time.monotonic()
            if co2:
                try:
                    v = co2.read(int(s['co2Altitude']))
                    if v is not None:
                        v['temperature'] = round(v['temperature'] + float(s['temperatureOffset']), 1)
                        self.values.update(v)
                except Exception as e:
                    for k in ('co2', 'temperature', 'humidity'):
                        self.values.pop(k, None)
                    self.fail('scd41', e)
        return presence

    def control(self, presence: Optional[bool]):
        if not self.display:
            return
        on = self.timer.screen_on(presence, self.settings)
        try:
            if on:
                if self.settings['autoBrightness'] and 'lux' in self.values:
                    target = brightness_for(self.values['lux'], self.settings)
                else:  # no light sensor (or automatic brightness off): fixed dim times
                    target = scheduled_brightness(self.settings, self.timer.clock())
                self.display.set_brightness(self.smoother.update(target))
            self.display.set_power(on)
            self.display_error = None
        except Exception as e:
            msg = f'Display ({self.display.method}): {getattr(e, "stderr", None) or e}'
            if msg != self.display_error:
                log(msg)
            self.display_error = msg

    def payload(self) -> dict:
        errors = list(self.sensor_errors.values()) + ([self.display_error] if self.display_error else [])
        display = {'method': self.display.method if self.display else 'none'}
        if self.display and self.display.on is not None:
            display['on'] = self.display.on
            display['wake'] = self.timer.forced(self.settings)
        if self.display and self.display.brightness is not None and self.display.dims:
            display['brightness'] = self.display.brightness
        live_radar = self.config.get('ld2410', {}).get('enabled', True) and bool(radar_url(self.config.get('url', '')))
        return {
            'id': self.config['id'],
            'name': self.config.get('name') or self.config['id'],
            'version': VERSION,
            'features': ['radar'] if live_radar else [],
            'sensors': self.values,
            'display': display,
            'errors': errors,
        }

    def report(self):
        url = self.config['url']
        if not url:
            return
        data = json.dumps(self.payload()).encode()
        req = urllib.request.Request(url, data=data, method='POST', headers={'Content-Type': 'application/json'})
        ctx = ssl._create_unverified_context() if self.config.get('insecure_tls', True) and url.startswith('https') else None
        try:
            with urllib.request.urlopen(req, timeout=8, context=ctx) as res:
                answer = json.loads(res.read() or b'{}')
            if isinstance(answer.get('settings'), dict):
                self.settings = merge(DEFAULT_SETTINGS, answer['settings'])
            wake = answer.get('wake')
            if isinstance(wake, dict):  # fallback if the event stream is interrupted (e.g. by a proxy)
                self.on_wake(wake, float(wake.get('ageMs') or 0) / 1000)
            if answer.get('radar') is True:  # same fallback for the live radar
                self.request_radar()
        except urllib.error.HTTPError as e:
            log(f'Melden fehlgeschlagen: HTTP {e.code}' + (' (Token falsch?)' if e.code == 403 else ''))
        except Exception as e:
            log(f'Melden fehlgeschlagen: {e}')

    def loop(self):
        log(f'HomeApp Kiosk-Agent {VERSION} als „{self.config["id"]}“ → {self.config["url"].split("?")[0] or "(keine URL)"}')
        insecure = self.config.get('insecure_tls', True)
        if radar_url(self.config['url']):
            self.radar_stream = RadarStream(radar_url(self.config['url']), insecure, self.config['id'], self.radar_frame, self.radar_idle)
        if events_url(self.config['url']):
            WakeStream(events_url(self.config['url']), insecure, self.on_event)
        fd_checked = time.monotonic()
        while True:
            presence = self.measure()
            self.control(presence)
            now = time.monotonic()
            # presence and screen changes are reported right away, everything else in the interval
            key = (self.values.get('presence'), self.display.on if self.display else None, self.timer.forced(self.settings))
            if now - self.last_report >= float(self.settings['intervalSeconds']) or (key != self.reported_key and now - self.last_report >= 1):
                self.reported_key = key
                self.last_report = now
                self.report()
            # safety net: with no descriptors left the display can no longer be switched, so let systemd restart us
            if now - fd_checked >= 60:
                fd_checked = now
                if fds_nearly_exhausted():
                    log('Fast alle Dateideskriptoren belegt (Leck?), beende den Agenten; systemd startet ihn neu')
                    sys.exit(1)
            time.sleep(0.5)


def load_config(path: str) -> dict:
    with open(path) as f:
        cfg = merge(DEFAULT_CONFIG, json.load(f))
    cfg['id'] = str(cfg['id']).strip().lower()
    return cfg


def main(argv=None):
    p = argparse.ArgumentParser(description='HomeApp Kiosk-Agent (LD2410, BH1750, SCD41, Display-Steuerung)')
    p.add_argument('--config', default='/etc/homeapp-kiosk.json')
    p.add_argument('--once', action='store_true', help='Sensoren einmal lesen, Werte ausgeben und beenden')
    p.add_argument('--test-display', action='store_true', help='Display 5 s aus- und wieder einschalten')
    args = p.parse_args(argv)
    agent = Agent(load_config(args.config))
    if args.test_display:
        if not agent.display:
            sys.exit(agent.display_error or 'keine Display-Steuerung')
        agent.display.set_power(False)
        time.sleep(5)
        agent.display.set_power(True)
        return
    if args.once:
        deadline = time.monotonic() + 7  # the SCD41 needs up to 5 s for its first value
        while time.monotonic() < deadline:
            agent.measure()
            time.sleep(0.5)
        print(json.dumps(agent.payload(), indent=2, ensure_ascii=False))
        return
    agent.loop()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
