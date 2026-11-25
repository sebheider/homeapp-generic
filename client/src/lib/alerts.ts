/**
 * Presentation helpers for notifications: severity styles, operator labels, jump targets and the
 * system hints that the app derives from the connection status.
 */
import type { ActiveAlert, AlertOp, Severity, Status } from './types';
import type { View } from './store';

/** Label, colour and CSS tone per severity. */
export const SEVERITY: Record<Severity, { label: string; color: string; tone: string }> = {
  alarm: { label: 'Alarm', color: '#f43f5e', tone: 'tone-alert' },
  warning: { label: 'Warnung', color: '#fb923c', tone: 'tone-warm' },
  info: { label: 'Hinweis', color: '#38bdf8', tone: 'tone-cool' },
};

/** Operators of the rule editor. */
export const ALERT_OPS: { value: AlertOp; label: string }[] = [
  { value: '>', label: 'größer als' },
  { value: '>=', label: 'größer oder gleich' },
  { value: '<', label: 'kleiner als' },
  { value: '<=', label: 'kleiner oder gleich' },
  { value: '==', label: 'gleich' },
  { value: '!=', label: 'ungleich' },
  { value: 'on', label: 'ist an / offen / wahr' },
  { value: 'off', label: 'ist aus / zu / falsch' },
];

/** Operators that compare against a number (they support a hysteresis). */
export const NUMERIC_OPS: AlertOp[] = ['>', '>=', '<', '<='];

/** Pages a notification can jump to. */
export const TARGET_VIEWS: { value: View | ''; label: string }[] = [
  { value: '', label: 'Kein Ziel' },
  { value: 'home', label: 'Übersicht' },
  { value: 'weather', label: 'Wetter' },
  { value: 'rooms', label: 'Räume' },
  { value: 'lights', label: 'Licht' },
  { value: 'climate', label: 'Klima' },
  { value: 'energy', label: 'Energie' },
  { value: 'cameras', label: 'Kameras' },
  { value: 'mower', label: 'Mähroboter' },
  { value: 'settings', label: 'Einstellungen' },
];

/** Severity order for sorting (alarm first). */
export const severityRank = (s: Severity) => (['alarm', 'warning', 'info'] as Severity[]).indexOf(s);

/**
 * Notifications the app creates itself from the connection status (lost server connection,
 * ioBroker / Surveillance Station errors). They use the same shape as the server's alerts.
 */
export function systemAlerts(status: Status | null, wsConnected: boolean): ActiveAlert[] {
  const out: ActiveAlert[] = [];
  const hint = (id: string, severity: Severity, name: string, message: string): ActiveAlert => ({ id: `system:${id}`, name, severity, message, value: null, since: 0, view: 'settings', room: null });
  if (!wsConnected) out.push(hint('server', 'alarm', 'Server', 'Keine Live-Verbindung zum HomeApp-Server – verbinde neu …'));
  if (status && !status.demo && status.source.error) out.push(hint('iobroker', 'warning', 'ioBroker', status.source.error));
  if (status?.surveillance.enabled && status.surveillance.error && !status.demo) out.push(hint('surveillance', 'warning', 'Surveillance Station', status.surveillance.error));
  return out;
}
