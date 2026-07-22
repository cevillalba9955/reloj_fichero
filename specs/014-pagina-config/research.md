# Research: Página de Configuración

## 1. Cómo editar `.env` sin romper lo que ya hay

**Decisión**: nuevo módulo `src/config/env-file.js` que lee el `.env` línea por
línea, conserva comentarios y variables no gestionadas tal cual, y solo
reemplaza (o agrega, si faltaba) las líneas `CLAVE=valor` de las claves que
esta feature gestiona (`FICHADAS_HOST`, `FICHADAS_PORT`,
`FICHADAS_TIMEOUT_MS`, `FICHADAS_TICK_INTERVAL_MS`,
`FICHADAS_STATUS_INTERVAL_MS`, `FICHADAS_ENTRADA_HORA`,
`FICHADAS_ENTRADA_DURACION`, `FICHADAS_FULL_HANDSHAKE`,
`FICHADAS_CONTROL_PORT`, `PRESENTISMO_RESUMEN_PERIODO`). Escritura atómica
(archivo temporal en el mismo directorio + `rename`) para no dejar el `.env` a
medio escribir ante un fallo de disco (edge case del spec).

**Rationale**: el proyecto ya carga `.env` con el flag nativo de Node
`--env-file-if-exists` (sin dependencia `dotenv`); no hay razón para sumar una
librería de parseo solo para reescribir el archivo. Preservar comentarios y
claves ajenas (`RRHH_ORACLE_*`, rutas) es necesario porque conviven en el mismo
archivo y están explícitamente fuera de alcance (FR-014, Assumptions).

**Alternativas consideradas**:
- Reescribir el archivo entero regenerando todas las claves conocidas →
  rechazada: perdería comentarios explicativos existentes (el `.env` actual
  tiene bloques documentados por feature) y arriesgaría tocar claves fuera de
  alcance si algún día se agregan sin actualizar esta feature.
- Guardar la config editable en un archivo nuevo separado (p. ej.
  `config/reloj.json`) en vez de en `.env` → rechazada: contradice el pedido
  explícito del usuario ("hacer configurable... el archivo .env") y duplicaría
  la fuente de verdad entre dos archivos para las mismas variables que ya lee
  `consulta-programada.js` vía `env.FICHADAS_*`.

## 2. Cómo probar la conexión al reloj sin violar el Principio III

**Decisión**: agregar `POST /probar-conexion` al servidor de control HTTP
local que ya expone `rs956-fichadas` (`crearServidorControl` en
`src/cli/consulta-programada.js`, junto a `POST /tick`,
`contracts/control-api.md` de la feature 010). Recibe `{ host, port }` (los
valores *candidatos*, no necesariamente guardados todavía), abre una conexión
de prueba con `connectSocket(host, port, timeoutMs)` de
`src/protocol/client.js` (el mismo driver aislado que ya usa el scheduler),
cierra el socket sin ejecutar ningún comando del protocolo, y responde
`{ ok: true }` o `{ ok: false, motivo }`. El proceso web
(`configuracion-handlers.js`) solo reenvía la petición del frontend a este
control-API (mismo patrón que `consultar-reloj-cliente.js` con `/tick`) —
nunca abre el socket él mismo.

**Rationale**: el Principio III es NON-NEGOTIABLE: "ningún detalle del
protocolo se filtra hacia la UI o la capa de negocio" y toda la lógica vive en
un módulo adaptador aislado. El único proceso autorizado a hablar con el reloj
es `rs956-fichadas`; el proceso web ya tiene el precedente de pedirle acciones
vía HTTP local (`/tick`) en vez de hacerlas él mismo.

**Alternativas consideradas**:
- Abrir el socket directamente desde `configuracion-handlers.js` (proceso web)
  → rechazada: viola el Principio III explícitamente.
- Requerir que el usuario guarde primero y reinicie el servicio antes de poder
  probar → rechazada: no cumple FR-007 ("probar antes de guardar") y hace
  mucho más lento detectar un error de tipeo en la IP.
- Extender `/tick` para que además devuelva el estado de conexión → rechazada:
  `/tick` opera sobre la configuración *ya cargada* del proceso en ejecución,
  no sobre un host/puerto candidato aún no guardado; mezclar ambas
  responsabilidades en una ruta complica su contrato.

**Nota de disponibilidad**: `FICHADAS_CONTROL_PORT` es opt-in (si no está
configurado, el servidor de control no se levanta, contracts/control-api.md).
Si el control-API no responde, `POST /api/configuracion/reloj/probar-conexion`
devuelve un error claro ("el servicio de fichadas no tiene su servidor de
control activo") en vez de reintentar o abrir un socket alternativo.

## 3. Escritura de `categorias.json` y `motivos-ausencia.json`

**Decisión**: agregar a `categorias-config.js` y `motivos-ausencia-config.js`
funciones de serialización (`serializarCategoriasConfig`,
`serializarMotivosAusenciaConfig`) que producen el mismo formato JSON que ya
consumen `parseCategoriasConfig`/`parseMotivosAusenciaConfig`, y funciones de
edición que operan sobre una copia en memoria de la config ya parseada, la
re-validan pasándola de nuevo por el parser existente (mismo criterio
fail-fast, para no poder guardar nunca un estado inválido) y solo entonces
escriben a disco (atómico, igual que `.env`).

**Rationale**: reutilizar el parser existente como validador de "¿este cambio
deja la config en un estado válido?" evita duplicar reglas de validación en
dos lugares (lectura y escritura) y garantiza que lo que el cálculo de
presentismo carga en el próximo arranque es exactamente lo que la UI acaba de
validar.

**Conflicto detectado y resuelto**: `parseMotivosAusenciaConfig` (spec 012)
hoy falla duro si no queda ningún motivo activo
(`el catálogo debe tener al menos un motivo activo`). El edge case de esta
spec permite explícitamente vaciar el catálogo de motivos activos ("es una
decisión de negocio, no una restricción técnica"). **Resolución**: se relaja
esa regla de `fail()` (que aborta la carga completa del proceso) a una
validación no bloqueante — el archivo se guarda y se carga igual, sin motivos
activos disponibles. Efecto aguas abajo: la página "Justificación de
Ausencias" (spec 012) simplemente muestra un selector de motivos vacío hasta
que se reactive o cree uno; no se agrega ningún caso nuevo de error ahí, ya
maneja catálogos con response vacío en su contrato de UI.

## 4. Layout de la página en el frontend

**Decisión**: `PaginaConfiguracion.jsx` usa `Tabs` de AntD (ya en
dependencias, sin librería nueva) con tres pestañas — "Reloj y servicio"
(Historias 1 y 4), "Motivos de ausencia" (Historia 2), "Categorías y
modalidades" (Historia 3) — cada una con su propio formulario/tabla y su
propio guardado independiente (una pestaña no bloquea ni se ve afectada por
errores de validación en otra).

**Rationale**: separar el guardado por sección evita que un error de
validación en, por ejemplo, una modalidad horaria bloquee el guardado de la
IP del reloj (coherente con la prioridad P1 > P2 > P3 > P4 de las historias:
cada una debe ser usable de forma independiente). AntD `Tabs` es el
componente más simple disponible en el stack ya usado (`Layout`, `Menu`
en `AppShell.jsx`) sin agregar dependencias.

**Alternativas consideradas**: página única con todo junto (acordeón) →
rechazada por menor claridad visual con 4 grupos de parámetros más 2 catálogos
tabulares; cuatro páginas separadas en la navegación principal → rechazada,
infla el menú lateral para algo que conceptualmente es "una" pantalla de
configuración (FR-001 pide una única página).

## 5. Validación de parámetros — resumen técnico

| Parámetro | Regla |
|---|---|
| `FICHADAS_HOST` | string no vacío (no se valida resolución DNS ni formato IP estricto; un hostname también es válido, igual que hoy en `parseCliArgs`) |
| `FICHADAS_PORT`, `FICHADAS_CONTROL_PORT` | entero, `1 <= puerto <= 65535` |
| `FICHADAS_TIMEOUT_MS`, `FICHADAS_TICK_INTERVAL_MS`, `FICHADAS_STATUS_INTERVAL_MS` | entero `> 0` |
| `FICHADAS_ENTRADA_DURACION` | entero `>= 0` |
| `FICHADAS_ENTRADA_HORA` | `HH:MM`, reutiliza `parseHoraMinuto` de `src/presentismo/domain/tiempo.js` |
| `FICHADAS_FULL_HANDSHAKE` | booleano (checkbox en UI → `"true"`/`"false"` en archivo) |
| `PRESENTISMO_RESUMEN_PERIODO` | enum `MENSUAL` \| `QUINCENAL` |
| Modalidad (horarios) | reutiliza las reglas ya existentes en `parseModalidad` (`categorias-config.js`): tipo, apertura < cierre, márgenes enteros ≥ 0, ventanas válidas |
| Categoría | código no vacío y único al crear (inmutable después, FR-012b); modalidad referenciada debe existir |
| `esquemaSemanal` | reutiliza `parseEsquemaSemanal`: lista no vacía, sin días repetidos, nombres de día válidos |
| Motivo | `id` no vacío y único al crear (inmutable después); `etiqueta` no vacía; `tipoPago` enum `Paga`/`No paga`; `activo` booleano |

Todas las reglas reutilizan funciones ya existentes en el dominio
(`parseHoraMinuto`, `parseModalidad`, `parseEsquemaSemanal`,
`parseCategoriasConfig`, `parseMotivosAusenciaConfig`) para no duplicar
lógica de validación entre la carga al arrancar y el guardado desde la UI.
