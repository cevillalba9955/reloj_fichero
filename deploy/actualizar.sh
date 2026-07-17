#!/usr/bin/env bash
# Actualización del despliegue Linux (docs/despliegue-linux.md §7 y §8.8):
# pull + dependencias + rebuild del frontend + restart de los servicios.
#
# Uso (desde el clone, como root):
#   sudo deploy/actualizar.sh [--sin-web]
set -euo pipefail

USUARIO=rs956
SIN_WEB=0
[[ "${1:-}" == "--sin-web" ]] && SIN_WEB=1

DIR="$(cd "$(dirname "$0")/.." && pwd)"

log()  { echo "[actualizar] $*"; }
die()  { echo "[actualizar] ERROR: $*" >&2; exit 1; }
como_usuario() { sudo -u "$USUARIO" env "PATH=$PATH" "$@"; }

[[ $EUID -eq 0 ]] || die "ejecutar como root: sudo deploy/actualizar.sh"

log "actualizando código (git pull --ff-only)..."
como_usuario git -C "$DIR" pull --ff-only

log "dependencias del backend..."
como_usuario npm --prefix "$DIR" ci --omit=dev

if [[ $SIN_WEB -eq 0 ]]; then
  log "rebuild del frontend..."
  como_usuario npm --prefix "$DIR/frontend" ci
  (cd "$DIR/frontend" && como_usuario npm run build)
fi

# Si cambiaron los units versionados, systemd necesita la copia y el reload.
for u in "$DIR"/deploy/*.service "$DIR"/deploy/*.timer; do
  cp "$u" /etc/systemd/system/
done
systemctl daemon-reload

systemctl restart rs956-fichadas.service
[[ $SIN_WEB -eq 0 ]] && systemctl restart rs956-web.service

sleep 2
for s in rs956-fichadas.service $([[ $SIN_WEB -eq 0 ]] && echo rs956-web.service); do
  systemctl is-active --quiet "$s" && log "$s: active" || die "$s NO está activo — revisar: journalctl -u $s -n 50"
done
log "actualización completa"
