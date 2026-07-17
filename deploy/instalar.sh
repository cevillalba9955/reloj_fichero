#!/usr/bin/env bash
# Instalación automatizada del despliegue Linux (docs/despliegue-linux.md).
# Cubre §1-§4 (servicio de fichadas) y §8.1-8.3 (interfaz web), con la
# verificación de §5/§8.4 al final. Idempotente: se puede re-ejecutar sin
# romper una instalación existente (usuario ya creado, units ya copiados, etc.).
#
# Uso (desde el clone, como root):
#   sudo deploy/instalar.sh [--sin-web]
#
# Queda manual (el script lo detecta y avisa):
#   - Editar .env con la IP real del reloj y, para el snapshot del padrón,
#     las credenciales RRHH_ORACLE_* (solo para ese paso puntual).
#   - Generar data/presentismo/padron.json (sincronizar-padron, requiere
#     Oracle) o copiarlo desde otra máquina.
set -euo pipefail

USUARIO=rs956
NODE_BIN=/usr/bin/node
NODE_MIN=20.12
WEB_PORT=4173
SIN_WEB=0
[[ "${1:-}" == "--sin-web" ]] && SIN_WEB=1

# El script vive en deploy/: la raíz de la instalación es su directorio padre.
DIR="$(cd "$(dirname "$0")/.." && pwd)"

log()  { echo "[instalar] $*"; }
warn() { echo "[instalar] AVISO: $*" >&2; }
die()  { echo "[instalar] ERROR: $*" >&2; exit 1; }

# Corre un comando como el usuario del servicio preservando el PATH del
# invocador (sudo reinicia el entorno al secure_path de sudoers, ver §2).
como_usuario() { sudo -u "$USUARIO" env "PATH=$PATH" "$@"; }

# --- §1 Prerrequisitos ------------------------------------------------------
[[ $EUID -eq 0 ]] || die "ejecutar como root: sudo deploy/instalar.sh"
command -v systemctl >/dev/null || die "se requiere systemd (systemctl no encontrado)"
[[ -x "$NODE_BIN" ]] || die "no hay node en $NODE_BIN; instalarlo system-wide (NodeSource o paquete de la distro, ver §1)"

NODE_VER="$("$NODE_BIN" --version)"; NODE_VER="${NODE_VER#v}"
if [[ "$(printf '%s\n' "$NODE_MIN" "$NODE_VER" | sort -V | head -1)" != "$NODE_MIN" ]]; then
  die "node $NODE_VER < $NODE_MIN requerido (--env-file-if-exists)"
fi
log "node $NODE_VER en $NODE_BIN"

if [[ "$DIR" != /opt/rs956 ]]; then
  warn "instalación en $DIR (no /opt/rs956): editar WorkingDirectory/ReadWritePaths de los units antes de continuar"
fi

# --- §2 Usuario de sistema y permisos ---------------------------------------
if ! id -u "$USUARIO" >/dev/null 2>&1; then
  useradd --system --home "$DIR" --shell /usr/sbin/nologin "$USUARIO"
  log "usuario $USUARIO creado"
else
  log "usuario $USUARIO ya existe"
fi
chown -R "$USUARIO:$USUARIO" "$DIR"   # §10

log "instalando dependencias del backend (npm ci --omit=dev)..."
como_usuario npm --prefix "$DIR" ci --omit=dev

# --- §3 Configuración -------------------------------------------------------
if [[ ! -f "$DIR/.env" ]]; then
  como_usuario cp "$DIR/.env.example" "$DIR/.env"
  die ".env creado desde la plantilla. Editarlo (FICHADAS_HOST=<ip-del-reloj>, FICHADAS_PADRON, FICHADAS_ROSTER_CONFIG; ver §3) y re-ejecutar este script."
fi
grep -Eq '^FICHADAS_HOST=.+' "$DIR/.env" || die "falta FICHADAS_HOST en .env (IP del reloj, obligatorio)"
log ".env presente (verificar que FICHADAS_HOST apunte al reloj real)"

como_usuario mkdir -p "$DIR/logs" "$DIR/data/presentismo/fichadas"

if [[ ! -f "$DIR/data/presentismo/padron.json" ]]; then
  warn "falta data/presentismo/padron.json (snapshot del padrón). Generarlo con:"
  warn "  sudo -u $USUARIO env \"PATH=\$PATH\" npm run presentismo -- sincronizar-padron"
  warn "(requiere RRHH_ORACLE_* en .env) o copiarlo desde otra máquina. El servicio arranca igual."
fi

# --- §8.1 Build del frontend ------------------------------------------------
if [[ $SIN_WEB -eq 0 ]]; then
  log "construyendo el frontend (npm ci + build, con devDependencies)..."
  como_usuario npm --prefix "$DIR/frontend" ci
  (cd "$DIR/frontend" && como_usuario npm run build)
else
  log "--sin-web: se omite el build y el servicio de la interfaz web"
fi

# --- §4 / §8.3 Units de systemd ---------------------------------------------
UNITS=(rs956-fichadas.service rs956-fichadas-restart.service rs956-fichadas-restart.timer)
[[ $SIN_WEB -eq 0 ]] && UNITS+=(rs956-web.service)
for u in "${UNITS[@]}"; do
  cp "$DIR/deploy/$u" /etc/systemd/system/
done
systemctl daemon-reload
systemctl enable --now rs956-fichadas.service
systemctl enable --now rs956-fichadas-restart.timer
[[ $SIN_WEB -eq 0 ]] && systemctl enable --now rs956-web.service
log "units instalados y habilitados: ${UNITS[*]}"

# --- §5 / §8.4 Verificación -------------------------------------------------
sleep 2
FALLO=0
for s in rs956-fichadas.service $([[ $SIN_WEB -eq 0 ]] && echo rs956-web.service); do
  if systemctl is-active --quiet "$s"; then
    log "$s: active"
  else
    warn "$s NO está activo — revisar: journalctl -u $s -n 50"
    FALLO=1
  fi
done
if [[ $SIN_WEB -eq 0 ]] && command -v curl >/dev/null; then
  if curl -sf "http://localhost:$WEB_PORT/api/calendarios" >/dev/null; then
    log "API web responde en http://localhost:$WEB_PORT/api/calendarios"
  else
    warn "la API web no responde en el puerto $WEB_PORT"
    FALLO=1
  fi
fi

[[ $FALLO -eq 0 ]] || die "instalación con problemas (ver avisos arriba)"
log "instalación completa. Seguimiento: journalctl -u rs956-fichadas -f"
log "consulta manual al reloj (§8.7): definir FICHADAS_CONTROL_PORT=5006 en .env y reiniciar ambos servicios"
