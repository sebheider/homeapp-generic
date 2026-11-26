/**
 * Simulated Bambu Lab printer of the demo mode.
 */
import { normalizeBambu } from './state.js';

/**
 * State of the simulated Bambu Lab printer (P1S with one AMS) in the demo mode, built as a report
 * and normalised like a real one. `settings` holds the light and speed level set by commands.
 */
export function demoBambu({ printing, done, total, temps, settings, name }) {
  const layers = 250;
  const completion = Math.round((done / total) * 100);
  const stage = !printing ? 0 : done < 60 ? 2 : done < 90 ? 7 : done < 150 ? 1 : 0;
  const report = {
    gcode_state: printing ? 'RUNNING' : 'FINISH',
    subtask_name: 'Benchy_PLA_0.2mm',
    gcode_file: '/data/Metadata/plate_1.gcode',
    print_type: 'local',
    mc_percent: completion,
    mc_remaining_time: Math.round((total - done) / 60),
    layer_num: Math.round((layers * done) / total),
    total_layer_num: layers,
    stg_cur: stage,
    nozzle_temper: temps.tool0[0],
    nozzle_target_temper: temps.tool0[1],
    bed_temper: temps.bed[0],
    bed_target_temper: temps.bed[1],
    cooling_fan_speed: printing && stage === 0 ? '15' : '0',
    big_fan1_speed: printing ? '10' : '0',
    big_fan2_speed: printing ? '6' : '0',
    heatbreak_fan_speed: printing ? '15' : '0',
    spd_lvl: settings.speed,
    spd_mag: { 1: 50, 2: 100, 3: 124, 4: 166 }[settings.speed],
    lights_report: [{ node: 'chamber_light', mode: settings.light ? 'on' : 'off' }],
    wifi_signal: '-52dBm',
    nozzle_diameter: '0.4',
    nozzle_type: 'stainless_steel',
    sdcard: true,
    ipcam: { timelapse: 'disable' },
    hms: [],
    ams: {
      tray_now: printing ? '1' : '255',
      ams: [
        {
          id: '0',
          humidity: '4',
          humidity_raw: '23',
          temp: '26.4',
          tray: [
            { id: '0', tray_type: 'PLA', tray_sub_brands: 'PLA Basic', tray_color: 'FFFFFFFF', remain: 82 },
            { id: '1', tray_type: 'PLA', tray_sub_brands: 'PLA Matte', tray_color: 'F98C36FF', remain: Math.round(64 - completion / 10) },
            { id: '2', tray_type: 'PETG', tray_sub_brands: 'PETG HF', tray_color: '164B35FF', remain: 35 },
            { id: '3' },
          ],
        },
      ],
    },
  };
  const status = normalizeBambu(report, { model: 'P1S', firmware: '01.08.00.00', printTime: Math.round(done), camera: 'jpeg', serial: '01P00A000000000' });
  return {
    ...status,
    meta: { version: 'Firmware 01.08.00.00 (Demo)', user: null, name, webcam: { enabled: true, streamUrl: '', snapshotUrl: '', flipH: false, flipV: false, rotate90: false, ratio: '16:9' } },
  };
}
