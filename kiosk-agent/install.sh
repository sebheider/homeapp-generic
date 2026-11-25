#!/usr/bin/env bash
# Installiert den HomeApp Kiosk-Agenten als systemd-Dienst (homeapp-kiosk.service).
#   sudo ./install.sh [Benutzer]   Benutzer der Desktop-Sitzung, Standard: der aufrufende Benutzer
#   sudo ./install.sh --uninstall  Dienst stoppen und entfernen (/etc/homeapp-kiosk.json bleibt)
# Erneut ausführen aktualisiert Programm und Dienst; die Konfiguration bleibt erhalten.
set -euo pipefail
SERVICE=homeapp-kiosk.service
UNIT=/etc/systemd/system/$SERVICE
APP_DIR=/opt/homeapp-kiosk
CONFIG=/etc/homeapp-kiosk.json
DIR="$(cd "$(dirname "$0")" && pwd)"

die() { echo "✗ $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Bitte mit sudo ausführen."
command -v systemctl >/dev/null && [ -d /run/systemd/system ] \
  || die "systemd läuft hier nicht – der Agent wird als systemd-Dienst eingerichtet."

if [ "${1:-}" = "--uninstall" ]; then
  echo "→ Dienst $SERVICE stoppen und entfernen"
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl daemon-reload
  systemctl reset-failed "$SERVICE" 2>/dev/null || true
  rm -rf "$APP_DIR"
  echo "Entfernt. Konfiguration $CONFIG und Gruppenrechte bleiben erhalten."
  exit 0
fi

USER_NAME="${1:-${SUDO_USER:-pi}}"
id "$USER_NAME" >/dev/null 2>&1 || die "Benutzer '$USER_NAME' gibt es nicht. Aufruf: sudo ./install.sh <Benutzer>"
[ "$USER_NAME" != root ] || echo "  Hinweis: Dienst läuft als root – für wlr-randr besser den Desktop-Benutzer angeben."
USER_GROUP="$(id -gn "$USER_NAME")"
command -v python3 >/dev/null || die "python3 fehlt (sudo apt install python3)."
PYTHON="$(command -v python3)"

echo "→ Pakete (pyserial für den LD2410, i2c-tools zum Prüfen)"
apt-get install -y python3-serial i2c-tools >/dev/null || echo "  (apt fehlgeschlagen – pyserial ggf. von Hand installieren)"

echo "→ I²C und serielle Schnittstelle aktivieren (ohne Login-Konsole)"
if command -v raspi-config >/dev/null; then
  raspi-config nonint do_i2c 0
  raspi-config nonint do_serial_hw 0 2>/dev/null || raspi-config nonint do_serial 2
  raspi-config nonint do_serial_cons 1 2>/dev/null || true
fi

echo "→ Rechte für $USER_NAME (I²C, UART, GPIO, Touch, Hintergrundbeleuchtung)"
for g in i2c dialout gpio input video; do
  if getent group "$g" >/dev/null; then usermod -aG "$g" "$USER_NAME"; fi
done
cat >/etc/udev/rules.d/90-homeapp-backlight.rules <<'RULE'
SUBSYSTEM=="backlight", RUN+="/bin/chgrp video /sys%p/brightness /sys%p/bl_power", RUN+="/bin/chmod g+w /sys%p/brightness /sys%p/bl_power"
RULE
udevadm control --reload-rules && udevadm trigger --subsystem-match=backlight || true

echo "→ Programm nach $APP_DIR"
install -d "$APP_DIR"
install -m 755 "$DIR/homeapp_kiosk.py" "$APP_DIR/"

if [ ! -f "$CONFIG" ]; then
  read -r -p "Melde-Adresse aus HomeApp (Einstellungen → Kiosk-Sensoren): " URL
  read -r -p "Kurzname dieses Displays (a-z, 0-9, -) [$(hostname -s | tr 'A-Z' 'a-z')]: " ID
  ID="${ID:-$(hostname -s | tr 'A-Z' 'a-z')}"
  read -r -p "Anzeigename [Wanddisplay]: " NAME
  python3 - "$DIR/config.example.json" "$URL" "$ID" "${NAME:-Wanddisplay}" >"$CONFIG" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
cfg.update(url=sys.argv[2], id=sys.argv[3], name=sys.argv[4])
print(json.dumps(cfg, indent=2, ensure_ascii=False))
PY
  echo "  $CONFIG angelegt (Sensoren / Display-Methode dort anpassen)"
fi
chown "root:$USER_GROUP" "$CONFIG"
chmod 640 "$CONFIG"

echo "→ systemd-Dienst $SERVICE (Benutzer $USER_NAME, startet beim Booten)"
sed -e "s|^User=.*|User=$USER_NAME|" -e "s|^ExecStart=/usr/bin/python3 |ExecStart=$PYTHON |" \
  "$DIR/$SERVICE" >"$UNIT"
chmod 644 "$UNIT"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl reset-failed "$SERVICE" 2>/dev/null || true
systemctl restart "$SERVICE"
sleep 3
if systemctl is-active --quiet "$SERVICE"; then
  echo "  läuft (aktiviert: $(systemctl is-enabled "$SERVICE"))"
else
  echo "✗ Dienst läuft nicht. Letzte Meldungen:" >&2
  journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
  exit 1
fi

echo
echo "Fertig. Status: systemctl status homeapp-kiosk · Log: journalctl -u homeapp-kiosk -f"
echo "Sensoren testen: python3 $APP_DIR/homeapp_kiosk.py --config $CONFIG --once"
echo "Wurden I²C/UART eben erst aktiviert: bitte neu starten (sudo reboot)."
