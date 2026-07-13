# Contract: Despliegue con systemd (servicio + reinicio diario)

**Feature**: 005 | Artefactos en `deploy/`; guía en `docs/despliegue-linux.md`.

Convenciones por defecto (sobreescribibles en la guía): usuario de sistema `rs956`, directorio
de instalación `/opt/rs956`, binario Node en `/usr/bin/node`.

## Unit del servicio — `deploy/rs956-fichadas.service`

Requisitos que el unit DEBE cumplir:

- `Type=simple`; `User=rs956`, `Group=rs956`.
- `WorkingDirectory=/opt/rs956` — **obligatorio**: los defaults de rutas son relativos
  (`./logs`, `./config`, `./data`).
- `ExecStart=/usr/bin/node --env-file-if-exists=.env src/cli/consulta-programada.js`
  (mismo cargador de `.env` que el script `npm run servicio`).
- `Restart=on-failure`, `RestartSec=10` (FR-008).
- `TimeoutStopSec≥30`: SIGTERM (default de systemd) → apagado limpio; deja terminar una
  consulta TCP en curso (FR-009). El servicio sale con código 0.
- Endurecimiento: `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`,
  `ReadWritePaths=/opt/rs956/logs /opt/rs956/data` (escribe logs y el archivo de fichadas).
- `WantedBy=multi-user.target` (arranque al boot, FR-007).

## Reinicio diario — `deploy/rs956-fichadas-restart.{service,timer}`

- `rs956-fichadas-restart.service` (`Type=oneshot`):
  `ExecStart=/bin/systemctl restart rs956-fichadas.service`.
- `rs956-fichadas-restart.timer`: `OnCalendar=*-*-* 06:00:00` (antes de la ventana de entrada),
  `Persistent=true` (recupera el disparo si el servidor estuvo apagado). `WantedBy=timers.target`.
- Efecto: cada día el servicio reinicia con checkpoints en `pendiente`, habilitando la
  recolección del nuevo día (FR-011). Las fichadas del día previo ya están persistidas: el
  reinicio no las pierde (FR-012).

## Guía de despliegue — `docs/despliegue-linux.md`

Debe permitir a un operador sin conocimiento del código (FR-010, SC-006):

1. **Prerrequisitos**: Node ≥ 20.12; alcance de red al reloj (`FICHADAS_HOST:5005`); acceso a
   Oracle **solo** para el paso de snapshot.
2. **Instalación**: usuario `rs956` + `/opt/rs956`; obtener el código; `npm ci` (oracledb thin,
   sin Instant Client).
3. **Provisión** (archivos gitignored): `.env` (desde `.env.example`, con `FICHADAS_HOST`,
   `FICHADAS_PADRON=archivo`, `FICHADAS_ROSTER_CONFIG=./data/presentismo/padron.json`; y para el
   paso de snapshot, `RRHH_ORACLE_*`); generar `data/presentismo/padron.json` con
   `npm run presentismo -- sincronizar-padron`; permisos de escritura en `logs/` y
   `data/presentismo/fichadas/`.
4. **Activación**: copiar units a `/etc/systemd/system/`, `daemon-reload`,
   `enable --now rs956-fichadas.service` y `enable --now rs956-fichadas-restart.timer`.
5. **Verificación / rollback / caveats**: ver [quickstart.md](../quickstart.md).

## Códigos de salida (heredados del CLI, feature 002/003)

- `0`: apagado limpio por señal.
- `3`: argumentos inválidos (p. ej. falta `FICHADAS_HOST`).
- `4`: configuración de padrón Oracle inválida (solo aplica en `--padron oracle`).
