# Feature Specification: Borrar la memoria del reloj

**Feature Branch**: `043-borrar-memoria-reloj`

**Created**: 2026-11-24

**Status**: Implemented (documentación retroactiva — issue #39)

**Input**: User description: "En el proceso de ingeniería inversa se identificó la función para eliminar de la memoria del reloj las fichadas ya procesadas. Agregar botón para limpiarlo, y mostrar cantidad de fichadas en memoria. Solo habilitado para rol Configurador."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver cuántas fichadas hay en la memoria del reloj (Priority: P1)

El Configurador abre Configuración › "Memoria del reloj" y ve la cantidad de
fichadas almacenadas en el reloj, sin que se descarguen ni se modifiquen.

**Why this priority**: es la información necesaria para decidir si conviene limpiar.

**Acceptance Scenarios**:

1. **Given** un reloj con N fichadas pendientes, **When** se abre la pestaña, **Then** se muestra "Fichadas en memoria: N".
2. **Given** el botón "Actualizar", **When** se presiona, **Then** se vuelve a consultar el reloj.
3. **Given** el reloj inalcanzable o con una consulta en curso, **Then** se muestra el error sin romper el panel.

---

### User Story 2 - Limpiar la memoria del reloj sin perder fichadas (Priority: P1)

El Configurador presiona "Limpiar memoria del reloj", confirma, y el sistema
guarda las fichadas pendientes y recién después las borra del reloj.

**Acceptance Scenarios**:

1. **Given** fichadas pendientes, **When** se confirma la limpieza, **Then** se descargan y persisten, luego se borran del reloj y la cantidad se refresca (0).
2. **Given** la descarga o la persistencia fallan, **Then** NO se borra nada y se informa el motivo.
3. **Given** una consulta del scheduler en curso, **Then** no se borra nada y se pide reintentar.
4. **Given** el reloj sin fichadas, **Then** no se envía el borrado y se informa que ya estaba vacía.
5. **Given** que el usuario cancela la confirmación, **Then** no se llama a la API.

---

### User Story 3 - Solo el Configurador (Priority: P1)

**Acceptance Scenarios**:

1. **Given** un rol Lector o Editor, **When** llama a las rutas de memoria del reloj, **Then** recibe 403 `ACCESO_DENEGADO` (la sección Configuración ya es exclusiva del Configurador, feature 016).

## Requirements *(mandatory)*

- **FR-001**: La pantalla DEBE mostrar la cantidad de fichadas en la memoria del reloj, obtenida solo con el conteo (`0xB4`), sin descargar el detalle.
- **FR-002**: La limpieza DEBE descargar y persistir las fichadas pendientes ANTES de borrar, dentro del mismo candado single-flight del scheduler.
- **FR-003**: Ante cualquier fallo de descarga/persistencia, o ciclo en curso, la limpieza NO DEBE borrar.
- **FR-004**: El borrado DEBE usar la secuencia real documentada en `research/protocolo_prosoft_rs596.md` §6.5 (`0x81` apertura → `0xA8` → `0x81` cierre) en una sesión TCP propia; no se fabrican bytes (Constitución, Principio III).
- **FR-005**: El proceso web NO DEBE abrir conexión al reloj: delega en el servicio de fichadas por el control local (`POST /memoria-reloj`, `POST /limpiar-memoria`, solo 127.0.0.1).
- **FR-006**: Las rutas web `GET /api/configuracion/reloj/memoria` y `POST /api/configuracion/reloj/limpiar-memoria` DEBEN exigir rol `configurador`.
- **FR-007**: La limpieza DEBE pedir confirmación explícita (acción irreversible).

## Key Entities

- **Memoria del reloj**: fichadas pendientes almacenadas en el equipo; se cuenta con `0xB4` y se vacía con `0xA8`.

## Edge Cases / Limitaciones conocidas

- Una fichada que ingrese al reloj entre la descarga y el borrado (segundos) se perdería.
- El borrado usa el handshake reducido por defecto; si algún firmware lo rechaza, activar "Usar handshake completo" en Configuración.

## Success Criteria

- **SC-001**: Tras limpiar, el conteo del reloj es 0 y las fichadas previas siguen disponibles en el repositorio.
- **SC-002**: Ningún intento fallido de descarga resulta en borrado.

## Implementación

- Protocolo: `buildOpenOperationCommand`, `buildClearCommand`, `runCountSession`, `runClearSession` (`src/protocol`).
- Scheduler: `tick({ limpiarMemoria })`, `contarMemoria()`; servicio: `limpiarMemoriaReloj()`, `contarMemoriaReloj`.
- Control local, cliente web y handlers: `src/cli/consulta-programada.js`, `consultar-reloj-cliente.js`, `configuracion-handlers.js`.
- UI: `PanelMemoriaReloj.jsx` (pestaña en `PaginaConfiguracion.jsx`).
- Tests: `tests/unit/protocol-memoria-reloj.test.js`, `tests/contract/control-api-memoria-reloj.test.js`, `PanelMemoriaReloj.test.jsx`.
