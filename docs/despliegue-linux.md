# Despliegue del servicio de fichadas en Linux (systemd)

Guía reproducible para correr el **servicio-fichadas-programado** (feature 002) como daemon
de producción en un servidor Linux, con **persistencia de fichadas** (feature 005) hacia el
archivo por período que consume el cálculo de presentismo (feature 004).

Cubre también el despliegue de la **interfaz web de presentismo** (frontend + API, features 007 +
008) como servicio systemd aparte — ver [§8](#8-despliegue-de-la-interfaz-web-frontend--api).

Convenciones por defecto (ajustables): usuario de sistema `rs956`, instalación en `/opt/rs956`,
Node en `/usr/bin/node`. Referencias: [spec 005](../specs/005-servicio-despliegue-linux/spec.md),
[contrato systemd](../specs/005-servicio-despliegue-linux/contracts/systemd-deployment.md).

## 1. Prerrequisitos

- **Linux con systemd** (Ubuntu/Debian/RHEL).
- **Node ≥ 20.12** (`node --version`). Los scripts usan `--env-file-if-exists`, que requiere
  esa versión. Instalar por NodeSource o el paquete de la distro (evitar `nvm` para un servicio).
- **Red**: el servidor debe alcanzar el reloj RS596 en `FICHADAS_HOST:5005` (TCP).
- **Oracle**: sólo se necesita alcance/credenciales para el paso puntual de generar el snapshot
  del padrón (`sincronizar-padron`), **no** en runtime. `oracledb` corre en modo *thin* (sin
  Oracle Instant Client).

## 2. Instalación

```bash
# Usuario de sistema sin login y directorio de instalación
sudo useradd --system --home /opt/rs956 --shell /usr/sbin/nologin rs956
sudo install -d -o rs956 -g rs956 /opt/rs956

# Copiar el código a /opt/rs956 (git clone o rsync). Luego, como usuario rs956:
cd /opt/rs956
sudo -u rs956 npm ci --omit=dev
```

`npm ci` baja `oracledb` (binario prebuilt; no requiere toolchain de C/C++). `node_modules/`
está gitignored, por eso se instala en el servidor.

## 3. Provisionar configuración (archivos gitignored — no vienen en el clone)

Partir de las plantillas versionadas:

```bash
sudo -u rs956 cp .env.example .env
```

Editar `.env` con al menos:

```dotenv
FICHADAS_HOST=<ip-del-reloj>            # obligatorio
FICHADAS_PADRON=archivo
FICHADAS_ROSTER_CONFIG=./data/presentismo/padron.json   # snapshot local del padrón
# PRESENTISMO_FICHADAS_DIR=./data/presentismo/fichadas  # destino de la persistencia (default)
```

Generar el **snapshot del padrón** (una vez; requiere Oracle — completar `RRHH_ORACLE_*` en
`.env` para este paso):

```bash
sudo -u rs956 npm run presentismo -- sincronizar-padron    # crea data/presentismo/padron.json
```

> Alternativa sin Oracle en el servidor: generar el snapshot en otra máquina y copiar
> `data/presentismo/padron.json` a `/opt/rs956/data/presentismo/`.

Asegurar permisos de escritura del usuario `rs956` sobre `logs/` y `data/presentismo/fichadas/`
(donde el servicio persiste):

```bash
sudo -u rs956 mkdir -p /opt/rs956/logs /opt/rs956/data/presentismo/fichadas
```

## 4. Activar el servicio y el reinicio diario

```bash
sudo cp deploy/rs956-fichadas.service \
        deploy/rs956-fichadas-restart.service \
        deploy/rs956-fichadas-restart.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rs956-fichadas.service          # arranque al boot + ya
sudo systemctl enable --now rs956-fichadas-restart.timer    # rollover diario ~06:00
```

Si `node` no está en `/usr/bin/node`, editar `ExecStart` del unit con la ruta real
(`which node`).

## 5. Verificación

```bash
systemctl status rs956-fichadas                 # active (running)
journalctl -u rs956-fichadas -f                 # ciclo inicial + resumen de estado
```

- Fuera de las ventanas de checkpoint, los ciclos se registran `omitido` (normal).
- Dentro de una ventana, `logs/service-servicio-fichadas.ndjson` muestra ciclos `success` con
  `fichadasNuevas`, y aparece `data/presentismo/fichadas/<periodo>.json` con las fichadas.
- Confirmar el consumo por el cálculo:
  ```bash
  sudo -u rs956 npm run presentismo -- calcular --periodo <YYYYMM> --legajo <N> --formato tabla
  ```

**Reinicio del servidor**: reiniciar la máquina y confirmar `systemctl status rs956-fichadas`
en `active` sin intervención.

## 6. Rollover diario (continuidad multi-día)

El scheduler no reinicia los checkpoints al cambiar de día; el timer lo resuelve reiniciando el
servicio a las 06:00. Verificar:

```bash
systemctl list-timers | grep rs956-fichadas-restart     # próximo disparo ~06:00
# Prueba puntual (reinicia el servicio ahora):
sudo systemctl start rs956-fichadas-restart.service
```

Tras el reinicio, el servicio vuelve a consultar en las ventanas del nuevo día y las fichadas
del día previo siguen en su archivo por período (ya persistidas — no se pierden).

## 7. Actualización / rollback

```bash
# Actualizar código y dependencias:
sudo -u rs956 git -C /opt/rs956 pull
sudo -u rs956 npm --prefix /opt/rs956 ci --omit=dev
sudo systemctl restart rs956-fichadas.service

# Rollback (detener y deshabilitar):
sudo systemctl disable --now rs956-fichadas.service rs956-fichadas-restart.timer
```

Los datos persistidos en `data/presentismo/fichadas/` quedan intactos (los consume el cálculo).

## 8. Despliegue de la interfaz web (frontend + API)

La UI de presentismo (features 007 + 008: calendario mensual, generación contigua de meses y
reclasificación) se sirve con `src/web/server.js`: expone la API en `/api` y los estáticos del
build de React (`frontend/dist`). Opera solo sobre los archivos JSON locales del dominio —no
toca Oracle ni el reloj— y **reutiliza la misma configuración `PRESENTISMO_*`** del cálculo
(mismo `data/presentismo/`, `config/categorias.json` y `logs/`).

Referencias: [contrato web-api 008](../specs/008-calendario-contiguo/contracts/web-api.md).

### 8.1 Construir el frontend en el servidor

`frontend/dist/` está gitignored (no viene en el clone) y `vite` es dependencia de desarrollo,
así que el build usa `npm ci` **completo** (no `--omit=dev`):

```bash
cd /opt/rs956/frontend
sudo -u rs956 npm ci            # instala React + vite (devDependencies incluidas)
sudo -u rs956 npm run build     # genera /opt/rs956/frontend/dist
```

> Alternativa sin toolchain de build en el servidor: construir `frontend/dist` en otra máquina
> (`npm ci && npm run build`) y copiar el directorio `dist/` a `/opt/rs956/frontend/`.

### 8.2 Configurar el puerto

El servidor escucha en `PRESENTISMO_WEB_PORT` (default `4173`). Ajustable en el unit
(`Environment=`) o en `.env`:

```dotenv
PRESENTISMO_WEB_PORT=4173
```

Si `frontend/dist` no existe, la web responde con un aviso pidiendo compilar el frontend (la API
sigue funcionando).

### 8.3 Activar el servicio web

```bash
sudo cp deploy/rs956-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rs956-web.service        # arranque al boot + ya
```

Si `node` no está en `/usr/bin/node`, editar `ExecStart` del unit con la ruta real
(`which node`).

### 8.4 Verificación

```bash
systemctl status rs956-web                            # active (running)
curl -s http://localhost:4173/api/calendarios         # { "periodos": [...], "ultimo": ..., "mesActual": ..., "generables": [...] }
```

Abrir `http://<servidor>:4173/` en el navegador: debe mostrar el calendario del último mes
generado. Si no hay ninguno, el estado vacío ofrece generar el mes en curso (semilla).

### 8.5 Exposición y reverse proxy (opcional)

El servicio corre como usuario sin privilegios en un puerto alto (4173). Para servir en `80`/`443`
con TLS, usar un reverse proxy (nginx/Caddy) por delante en vez de darle privilegios al proceso
Node. Ejemplo mínimo nginx:

```nginx
server {
    listen 80;
    server_name presentismo.example;
    location / { proxy_pass http://127.0.0.1:4173; }
}
```

### 8.6 Actualización

```bash
sudo -u rs956 git -C /opt/rs956 pull
sudo -u rs956 npm --prefix /opt/rs956 ci --omit=dev          # deps del backend
cd /opt/rs956/frontend && sudo -u rs956 npm ci && sudo -u rs956 npm run build   # rebuild del front
sudo systemctl restart rs956-web.service
```

## 9. Notas operativas

- **Persistencia**: el servicio escribe las fichadas en `data/presentismo/fichadas/<periodo>.json`
  (dedup por `rawHex`, escritura atómica). El store en memoria se usa sólo para la completitud
  de checkpoints; la fuente durable es el archivo.
- **Privacidad (Principio V)**: los logs NDJSON del servicio nunca contienen `rawHex` ni
  credenciales; el `rawHex` (frame técnico del protocolo, no biométrico) vive sólo en el archivo
  de fichadas.
- **Refresco del padrón**: `data/presentismo/padron.json` es una foto. Si cambia el padrón
  activo, reprogramar `sincronizar-padron` (requiere Oracle) y copiar/generar el snapshot.
- **Node**: mínimo 20.12 (por `--env-file-if-exists`).

## 10. Permisos de archivos
 sudo chown -R rs956:rs956 /opt/rs956
 