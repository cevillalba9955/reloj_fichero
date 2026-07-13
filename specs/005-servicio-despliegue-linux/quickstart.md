# Quickstart / Validación: Servicio de Fichadas — Persistencia y Despliegue en Linux

**Feature**: 005-servicio-despliegue-linux

Guía para validar la feature de punta a punta. Referencias de detalle:
[spec.md](./spec.md), [contracts/](./contracts/), [data-model.md](./data-model.md).

## 0. Prerrequisitos

- Node ≥ 20.12 (`node --version`).
- Repo con dependencias: `npm ci`.
- Para el flujo real: alcance de red al reloj RS596 (`FICHADAS_HOST:5005`).

## 1. Validación automatizada (sin hardware)

```bash
node --test                       # suite completa en verde
node --test tests/unit/local-file-active-employees-provider.test.js
node --test tests/unit/presentismo-fichadas-archive.test.js
node --test tests/integration/consulta-programada-service.integration.test.js
```

Cubre (Principio IV):
- Padrón por archivo: esquema legacy y snapshot 004, dedup, inválidos descartados, vacío→error.
- Archivo de fichadas: escritura atómica, salto-sin-altas, dedup por `rawHex`.
- Servicio → persistencia: un ciclo del scheduler (contra el mock TCP) escribe el archivo del
  período, y el `archive-fichadas-provider` lee lo escrito (round-trip productor↔consumidor).

## 2. Round-trip local servicio → cálculo (con reloj real o mock)

1. Preparar el padrón (una vez, requiere Oracle) o copiar un snapshot:
   ```bash
   npm run presentismo -- sincronizar-padron    # genera data/presentismo/padron.json
   ```
2. Arrancar el servicio apuntando al snapshot como padrón:
   ```bash
   FICHADAS_HOST=<ip-reloj> FICHADAS_PADRON=archivo \
   FICHADAS_ROSTER_CONFIG=./data/presentismo/padron.json \
   npm run servicio
   ```
   Para forzar una ventana abierta en una prueba puntual, fijar `FICHADAS_ENTRADA_HORA` a la
   hora actual.
3. Tras un ciclo `success` (ver `logs/service-servicio-fichadas.ndjson`), verificar que se
   creó/actualizó `data/presentismo/fichadas/<periodo>.json` con `rawHex`.
4. Confirmar el consumo por el cálculo:
   ```bash
   npm run presentismo -- calcular --periodo <YYYYMM> --legajo <N> --formato tabla
   ```
   Debe reflejar las fichadas recolectadas (SC-001).
5. Reiniciar el servicio y repetir un ciclo: la cantidad de fichadas del período no baja
   (SC-002) y no se duplican (SC-003).

**Chequeos de privacidad (Principio V / SC-008)**:
```bash
grep -i rawHex logs/*.ndjson        # no debe haber coincidencias en logs correlacionables
grep -Ei "password|connectString" logs/*.ndjson   # sin credenciales
```

## 3. Despliegue en el servidor Linux (systemd)

Resumen (detalle en [docs/despliegue-linux.md](../../docs/despliegue-linux.md) y
[contracts/systemd-deployment.md](./contracts/systemd-deployment.md)):

```bash
sudo useradd --system --home /opt/rs956 --shell /usr/sbin/nologin rs956
sudo install -d -o rs956 -g rs956 /opt/rs956
# copiar el código a /opt/rs956, luego:
sudo -u rs956 npm ci --omit=dev
sudo -u rs956 cp .env.example .env   # editar: FICHADAS_HOST, FICHADAS_PADRON=archivo, etc.
# generar/copiar data/presentismo/padron.json
sudo cp deploy/rs956-fichadas.service deploy/rs956-fichadas-restart.service deploy/rs956-fichadas-restart.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rs956-fichadas.service
sudo systemctl enable --now rs956-fichadas-restart.timer
```

**Verificación**:
```bash
systemctl status rs956-fichadas            # active (running)
journalctl -u rs956-fichadas -f            # ciclo inicial + resumen de estado; "omitido" fuera de ventana
systemctl list-timers | grep rs956-fichadas-restart   # próximo disparo ~06:00
```

**Reinicio del servidor (SC-004)**: reiniciar la máquina y confirmar que el servicio queda
`active` sin intervención.

**Continuidad multi-día (SC-005)**: verificar que, tras el disparo del timer (o
`systemctl start rs956-fichadas-restart.service`), el servicio vuelve a consultar en las
ventanas del nuevo día, y que las fichadas del día previo siguen en su archivo por período.

## 4. Rollback

- Detener y deshabilitar: `sudo systemctl disable --now rs956-fichadas.service rs956-fichadas-restart.timer`.
- Los datos persistidos en `data/presentismo/fichadas/` quedan intactos (los consume el cálculo).

## Caveats

- El servicio persiste las fichadas en `data/presentismo/fichadas/<periodo>.json`; el store en
  memoria sigue usándose solo para la completitud de checkpoints.
- El snapshot del padrón es una foto: refrescar con `sincronizar-padron` si cambia el padrón.
- La continuidad multi-día depende del timer de reinicio; si se deshabilita, el servicio deja
  de consultar tras el primer día (rollover no cableado en el código, ver research §5).
