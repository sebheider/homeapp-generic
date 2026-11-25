/**
 * Global notifications: bell button with counter, the notification list (dialog) and a bar above
 * every page. Entries are the user-defined alerts of the server plus system hints derived from the
 * connection status. A click jumps to the area the notification belongs to.
 *
 * Alerts that require acknowledgement (by default all alarms) stay visible – red bar above every
 * page, cannot be hidden – until somebody presses "Quittieren", even if their condition is gone
 * already. The acknowledgement is stored on the server and applies to every browser. All other
 * entries can be hidden locally until they occur again.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellRing, CheckCheck, ChevronRight, CircleAlert, EyeOff, Info, ShieldCheck, TriangleAlert } from 'lucide-react';
import { isDismissed, needsAck, useStore } from '../lib/store';
import { SEVERITY, severityRank, systemAlerts } from '../lib/alerts';
import { useNow } from '../lib/hooks';
import { clockTime, timeAgo } from '../lib/format';
import type { ActiveAlert, Severity } from '../lib/types';
import { Modal } from './ui';

/** Icon per severity. */
function SeverityIcon({ severity, size = 18, className = '' }: { severity: Severity; size?: number; className?: string }) {
  const Icon = severity === 'alarm' ? CircleAlert : severity === 'warning' ? TriangleAlert : Info;
  return <Icon size={size} style={{ color: SEVERITY[severity].color }} className={`shrink-0 ${className}`} />;
}

/**
 * All notifications (system hints + server alerts): the ones waiting for acknowledgement first,
 * then by severity and age; split into visible and locally hidden ones.
 */
export function useNotifications() {
  const alerts = useStore((s) => s.alerts);
  const dismissed = useStore((s) => s.dismissedAlerts);
  const status = useStore((s) => s.status);
  const ws = useStore((s) => s.wsConnected);
  const all = [...systemAlerts(status, ws), ...alerts].sort(
    (a, b) => Number(needsAck(b)) - Number(needsAck(a)) || severityRank(a.severity) - severityRank(b.severity) || b.since - a.since,
  );
  const visible = all.filter((a) => !isDismissed(a, dismissed));
  const hidden = all.filter((a) => isDismissed(a, dismissed));
  const open = visible.filter(needsAck);
  return { visible, hidden, open, top: visible[0]?.severity ?? null };
}

/** Bell with the number of visible notifications, coloured by the most severe one; rings while something waits for acknowledgement. */
export function NotificationBell({ className = '' }: { className?: string }) {
  const { visible, open, top } = useNotifications();
  const show = useStore((s) => s.showNotifications);
  const Icon = top ? BellRing : Bell;
  return (
    <button className={`btn btn-icon relative ${className}`} onClick={() => show(true)} aria-label={`Benachrichtigungen (${visible.length})`}>
      <Icon size={18} style={top ? { color: SEVERITY[top].color } : undefined} className={open.length ? 'anim-breathe' : ''} />
      {visible.length > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[0.65rem] font-bold text-white grid place-items-center" style={{ background: SEVERITY[top!].color }}>
          {visible.length > 99 ? '99+' : visible.length}
        </span>
      )}
    </button>
  );
}

/** State line of an entry: severity, age and – for acknowledgement – whether it is still active. */
function statusText(a: ActiveAlert) {
  const parts: string[] = [SEVERITY[a.severity].label];
  if (a.since > 0) parts.push(`seit ${clockTime(a.since)} (${timeAgo(a.since)})`);
  if (a.cleared && a.clearedAt) parts.push(`beendet ${clockTime(a.clearedAt)}`);
  if (needsAck(a)) parts.push('Quittierung erforderlich');
  else if (a.acked) parts.push('quittiert');
  return parts.join(' · ');
}

/** "Quittieren" button. */
function AckButton({ id, className = '' }: { id: string; className?: string }) {
  const ack = useStore((s) => s.ackAlert);
  return (
    <button className={`btn !py-1.5 !px-3 !text-xs ack shrink-0 ${className}`} onClick={() => ack(id)}>
      <CheckCheck size={14} /> Quittieren
    </button>
  );
}

/** One entry of the list; a click on the text jumps to its target. */
function NotificationItem({ a, onOpen, onHide }: { a: ActiveAlert; onOpen?: () => void; onHide?: () => void }) {
  const open = needsAck(a);
  return (
    <div
      className={`glass !rounded-2xl flex flex-wrap sm:flex-nowrap items-start gap-3 p-3 ${SEVERITY[a.severity].tone} ${open ? 'active' : ''}`}
      style={{ borderColor: `color-mix(in srgb, ${SEVERITY[a.severity].color} ${open ? 75 : 40}%, transparent)` }}
    >
      <SeverityIcon severity={a.severity} className={open && !a.cleared ? 'anim-breathe' : ''} />
      <button className="flex-1 min-w-0 text-left" onClick={onOpen} disabled={!onOpen}>
        <div className="font-semibold text-sm leading-tight">{a.name}</div>
        <div className={`text-sm mt-0.5 break-words ${a.cleared ? 'text-muted line-through decoration-1' : 'text-muted'}`}>{a.message}</div>
        <div className="text-[0.7rem] text-muted mt-1">{statusText(a)}</div>
      </button>
      {onOpen && <ChevronRight size={16} className="text-muted mt-1 shrink-0" />}
      {open && <AckButton id={a.id} />}
      {!open && onHide && (
        <button className="btn !p-1.5" onClick={onHide} aria-label="Ausblenden" title="Ausblenden, bis es erneut auftritt">
          <EyeOff size={14} />
        </button>
      )}
    </div>
  );
}

/** Dialog with all notifications. */
export function NotificationCenter() {
  const isOpen = useStore((s) => s.notificationsOpen);
  const show = useStore((s) => s.showNotifications);
  const openTarget = useStore((s) => s.openTarget);
  const dismiss = useStore((s) => s.dismissAlert);
  const ack = useStore((s) => s.ackAlert);
  const { visible, hidden, open } = useNotifications();
  const [showHidden, setShowHidden] = useState(false);
  useNow(30000); // keeps the "vor x min" texts current
  const jump = (a: ActiveAlert) => (a.view ? () => { show(false); openTarget(a.view, a.room); } : undefined);

  return (
    <Modal open={isOpen} onClose={() => show(false)} title="Benachrichtigungen">
      {open.length > 1 && (
        <button className="btn ack w-full mb-3" onClick={() => ack()}>
          <CheckCheck size={15} /> Alle quittieren ({open.length})
        </button>
      )}
      {visible.length === 0 ? (
        <div className="py-8 flex flex-col items-center gap-2 text-center text-muted">
          <ShieldCheck size={36} className="text-emerald-400" />
          <div className="font-semibold text-fg">Alles in Ordnung</div>
          <div className="text-sm">Aktuell gibt es keine Alarme oder Hinweise.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((a) => <NotificationItem key={a.id} a={a} onOpen={jump(a)} onHide={a.id.startsWith('system:') ? undefined : () => dismiss(a)} />)}
        </div>
      )}
      {hidden.length > 0 && (
        <div className="mt-4">
          <button className="text-xs text-muted hover:text-fg" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? 'Ausgeblendete verbergen' : `Ausgeblendete anzeigen (${hidden.length})`}
          </button>
          {showHidden && <div className="flex flex-col gap-2 mt-2 opacity-60">{hidden.map((a) => <NotificationItem key={a.id} a={a} onOpen={jump(a)} />)}</div>}
        </div>
      )}
      <p className="text-[0.7rem] text-muted mt-4">
        Alarme mit Quittierungspflicht bleiben sichtbar, bis sie quittiert sind – auch wenn der Auslöser schon vorbei ist. Eigene Benachrichtigungen legst du unter Einstellungen → Benachrichtigungen an.
      </p>
    </Modal>
  );
}

/** Text of an entry for the bar: rules without own text already start with their name. */
const barText = (a: ActiveAlert) => (a.message.startsWith(a.name) ? a.message : <><b>{a.name}:</b> {a.message}</>);

/**
 * Bar above every page.
 * - While something waits for acknowledgement: a red, pulsing bar with "Quittieren" that can not be hidden.
 * - Otherwise: the most severe alarm / warning (hidden ones excluded).
 */
export function AlertBanner() {
  const { visible, open } = useNotifications();
  const show = useStore((s) => s.showNotifications);
  const openTarget = useStore((s) => s.openTarget);
  const ack = useStore((s) => s.ackAlert);
  useNow(30000);
  const important = open.length ? open : visible.filter((a) => a.severity !== 'info');
  const a = important[0];
  const latched = Boolean(a && needsAck(a));
  const color = a ? SEVERITY[a.severity].color : '';
  return (
    <AnimatePresence initial={false}>
      {a && (
        <motion.div key="alert-banner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mx-4 md:mx-8 mt-2 overflow-hidden">
          <div
            className={`rounded-xl px-3 py-2 text-sm flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1.5 border ${latched ? 'anim-ring' : ''}`}
            style={{
              ['--tone' as string]: color,
              background: `color-mix(in srgb, ${color} ${latched ? 26 : 14}%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} ${latched ? 80 : 40}%, transparent)`,
            }}
            role={latched ? 'alert' : undefined}
          >
            <SeverityIcon severity={a.severity} size={latched ? 18 : 16} className={latched && !a.cleared ? 'anim-breathe' : ''} />
            <button className="flex-1 min-w-0 text-left" onClick={() => (a.view ? openTarget(a.view, a.room) : show(true))}>
              <span className="block truncate">{barText(a)}</span>
              {latched && <span className="block text-[0.7rem] text-muted truncate">{statusText(a)}</span>}
            </button>
            {important.length > 1 && (
              <button className="text-xs font-semibold whitespace-nowrap hover:underline" onClick={() => show(true)}>
                +{important.length - 1} weitere
              </button>
            )}
            {latched && (open.length > 1 ? (
              <button className="btn !py-1.5 !px-3 !text-xs ack shrink-0" onClick={() => ack()}>
                <CheckCheck size={14} /> Alle quittieren
              </button>
            ) : (
              <AckButton id={a.id} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}