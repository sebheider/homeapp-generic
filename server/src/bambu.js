/**
 * 3D printer from Bambu Lab (X1, X2, P1, A1, H2, P2 series) via the local developer API.
 *
 * The printer has to be in LAN mode with developer mode switched on (printer → Settings → LAN only /
 * Developer mode); the access code is shown there as well. The server then talks to the printer itself:
 *   - MQTT over TLS on port 8883 (user `bblp`, password = access code, self-signed certificate):
 *     subscribe `device/<serial>/report`, send commands to `device/<serial>/request`. After connecting
 *     `get_version` (model, firmware) and `pushall` (complete state) are requested; afterwards P1/A1
 *     printers only send the changed fields, so every report is merged into the full state
 *     ({@link mergeReport}).
 *   - Webcam (see {@link FrameCamera}):
 *       P1 / A1 series: JPEG pictures over TLS on port 6000 (80 byte login, then per picture a 16 byte
 *       header with the size followed by the JPEG),
 *       X1 / X2 / H2 / P2 series: RTSPS on port 322, converted to MJPEG by ffmpeg ("LAN-Liveview" must be on),
 *       or the address of an own MJPEG stream (e.g. go2rtc).
 *   - Control (pause, resume, stop, chamber light, speed level) through MQTT commands.
 * Bambu printers keep no temperature history, so the last 30 minutes are recorded here.
 *
 * {@link BambuSource} offers the same interface as the OctoPrint source (read, temps, snapshot,
 * openStream, close) plus `command` and `describe`, so {@link PrinterService} (octoprint.js) runs both.
 *
 * Modules (this file only re-exports their public API):
 *   bambu/config.js        `bambu` section of the configuration
 *   bambu/models.js        model codes and names, features per model
 *   bambu/labels.js        German texts of states, print stages and speed levels
 *   bambu/values.js        lenient readers for report values
 *   bambu/hardware.js      AMS, fans, nozzles and temperatures of a report
 *   bambu/state.js         merging of partial reports, normalised printer state
 *   bambu/camera.js        camera kind and picture producers (port 6000, RTSPS via ffmpeg, own address)
 *   bambu/frame-camera.js  on-demand picture source with snapshots and an MJPEG stream
 *   bambu/source.js        BambuSource: MQTT connection, commands, recorded temperatures
 *   bambu/demo.js          simulated printer of the demo mode
 */
export { BAMBU_CAMERAS, sanitizeBambu } from './bambu/config.js';
export { firmwareOf, modelFromModules, modelName } from './bambu/models.js';
export { GCODE_STATE_TEXT, SPEED_LEVELS, STAGES } from './bambu/labels.js';
export { fanPercent, nozzleTypeName, readAms, readBambuTemps, readFans, readNozzles } from './bambu/hardware.js';
export { CANCELLED_ERROR, bambuState, errorCode, hmsList, mergeReport, normalizeBambu } from './bambu/state.js';
export { JPEG_PORT, RTSP_PORT, JpegFrameParser, cameraKind, jpegAuthPacket, jpegProducer, rtspProducer, urlProducer } from './bambu/camera.js';
export { FrameCamera } from './bambu/frame-camera.js';
export { MQTT_PORT, BambuSource, bambuMessage } from './bambu/source.js';
export { demoBambu } from './bambu/demo.js';
