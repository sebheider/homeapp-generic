/**
 * Shared data types. They mirror the configuration format (`config.json`) and the
 * messages of the server API. The types live in lib/types/ (one module per domain); this module
 * re-exports them, so everything can be imported from `lib/types`.
 */
export type { DeviceType, Device, ChoiceOption, ModeOption, Room, SceneAction, Scene } from './types/devices';
export { MOTION_LABEL } from './types/cameras';
export type { CameraConfig, CameraInfo, SurveillanceConfig, PopupPosition, PopupSize, MotionKind, TimeWindow, PopupRule, MotionEvent } from './types/cameras';
export type { PrinterType, OctoPrintConfig, BambuCamera, BambuConfig, BambuTray, BambuExternalTray, BambuDetails, PrinterCommand, PrinterStateKey, PrinterTemp, PrinterData, PrinterPopupReason, PrinterPopupEvent, PrinterTempHistory } from './types/printer';
export type { SpotifyConfig, SpotifyRepeat, SpotifyTrack, SpotifyCollection, SpotifyDevice, SpotifySearchResult, SpotifyState, SpotifyCommand } from './types/spotify';
export type { Severity, AlertOp, AlertRule, ActiveAlert, PushEvent, PushPriority, PushoverConfig, PushoverStatus } from './types/alerts';
export type { KioskConfig, KioskAgent, RadarTarget, RadarFrame } from './types/kiosk';
export type { WasteConfig, WasteItem, WasteDay, WasteData } from './types/waste';
export type { VentilationRoom, VentilationConfig, VentilationRoomState, VentilationData } from './types/ventilation';
export type { EnergyConfig, WeatherConfig, LayoutPage, GroupMode, PageLayout, AppConfig } from './types/config';
export type { StateEntry, Status, ObjectHit, Series } from './types/server';
