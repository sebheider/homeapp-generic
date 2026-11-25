"""Unittests des Kiosk-Agenten (ohne Hardware): python3 -m unittest discover -s tests"""
import datetime
import http.server
import io
import json
import os
import struct
import sys
import threading
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import homeapp_kiosk as k  # noqa: E402


def ld_frame(state, mov_d=0, mov_e=0, still_d=0, still_e=0, det_d=0, kind=0x02):
    payload = bytes([kind, 0xAA]) + struct.pack('<BHBHBH', state, mov_d, mov_e, still_d, still_e, det_d) + b'\x55\x00'
    return k.LD_HEAD + struct.pack('<H', len(payload)) + payload + k.LD_TAIL


class Crc(unittest.TestCase):
    def test_datasheet_example(self):
        self.assertEqual(k.sensirion_crc(b'\xbe\xef'), 0x92)  # Beispiel aus dem SCD4x-Datenblatt

    def test_scd41_words_and_conversion(self):
        words = [600, 0x6667, 0x5EB9]
        data = b''.join(struct.pack('>H', w) + bytes([k.sensirion_crc(struct.pack('>H', w))]) for w in words)
        v = k.scd41_convert(k.scd41_words(data))
        self.assertEqual(v['co2'], 600)
        self.assertAlmostEqual(v['temperature'], 25.0, delta=0.1)
        self.assertAlmostEqual(v['humidity'], 37.0, delta=0.1)
        broken = bytearray(data)
        broken[2] ^= 1
        with self.assertRaises(RuntimeError):
            k.scd41_words(bytes(broken))


class Ld2410(unittest.TestCase):
    def test_parses_frames_split_over_reads_with_noise(self):
        p = k.LD2410Parser()
        stream = b'\x00\x13' + ld_frame(1, mov_d=120, mov_e=60) + b'\xff' + ld_frame(2, still_d=80, still_e=40)
        frames = p.feed(stream[:9]) + p.feed(stream[9:20]) + p.feed(stream[20:])
        self.assertEqual([f['state'] for f in frames], [1, 2])
        self.assertEqual(frames[0]['moving_distance'], 120)
        self.assertTrue(frames[1]['still'])
        self.assertFalse(frames[1]['moving'])

    def test_engineering_mode_head_is_read(self):
        payload = bytes([0x01, 0xAA]) + struct.pack('<BHBHBH', 3, 50, 70, 60, 30, 55) + bytes(20) + b'\x55\x00'
        frame = k.LD_HEAD + struct.pack('<H', len(payload)) + payload + k.LD_TAIL
        (f,) = k.LD2410Parser().feed(frame)
        self.assertEqual((f['moving_distance'], f['still_distance']), (50, 60))

    def test_presence_with_max_distance(self):
        (f,) = k.LD2410Parser().feed(ld_frame(3, mov_d=250, still_d=180))
        self.assertEqual(k.ld2410_presence(f, 0), (True, 180))
        self.assertEqual(k.ld2410_presence(f, 200), (True, 180))
        self.assertEqual(k.ld2410_presence(f, 150), (False, 180))
        (none,) = k.LD2410Parser().feed(ld_frame(0))
        self.assertEqual(k.ld2410_presence(none, 0), (False, 0))


class Scd41Startup(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.started_at = None
        self.ready = True
        self.device = mock.Mock()
        self.device.write.side_effect = self.write
        self.device.read.side_effect = self.read
        for patch in (
            mock.patch.object(k, 'I2CDevice', return_value=self.device),
            mock.patch.object(k.time, 'monotonic', side_effect=lambda: self.now),
            mock.patch.object(k.time, 'sleep', side_effect=self.sleep),
            mock.patch.object(k, 'log'),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    def sleep(self, seconds):
        self.now += seconds

    def write(self, data):
        if data == b'\x21\xb1':
            self.started_at = self.now

    def read(self, size):
        if size == 3:
            words = [int(self.ready and self.now - self.started_at >= 5)]
        else:
            self.assertEqual(size, 9)
            words = [600, 0x6667, 0x5EB9]
        return b''.join(struct.pack('>H', w) + bytes([k.sensirion_crc(struct.pack('>H', w))]) for w in words)

    def test_waits_for_first_measurement_and_reports_stale_values(self):
        sensor = k.SCD41({}, 0)
        self.assertIsNone(sensor.read(0))
        self.sleep(5)
        self.assertEqual(sensor.read(0)['co2'], 600)
        self.ready = False
        self.sleep(20)
        self.assertEqual(sensor.read(0)['co2'], 600)
        self.sleep(11)
        with self.assertRaisesRegex(RuntimeError, 'keine Messwerte'):
            sensor.read(0)

    def test_missing_first_measurement_times_out(self):
        sensor = k.SCD41({}, 0)
        self.ready = False
        self.sleep(29)
        self.assertIsNone(sensor.read(0))
        self.sleep(2)
        with self.assertRaisesRegex(RuntimeError, 'keine Messwerte'):
            sensor.read(0)

    def test_io_errors_are_not_hidden_during_startup(self):
        sensor = k.SCD41({}, 0)
        self.device.read.side_effect = OSError(121, 'Remote I/O error')
        with self.assertRaises(OSError):
            sensor.read(0)

    def config(self):
        return k.merge(k.DEFAULT_CONFIG, {
            'display': {'method': 'none'}, 'touch_wake': False,
            'ld2410': {'enabled': False}, 'bh1750': {'enabled': False},
        })

    def test_once_includes_first_measurement_without_reopening_sensor(self):
        output = io.StringIO()
        with mock.patch.object(k, 'load_config', return_value=self.config()), mock.patch.object(sys, 'stdout', output):
            k.main(['--once'])
        payload = json.loads(output.getvalue())
        self.assertEqual(payload['errors'], [])
        self.assertEqual(payload['sensors'], {'co2': 600, 'temperature': 25.0, 'humidity': 37.0})
        self.device.close.assert_not_called()
        starts = [call for call in self.device.write.call_args_list if call == mock.call(b'\x21\xb1')]
        self.assertEqual(len(starts), 1)

    def test_agent_retries_after_startup_timeout(self):
        agent = k.Agent(self.config())
        self.ready = False
        agent.measure()
        self.assertEqual(agent.sensor_errors, {})
        self.sleep(31)
        agent.measure()
        self.assertIn('keine Messwerte', agent.sensor_errors['scd41'])
        self.assertNotIn('scd41', agent.sensors)
        self.device.close.assert_called_once()
        self.sleep(61)
        self.ready = True
        agent.measure()
        self.assertEqual(agent.sensor_errors, {})
        self.sleep(5)
        agent.measure()
        self.assertEqual(agent.values['co2'], 600)


class Brightness(unittest.TestCase):
    s = dict(k.DEFAULT_SETTINGS, minBrightness=10, maxBrightness=100, luxDark=5, luxBright=500)

    def test_curve(self):
        self.assertEqual(k.brightness_for(0, self.s), 10)
        self.assertEqual(k.brightness_for(5, self.s), 10)
        self.assertEqual(k.brightness_for(50, self.s), 55)  # logarithmic middle
        self.assertEqual(k.brightness_for(1000, self.s), 100)
        self.assertEqual(k.brightness_for(None, self.s), 100)

    def test_smoother_moves_towards_target(self):
        sm = k.BrightnessSmoother()
        self.assertEqual(sm.update(80), 80)
        steps = [sm.update(20) for _ in range(30)]
        self.assertTrue(80 > steps[0] > 20)
        self.assertEqual(steps[-1], 20)


class Presence(unittest.TestCase):
    def test_screen_off_after_timeout_and_touch_wakes(self):
        t = [0.0]
        timer = k.PresenceTimer(now=lambda: t[0])
        s = dict(k.DEFAULT_SETTINGS, screenOffSeconds=60)
        self.assertTrue(timer.screen_on(True, s))
        t[0] = 59
        self.assertTrue(timer.screen_on(False, s))
        t[0] = 61
        self.assertFalse(timer.screen_on(False, s))
        timer.touched()
        self.assertTrue(timer.screen_on(False, s))
        t[0] = 200
        self.assertFalse(timer.screen_on(False, s))

    def test_fail_safe_without_sensor_or_when_disabled(self):
        t = [1000.0]
        timer = k.PresenceTimer(now=lambda: t[0])
        timer.last_active = 0
        self.assertTrue(timer.screen_on(None, k.DEFAULT_SETTINGS))
        timer.last_active = 0
        self.assertTrue(timer.screen_on(False, dict(k.DEFAULT_SETTINGS, screenOff=False)))


# Montag, 2. November 2026 (JavaScript-Wochentag 1)
MONDAY = datetime.datetime(2026, 11, 2)


def at(day_offset, hh, mm=0):
    return MONDAY + datetime.timedelta(days=day_offset, hours=hh, minutes=mm)


class Windows(unittest.TestCase):
    def test_same_semantics_as_the_server(self):
        work = {'days': [1, 2, 3, 4, 5], 'from': '06:30', 'to': '08:00'}
        self.assertTrue(k.in_window(work, at(0, 6, 30)))
        self.assertFalse(k.in_window(work, at(0, 8, 0)))  # Bis-Zeit gilt nicht mehr
        self.assertFalse(k.in_window(work, at(6, 7)))  # Sonntag
        night = {'days': [5], 'from': '22:00', 'to': '06:00'}  # Freitagnacht
        self.assertTrue(k.in_window(night, at(4, 23)))
        self.assertTrue(k.in_window(night, at(5, 5, 59)))  # Samstagmorgen gehört zum Freitag
        self.assertFalse(k.in_window(night, at(0, 5)))
        self.assertTrue(k.in_window({'days': [], 'from': '00:00', 'to': '00:00'}, at(3, 12)))  # ganztägig, alle Tage
        self.assertEqual(k.to_minutes('24:00'), 1440)
        self.assertIsNone(k.to_minutes('25:00'))
        self.assertFalse(k.in_any_window(None, at(0, 1)))

    def test_should_wake_respects_settings_and_quiet_hours(self):
        s = dict(k.DEFAULT_SETTINGS)
        cam = {'reason': 'camera', 'severity': 'warning'}
        info = {'reason': 'alert', 'severity': 'info'}
        alarm = {'reason': 'alert', 'severity': 'alarm'}
        self.assertTrue(k.should_wake(cam, s, at(0, 12)))
        self.assertTrue(k.should_wake(info, s, at(0, 12)))
        self.assertFalse(k.should_wake(alarm, s, at(0, 23)))  # Standard-Ruhezeit 22–6 Uhr
        self.assertFalse(k.should_wake(cam, s, at(1, 3)))
        self.assertFalse(k.should_wake(cam, dict(s, wakeOnCamera=False), at(0, 12)))
        self.assertFalse(k.should_wake(info, dict(s, wakeSeverity='warning'), at(0, 12)))
        self.assertTrue(k.should_wake(alarm, dict(s, wakeSeverity='warning'), at(0, 12)))
        self.assertFalse(k.should_wake(alarm, dict(s, wakeOnAlerts=False), at(0, 12)))
        self.assertTrue(k.should_wake(alarm, dict(s, quietHours=[]), at(0, 23)))


class Schedule(unittest.TestCase):
    def test_always_on_and_wake_keep_the_screen_on(self):
        t = [1000.0]
        clock = [at(0, 7)]
        timer = k.PresenceTimer(now=lambda: t[0], clock=lambda: clock[0])
        timer.last_active = 0
        s = dict(k.DEFAULT_SETTINGS, screenOffSeconds=60, alwaysOn=[{'days': [1], 'from': '06:30', 'to': '08:00'}])
        self.assertTrue(timer.screen_on(False, s))
        self.assertTrue(timer.forced(s))
        clock[0] = at(0, 8, 1)
        self.assertFalse(timer.screen_on(False, s))
        timer.wake(120)
        self.assertTrue(timer.screen_on(False, s))
        t[0] += 121
        self.assertFalse(timer.screen_on(False, s))
        self.assertFalse(timer.forced(s))

    def test_off_times_without_presence_sensor(self):
        t = [1000.0]
        clock = [at(0, 22)]
        timer = k.PresenceTimer(now=lambda: t[0], clock=lambda: clock[0])
        s = dict(k.DEFAULT_SETTINGS, screenOffSeconds=60, offTimes=[{'days': [], 'from': '23:00', 'to': '06:00'}])
        self.assertTrue(timer.screen_on(None, s))
        clock[0] = at(0, 23)
        t[0] += 59
        self.assertTrue(timer.screen_on(None, s))  # Übergang: noch screenOffSeconds an
        t[0] += 2
        self.assertFalse(timer.screen_on(None, s))
        timer.touched()
        self.assertTrue(timer.screen_on(None, s))
        t[0] += 61
        self.assertFalse(timer.screen_on(None, s))
        timer.wake(30)  # Weck-Ereignis
        self.assertTrue(timer.screen_on(None, s))
        t[0] += 31
        self.assertFalse(timer.screen_on(None, s))
        # gilt auch mit Radar, wenn die Präsenz-Abschaltung aus ist
        self.assertFalse(timer.screen_on(True, dict(s, screenOff=False)))
        clock[0] = at(1, 6)
        self.assertTrue(timer.screen_on(None, s))

    def test_scheduled_brightness(self):
        s = dict(k.DEFAULT_SETTINGS, minBrightness=20, maxBrightness=90, dimTimes=[{'days': [], 'from': '21:00', 'to': '07:00'}])
        self.assertEqual(k.scheduled_brightness(s, at(0, 12)), 90)
        self.assertEqual(k.scheduled_brightness(s, at(0, 22)), 20)
        self.assertEqual(k.scheduled_brightness(dict(s, minBrightness=95), at(0, 22)), 90)  # vertauscht
        self.assertEqual(k.scheduled_brightness(k.DEFAULT_SETTINGS, at(0, 22)), 100)
        # eigene Werte für gedimmt / hell (ab Server 1.29)
        own = dict(s, dimBrightness=5, fullBrightness=60)
        self.assertEqual(k.scheduled_brightness(own, at(0, 12)), 60)
        self.assertEqual(k.scheduled_brightness(own, at(0, 22)), 5)

    def test_agent_wakes_once_per_event_and_not_in_quiet_hours(self):
        agent = k.Agent.__new__(k.Agent)  # ohne Hardware
        t = [0.0]
        clock = [at(0, 12)]
        agent.settings = dict(k.DEFAULT_SETTINGS, wakeSeconds=100)
        agent.timer = k.PresenceTimer(now=lambda: t[0], clock=lambda: clock[0])
        agent.timer.last_active = -1000
        agent.wake_lock = k.threading.Lock()
        agent.wake_seen = k.collections.deque(maxlen=50)
        agent.on_wake({'id': 'a', 'reason': 'camera'}, 30)
        self.assertEqual(agent.timer.wake_until, 70)  # Restzeit
        agent.on_wake({'id': 'b', 'reason': 'alert', 'severity': 'info'}, 150)  # schon abgelaufen
        self.assertEqual(agent.timer.wake_until, 70)
        clock[0] = at(0, 23)
        agent.on_wake({'id': 'c', 'reason': 'camera'}, 0)  # Ruhezeit
        self.assertEqual(agent.timer.wake_until, 70)
        clock[0] = at(0, 12)
        agent.on_wake({'id': 'c', 'reason': 'camera'}, 0)  # schon gesehen (Stream und Meldung)
        self.assertEqual(agent.timer.wake_until, 70)


class Events(unittest.TestCase):
    def test_events_url(self):
        self.assertEqual(k.events_url('https://h:8443/api/kiosk/report?token=abc'), 'https://h:8443/api/kiosk/events?token=abc')
        self.assertEqual(k.radar_url('https://h:8443/api/kiosk/report?token=abc'), 'https://h:8443/api/kiosk/radar?token=abc')
        self.assertEqual(k.events_url('https://h/sonstwas'), '')
        self.assertEqual(k.radar_url(''), '')

    def test_parse_sse(self):
        lines = [b'retry: 5000\n', b'\n', b': ping\n', b'\n', b'data: {"id": "a"}\r\n', b'\n', b'data:x\n', b'data: y\n', b'\n']
        self.assertEqual(list(k.parse_sse(lines)), ['{"id": "a"}', 'x\ny'])


# Engineering-Frame aus dem LD2410-Protokoll (V1.02): Bewegung 30 cm, ruhend 0 cm, Tore 0 … 8, Licht und OUT
ENGINEERING_FRAME = bytes.fromhex(
    'f4f3f2f1 2300 01aa 03 1e00 3c 0000 39 0000 08 08 3c22050303040306 05 0000391013060608 04 0305 5500 f8f7f6f5'.replace(' ', ''))


class LiveRadar(unittest.TestCase):
    def test_engineering_frame_has_the_energy_per_gate(self):
        (f,) = k.LD2410Parser().feed(ENGINEERING_FRAME)
        self.assertEqual((f['moving_distance'], f['moving_energy']), (30, 60))
        self.assertEqual(f['moving_gates'], [0x3C, 0x22, 5, 3, 3, 4, 3, 6, 5])
        self.assertEqual(f['still_gates'], [0, 0, 0x39, 0x10, 0x13, 6, 6, 8, 4])
        (basic,) = k.LD2410Parser().feed(ld_frame(1, mov_d=120, mov_e=60))
        self.assertNotIn('moving_gates', basic)

    def test_commands_match_the_datasheet(self):
        self.assertEqual(k.ld2410_command(0x00FF, b'\x01\x00').hex(), 'fdfcfbfa0400ff00010004030201')
        self.assertEqual(k.ld2410_command(0x0062).hex(), 'fdfcfbfa0200620004030201')
        self.assertEqual(k.ld2410_command(0x00FE).hex(), 'fdfcfbfa0200fe0004030201')

    def test_radar_payload(self):
        (f,) = k.LD2410Parser().feed(ENGINEERING_FRAME)
        p = k.radar_payload(f, 0, 75)
        self.assertEqual(p['mode'], 'engineering')
        self.assertTrue(p['presence'])
        self.assertEqual(p['moving'], {'distance': 30, 'energy': 60})
        self.assertEqual(p['still'], {'distance': 0, 'energy': 0x39})
        self.assertEqual(len(p['gates']['moving']), 9)
        (far,) = k.LD2410Parser().feed(ld_frame(1, mov_d=420, mov_e=50))
        p = k.radar_payload(far, 300, 75)
        self.assertEqual((p['mode'], p['presence'], p['still']), ('basic', False, None))
        self.assertEqual(p['moving'], {'distance': 420, 'energy': 50})  # shown beyond the limit, but no presence
        json.dumps(p)

    def agent(self, radar):
        agent = k.Agent.__new__(k.Agent)  # ohne Hardware
        agent.config = {'id': 'flur', 'ld2410': {'enabled': True, 'gate_cm': 20}}
        agent.settings = dict(k.DEFAULT_SETTINGS)
        agent.sensors = {'ld2410': radar} if radar else {}
        agent.sensor_errors = {} if radar else {'ld2410': 'LD2410: keine Daten'}
        agent.engineering = False
        agent.radar_stream = mock.Mock()
        return agent

    def test_engineering_mode_only_while_someone_watches(self):
        radar = mock.Mock(serial=object())
        radar.radar.return_value = {'mode': 'basic'}
        agent = self.agent(radar)
        agent.on_event({'type': 'radar'}, 0.0)
        agent.radar_stream.request.assert_called_once()
        self.assertEqual(agent.radar_frame(), {'mode': 'basic'})
        agent.radar_frame()
        radar.set_engineering.assert_called_once_with(True)
        radar.radar.assert_called_with(0, 20)
        agent.radar_idle()
        radar.set_engineering.assert_called_with(False)
        agent.radar_idle()
        self.assertEqual(radar.set_engineering.call_count, 2)

    def test_frame_without_radar_carries_the_error(self):
        agent = self.agent(None)
        self.assertEqual(agent.radar_frame(), {'mode': 'none', 'error': 'LD2410: keine Daten'})
        agent.config['ld2410']['enabled'] = False
        agent.request_radar()
        agent.radar_stream.request.assert_not_called()

    def radar_server(self, live_posts: int):
        """Kleiner HTTP-Server mit keep-alive: die ersten `live_posts` Antworten sagen live."""
        posts, ports = [], set()

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'  # keep-alive

            def do_POST(self):
                posts.append((self.path, json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                ports.add(self.client_address[1])
                body = json.dumps({'ok': True, 'live': len(posts) <= live_posts}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f'http://127.0.0.1:{server.server_port}/api/kiosk/radar?token=abc', posts, ports

    def run_stream(self, url, frame):
        idle = threading.Event()
        with mock.patch.object(k, 'log'):
            stream = k.RadarStream(url, False, 'flur', lambda: frame(stream), idle.set, interval=0.01, linger=5)
            stream.request()
            self.assertTrue(idle.wait(5))
        return stream

    def test_stream_posts_frames_over_one_connection_until_nobody_watches(self):
        url, posts, ports = self.radar_server(3)
        stream = self.run_stream(url, lambda s: {'mode': 'basic', 'presence': True})
        self.assertEqual(len(posts), 4)
        self.assertEqual(posts[0], ('/api/kiosk/radar?token=abc', {'id': 'flur', 'radar': {'mode': 'basic', 'presence': True}}))
        self.assertEqual(len(ports), 1)
        self.assertIsNone(stream.conn)

    def test_request_during_a_post_wins_over_its_answer(self):
        url, posts, _ = self.radar_server(0)

        def frame(stream):
            if not posts:  # the radar page was opened again while the first frame is on its way
                stream.request()
            return {'mode': 'basic'}

        self.run_stream(url, frame)
        self.assertEqual(len(posts), 2)


class SensorRetry(unittest.TestCase):
    """Ein fehlender I²C-Sensor wird jede Minute neu versucht und darf dabei keine Dateideskriptoren verlieren."""

    def setUp(self):
        self.open_fds = set()
        self.opened = 0

        def fake_open(path, flags):
            self.opened += 1
            self.open_fds.add(self.opened)
            return self.opened

        def fake_write(fd, data):
            raise OSError(121, 'Remote I/O error')  # Sensor antwortet nicht

        self.fcntl = types.SimpleNamespace(ioctl=lambda fd, request, arg: None)
        patches = (
            mock.patch.object(k.os, 'open', fake_open),
            mock.patch.object(k.os, 'close', self.open_fds.remove),
            mock.patch.object(k.os, 'write', fake_write),
            mock.patch.dict(sys.modules, {'fcntl': self.fcntl}),
            mock.patch.object(k, 'log'),
        )
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_missing_sensors_do_not_leak_descriptors(self):
        agent = k.Agent.__new__(k.Agent)  # ohne Hardware
        agent.config = {'bh1750': {'enabled': True}, 'scd41': {'enabled': True}}
        agent.settings = dict(k.DEFAULT_SETTINGS)
        agent.sensors, agent.sensor_errors, agent.retry_at = {}, {}, {}
        for _ in range(5):
            agent.retry_at.clear()  # wie nach je einer Minute
            self.assertIsNone(agent.sensor('bh1750'))
            self.assertIsNone(agent.sensor('scd41'))
        self.assertEqual(self.opened, 10)
        self.assertEqual(self.open_fds, set())
        self.assertIn('Remote I/O error', agent.sensor_errors['bh1750'])
        self.assertIn('Remote I/O error', agent.sensor_errors['scd41'])

    def test_busy_address_closes_the_bus(self):
        self.fcntl.ioctl = mock.Mock(side_effect=OSError(16, 'Device or resource busy'))
        with self.assertRaises(OSError):
            k.I2CDevice(1, 0x23)
        self.assertEqual(self.open_fds, set())


class FdWatch(unittest.TestCase):
    resource = types.SimpleNamespace(RLIMIT_NOFILE=7, RLIM_INFINITY=-1, getrlimit=lambda r: (1024, 524288))

    def exhausted(self, listdir, resource=resource):
        with mock.patch.dict(sys.modules, {'resource': resource}), mock.patch.object(k.os, 'listdir', listdir):
            return k.fds_nearly_exhausted()

    def test_detects_a_leak_before_the_limit(self):
        self.assertFalse(self.exhausted(lambda p: ['x'] * 30))
        self.assertTrue(self.exhausted(lambda p: ['x'] * 1000))
        self.assertTrue(self.exhausted(mock.Mock(side_effect=OSError(k.errno.EMFILE, 'Too many open files'))))

    def test_never_triggers_without_linux(self):
        self.assertFalse(self.exhausted(mock.Mock(side_effect=FileNotFoundError(2, 'kein /proc'))))
        self.assertFalse(self.exhausted(lambda p: ['x'] * 1000, resource=None))  # kein Modul resource (Windows)
        unlimited = types.SimpleNamespace(RLIMIT_NOFILE=7, RLIM_INFINITY=-1, getrlimit=lambda r: (-1, -1))
        self.assertFalse(self.exhausted(lambda p: ['x'] * 1000, resource=unlimited))


class Config(unittest.TestCase):
    def test_merge_keeps_nested_defaults(self):
        cfg = k.merge(k.DEFAULT_CONFIG, {'ld2410': {'port': '/dev/ttyUSB0'}, 'url': 'http://x'})
        self.assertEqual(cfg['ld2410']['port'], '/dev/ttyUSB0')
        self.assertEqual(cfg['ld2410']['baudrate'], 256000)
        self.assertEqual(cfg['url'], 'http://x')


if __name__ == '__main__':
    unittest.main()
