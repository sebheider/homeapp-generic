/**
 * Camera components: self-refreshing snapshot, live stream (MJPEG with snapshot fallback), camera tile with motion badge,
 * fullscreen viewer and the motion pop-up. Pictures come from the server, which proxies
 * the Synology Surveillance Station.
 * The components live in components/cameras/; this module re-exports them.
 */
export { RefreshingImage, SnapshotImage, StreamImage } from './cameras/images';
export { useRecentMotion, KIND_STYLE, motionKey, KindIcon, ColoredKindIcon } from './cameras/motion';
export { CameraTile } from './cameras/CameraTile';
export { CameraViewer } from './cameras/CameraViewer';
export { POPUP_WIDTH, MotionPopup } from './cameras/MotionPopup';
export { CameraPopupPauseBanner } from './cameras/CameraPopupPauseBanner';
