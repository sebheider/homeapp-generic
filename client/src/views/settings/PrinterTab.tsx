/**
 * Settings tab "3D-Drucker": kind of printer (OctoPrint or Bambu Lab via the local developer API), its
 * connection, webcam, overview display and the webcam pop-ups.
 */
import { Eye } from 'lucide-react';
import { useStore } from '../../lib/store';
import type { BambuCamera, BambuConfig, PopupPosition, PopupSize, PrinterType } from '../../lib/types';
import { Toggle } from '../../components/ui';
import { PrinterWebcam } from '../../components/Printer';
import { Card, Field, NumInput, Switch, dimUnless, sectionSetter, type TabProps } from './shared';

const POSITIONS: { value: PopupPosition; label: string }[] = [
  { value: 'corner', label: 'Klein in der Ecke' },
  { value: 'center', label: 'Mittig (über der App)' },
];
const SIZES: { value: PopupSize; label: string }[] = [
  { value: 'medium', label: 'Mittel' },
  { value: 'large', label: 'Groß' },
  { value: 'full', label: 'Fast Vollbild' },
];
const TYPES: { value: PrinterType; label: string }[] = [
  { value: 'octoprint', label: 'OctoPrint (Prusa, Creality, Voron …)' },
  { value: 'bambu', label: 'Bambu Lab (lokal, Entwicklermodus)' },
];
const BAMBU_CAMERAS: { value: BambuCamera; label: string }[] = [
  { value: 'auto', label: 'Automatisch (nach Modell)' },
  { value: 'jpeg', label: 'Einzelbilder – A1, A1 mini, P1P, P1S' },
  { value: 'rtsp', label: 'RTSP-Video über ffmpeg – X1, H2, P2S' },
  { value: 'url', label: 'Eigene MJPEG-Adresse (z. B. go2rtc)' },
  { value: 'off', label: 'Keine Kamera' },
];
const BAMBU_DEFAULTS: BambuConfig = { host: '', serial: '', camera: 'auto', streamUrl: '', controls: true };

export function PrinterTab({ draft, setDraft }: TabProps) {
  const op = draft.octoprint;
  const set = sectionSetter(draft, setDraft, 'octoprint');
  const bb = draft.bambu ?? BAMBU_DEFAULTS;
  const setBambu = (p: Partial<BambuConfig>) => setDraft({ ...draft, bambu: { ...bb, ...p } });
  const type = op.type ?? 'octoprint';
  const bambu = type === 'bambu';
  const status = useStore((s) => s.status?.printer);
  const printer = useStore((s) => s.printer);
  const preview = useStore((s) => s.showPrinterPopup);
  // the status belongs to the saved settings: only shown while the saved kind is the one selected
  const live = status?.enabled && !status.demo && (printer?.kind ?? 'octoprint') === type;

  return (
    <>
      <Card title="3D-Drucker" right={<Toggle checked={op.enabled} onChange={(v) => set({ enabled: v })} label="3D-Drucker" />}>
        {live && (
          status.connected ? (
            <p className="text-sm text-emerald-400 mb-3">
              ✓ Verbunden{printer?.user ? ` als ${printer.user}` : ''}{printer?.version ? ` · ${printer.version}` : ''}{printer?.name ? ` · ${printer.name}` : ''}
            </p>
          ) : (
            <p className="text-sm text-rose-400 mb-3">{status.error ?? 'Verbindet …'}</p>
          )
        )}
        {status?.demo && <p className="text-sm text-muted mb-3">Im Demo-Modus zeigt die App einen simulierten Drucker, solange keiner eingerichtet ist.</p>}
        <div className={`grid sm:grid-cols-2 gap-4 mb-4 ${dimUnless(op.enabled)}`}>
          <Field label="Druckertyp" hint={bambu ? 'Verbindet sich direkt mit dem Drucker im lokalen Netz – ohne Bambu-Cloud.' : 'Verbindet sich mit OctoPrint (OctoPi) über dessen REST-API.'}>
            <select className="field" value={type} onChange={(e) => set({ type: e.target.value as PrinterType })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Anzeigename" hint={bambu ? 'Leer = Modell des Druckers (z. B. Bambu Lab P1S).' : 'Leer = Name aus OctoPrint (Einstellungen → Darstellung).'}>
            <input className="field" value={op.name} maxLength={80} placeholder={printer?.name && printer.name !== 'OctoPrint' ? printer.name : bambu ? 'z. B. Bambu Lab P1S' : 'z. B. Prusa MK4'} onChange={(e) => set({ name: e.target.value })} />
          </Field>
        </div>
        {bambu ? <BambuFields bb={bb} set={setBambu} enabled={op.enabled} /> : (
        <>
        <div className={`grid sm:grid-cols-2 gap-4 ${dimUnless(op.enabled)}`}>
          <Field label="Host / IP von OctoPrint" hint="Eine kopierte Adresse wie http://octopi.local:5000 wird automatisch zerlegt.">
            <input className="field" value={op.host} placeholder="192.168.1.20" onChange={(e) => set({ host: e.target.value })} />
          </Field>
          <Field label="Port" hint="OctoPi: 80 (HTTP) oder 443 (HTTPS); OctoPrint ohne Proxy: 5000">
            <NumInput value={op.port} onChange={(v) => set({ port: v ?? 80 })} />
          </Field>
          {/* the stored key is never sent to the browser; an empty field keeps it */}
          <Field
            label="API-Key (Application Key)"
            hint={`${op.apiKeySet ? 'Gespeichert – leer lassen, um ihn zu behalten. ' : ''}In OctoPrint unter Einstellungen → Application Keys für einen Benutzer erzeugen. Benötigt mindestens die Rechte „Status“ und „Webcam“, für Name und Webcam-Adresse zusätzlich „Einstellungen lesen“.`}
          >
            <input className="field font-mono" type="password" autoComplete="new-password" value={op.apiKey ?? ''} placeholder={op.apiKeySet ? '••••••••••••••••' : ''} onChange={(e) => set({ apiKey: e.target.value })} />
          </Field>
          <Field label="Abfrage-Intervall (Sekunden)" hint="Wie oft Zustand, Fortschritt und Temperaturen gelesen werden (2–60).">
            <NumInput value={op.pollSeconds} onChange={(v) => set({ pollSeconds: v ?? 5 })} />
          </Field>
        </div>
        <div className={`mt-2 grid sm:grid-cols-2 gap-x-8 ${dimUnless(op.enabled)}`}>
          <Switch label="HTTPS verwenden" checked={op.https} onChange={(v) => set({ https: v })} />
          <Switch label="Zertifikat prüfen (aus bei selbstsigniert)" checked={op.verifySsl} onChange={(v) => set({ verifySsl: v })} />
        </div>
        </>
        )}
      </Card>

      <Card title="Webcam">
        <div className="grid sm:grid-cols-2 gap-4">
          <Switch label="Webcam als Live-Video anzeigen (flüssig, MJPEG)" checked={op.webcamLive !== false} onChange={(v) => set({ webcamLive: v })} />
          <Field label="Webcam-Bild in der App aktualisieren (Sekunden)" hint={op.webcamLive !== false ? 'Gilt nur, solange das Live-Video nicht verfügbar ist.' : undefined}>
            <NumInput value={op.webcamRefreshSeconds} onChange={(v) => set({ webcamRefreshSeconds: v ?? 2 })} />
          </Field>
          {bambu ? (
            <>
              <Field label="Kamera des Druckers" hint={CAMERA_HINT[bb.camera]}>
                <select className="field" value={bb.camera} onChange={(e) => setBambu({ camera: e.target.value as BambuCamera })}>
                  {BAMBU_CAMERAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              {bb.camera === 'url' && (
                <Field label="Adresse des Kamera-Streams" hint="MJPEG-Stream oder Standbild, z. B. von go2rtc: http://192.168.1.10:1984/api/stream.mjpeg?src=bambu">
                  <input className="field" value={bb.streamUrl} placeholder="http://…" onChange={(e) => setBambu({ streamUrl: e.target.value })} />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Adresse des Standbilds (optional)" hint="Leer = automatisch aus den Webcam-Einstellungen von OctoPrint (OctoPi: /webcam/?action=snapshot). Relative Adressen beziehen sich auf OctoPrint.">
                <input className="field" value={op.snapshotUrl} placeholder="automatisch" onChange={(e) => set({ snapshotUrl: e.target.value })} />
              </Field>
              <Field label="Adresse des Live-Streams (optional, MJPEG)" hint="Leer = automatisch (OctoPi: /webcam/?action=stream).">
                <input className="field" value={op.streamUrl} placeholder="automatisch" onChange={(e) => set({ streamUrl: e.target.value })} />
              </Field>
            </>
          )}
        </div>
        {status?.enabled && status.connected && printer?.webcam.available && (
          <div className="mt-4">
            <div className="lbl">Aktuelles Bild (gespeicherte Einstellungen)</div>
            <PrinterWebcam className="aspect-video w-full max-w-sm rounded-xl" />
          </div>
        )}
      </Card>

      <Card title="Übersicht & Einblendungen">
        <p className="text-sm text-muted mb-3">
          Solange gedruckt wird, zeigt die Übersicht den Fortschritt, und das Webcam-Bild wird auf allen Geräten regelmäßig eingeblendet. Je Browser lässt sich die Einblendung bis zum Ende des aktuellen Drucks ausblenden; Kamera-Einblendungen bei Bewegung haben immer Vorrang.
        </p>
        <Switch label="Auf der Übersicht anzeigen, solange gedruckt wird" checked={op.dashboard} onChange={(v) => set({ dashboard: v })} />
        <Switch label="Webcam-Bild regelmäßig einblenden, solange gedruckt wird" checked={op.popup} onChange={(v) => set({ popup: v })} />
        <div className={`grid sm:grid-cols-2 gap-4 mt-2 ${dimUnless(op.popup || op.popupOnFinish)}`}>
          <div className={dimUnless(op.popup)}>
            <Field label="Einblenden alle (Minuten)" hint="Das erste Bild erscheint diese Zeit nach dem Druckstart (1–240).">
              <NumInput value={op.popupMinutes} onChange={(v) => set({ popupMinutes: v ?? 15 })} />
            </Field>
          </div>
          <Field label="Anzeigedauer (Sekunden)">
            <NumInput value={op.popupSeconds} onChange={(v) => set({ popupSeconds: v ?? 20 })} />
          </Field>
        </div>
        <div className="mt-2">
          <Switch label="Einblenden, wenn der Druck fertig ist, abgebrochen wird oder mit Fehler endet" checked={op.popupOnFinish} onChange={(v) => set({ popupOnFinish: v })} />
        </div>
        <div className={`grid sm:grid-cols-2 gap-4 mt-2 ${dimUnless(op.popup || op.popupOnFinish)}`}>
          <Field label="Position">
            <select className="field" value={op.popupPosition} onChange={(e) => set({ popupPosition: e.target.value as PopupPosition })}>
              {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Größe">
            <select className="field" value={op.popupSize} onChange={(e) => set({ popupSize: e.target.value as PopupSize })}>
              {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <button
          className="btn mt-4"
          disabled={!status?.enabled}
          title={status?.enabled ? undefined : 'Erst nach dem Speichern einer Druckerverbindung verfügbar'}
          onClick={() => preview({ id: `preview-${Date.now()}`, ts: Date.now(), reason: 'preview', jobId: null }, { position: op.popupPosition, size: op.popupSize })}
        >
          <Eye size={15} /> Vorschau anzeigen
        </button>
      </Card>
    </>
  );
}

const CAMERA_HINT: Record<BambuCamera, string> = {
  auto: 'X1, H2 und P2S liefern ein RTSP-Video (am Drucker „LAN-Liveview“ einschalten), A1 und P1 etwa ein Bild pro Sekunde.',
  jpeg: 'Etwa ein Bild pro Sekunde über Port 6000 (A1, A1 mini, P1P, P1S).',
  rtsp: 'RTSPS-Video über Port 322, umgewandelt von ffmpeg auf dem Server. Am Drucker „LAN-Liveview“ einschalten.',
  url: 'Der Server liest die angegebene Adresse (z. B. ein go2rtc, das die Druckerkamera bereits abgreift).',
  off: 'Es wird kein Webcam-Bild angezeigt.',
};

/** Connection of a Bambu Lab printer: IP, serial number, access code and whether it may be controlled. */
function BambuFields({ bb, set, enabled }: { bb: BambuConfig; set: (p: Partial<BambuConfig>) => void; enabled: boolean }) {
  return (
    <div className={dimUnless(enabled)}>
      <p className="text-sm text-muted mb-3">
        Am Drucker unter Einstellungen → Netzwerk den <b>LAN-Modus</b> und den <b>Entwicklermodus</b> einschalten; dort stehen auch IP-Adresse und Zugangscode. Die Seriennummer steht unter Einstellungen → Gerät (oder in Bambu Studio / Handy-App).
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="IP-Adresse des Druckers" hint="Am besten im Router eine feste IP vergeben.">
          <input className="field" value={bb.host} placeholder="192.168.1.50" onChange={(e) => set({ host: e.target.value })} />
        </Field>
        <Field label="Seriennummer" hint="z. B. 01P00A123456789 – wird für die MQTT-Themen gebraucht.">
          <input className="field font-mono uppercase" value={bb.serial} placeholder="01P00A…" maxLength={40} onChange={(e) => set({ serial: e.target.value })} />
        </Field>
        {/* the stored code is never sent to the browser; an empty field keeps it */}
        <Field label="Zugangscode (LAN Access Code)" hint={`${bb.accessCodeSet ? 'Gespeichert – leer lassen, um ihn zu behalten. ' : ''}8-stelliger Code aus den Netzwerk-Einstellungen des Druckers; er ändert sich, wenn der LAN-Modus neu eingeschaltet wird.`}>
          <input className="field font-mono" type="password" autoComplete="new-password" value={bb.accessCode ?? ''} placeholder={bb.accessCodeSet ? '••••••••' : ''} onChange={(e) => set({ accessCode: e.target.value })} />
        </Field>
      </div>
      <div className="mt-2">
        <Switch label="Steuerung in der App erlauben (Pause, Fortsetzen, Abbrechen, Licht, Geschwindigkeit)" checked={bb.controls} onChange={(v) => set({ controls: v })} />
      </div>
    </div>
  );
}
