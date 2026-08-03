# Implementation Plan: Control de Acceso por Roles (Lector / Editor / Configurador)

**Branch**: `016-control-acceso-roles` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-control-acceso-roles/spec.md`

## Summary

Agrega control de acceso por rol (Lector / Editor / Configurador,
jerárquicos y acumulativos) a la API web y a la SPA React existentes. El
rol de cada request se resuelve leyendo un header de identidad (`X-Apex-Rol`)
y traduciéndolo con un mapeo fijo nuevo (`config/roles.json`); el backend
no sabe ni le importa quién pone ese header — la app está embebida como
iframe en una página de APEX, que pasa el rol por la URL del iframe y el
frontend lo reenvía como ese header en cada llamada a `/api` (mecanismo
confirmado 2026-07-28, ver research.md §1 y
`contracts/apex-iframe-embed.md`). Si
no se puede resolver, el rol cae a `lector` (FR-004). El servidor rechaza
con `403 ACCESO_DENEGADO` toda operación de escritura que el rol no
autorice, y toda operación (lectura o escritura) sobre `/api/configuracion/*`
salvo con rol `configurador` (FR-007/FR-009); la interfaz oculta/deshabilita
en consecuencia los mismos controles (FR-011) y muestra el rol actual del
usuario (FR-012) vía un endpoint nuevo de solo lectura,
`GET /api/acl/mi-rol`. No se agrega pantalla de login ni se toca Oracle, el
reloj biométrico, ni la persistencia de negocio existente.

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript, ESM), mismo stack que
007/010/011/012/014/015. Frontend React (Vite) en `frontend/`.

**Primary Dependencies**: Ninguna nueva. Reutiliza `node:http`/el router sin
framework existente (`src/web/api/router.js`, forma de error uniforme
`{ error: { codigo, mensaje } }`), `node:fs` para el nuevo config JSON (mismo
patrón que `categorias-config.js`/`motivos-ausencia-config.js`), y `React
Context` (ya disponible, sin librería extra) para compartir el rol resuelto
entre `AppShell` y los formularios de escritura.

**Storage**: N/A para datos de negocio (Principio VI no aplica: esta feature
no toca el estado operativo por período ni el registro de liquidación en
Oracle). Único dato nuevo persistido: `config/roles.json` — mapeo fijo
rol-de-origen → rol interno, mismo patrón de archivo versionado con override
por variable de entorno y `*.example.json` que `config/categorias.json` /
`config/motivos-ausencia.json` (research.md §3). Se relee en cada acceso
(hot-reload), igual criterio que `motivosAusenciaConfig` en `wiring.js`.

**Testing**: `node:test` + `node:assert` para el loader de
`config/roles.json` (unit), para `exigirRol`/resolución de rol (unit), y
para el rechazo `403 ACCESO_DENEGADO` en cada grupo de rutas protegidas
(`tests/contract/web-api-acl.test.js`, ejercitando también una ruta de cada
handler existente igual que `web-api-vacaciones.test.js` etc. hacen hoy);
integración de punta a punta por rol
(`tests/integration/control-acceso.integration.test.js`, calibrada 1 a 1 con
los Acceptance Scenarios de las 3 historias del spec); componentes de UI con
`*.test.jsx` (ocultamiento de "Configuración" en `AppShell.test.jsx`,
deshabilitado de controles en los `Formulario*.test.jsx` ya existentes).

**Target Platform**: Mismo runtime Node.js 20+ (Windows/Linux) y navegador
vía la SPA React existente; mismo proceso único `rs956-web` (esta feature no
agrega ni cambia procesos ni toca `rs956-fichadas`).

**Project Type**: Web application (backend Node.js + frontend React), misma
estructura que 007/010/011/012/014/015.

**Performance Goals**: La resolución de rol y el chequeo de rango son
comparaciones en memoria sobre un objeto ya parseado (mismo costo que releer
`categorias.json`/`motivos-ausencia.json` hoy, despreciable para el volumen
de uso de este sistema); no agrega latencia perceptible a ninguna ruta.

**Constraints**: El rol viaja en la URL del iframe (`?rol=...`), editable
desde las herramientas de desarrollador del navegador — riesgo aceptado
explícitamente (2026-07-28) por ser una app de red interna; ver
`contracts/apex-iframe-embed.md`. Ningún control de acceso puede depender únicamente de la interfaz
(FR-009); todo chequeo relevante también se aplica en el servidor. No se
agrega pantalla de login propia. No se modifica el campo `autor` de texto
libre ya existente en vacaciones ni se construye auditoría de cambios
(Assumptions del spec, relacionado con la nota pendiente de la feature 014).

**Scale/Scope**: Mapeo de un puñado de roles de origen (los que en el futuro
exponga APEX) a 3 roles internos; sin concurrencia significativa (el mapeo
es de solo lectura para la app, se edita a mano en el archivo).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: el rol resuelto se
  expone vía un contexto de React (estado compartido centralizado, no prop
  drilling) consumido por `AppShell` y los componentes de formulario; ningún
  componente de UI decide autorización contra Oracle ni contra el reloj —
  solo lee el rol ya resuelto por la API. **Cumple**.
- **II — Repositorio de Datos Oracle Aislado**: esta feature no agrega ni
  modifica acceso a Oracle (el mecanismo real de APEX, si en el futuro
  consulta Oracle, es una feature aparte — ver Assumptions). **Cumple** (no
  aplica).
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: no se toca el driver
  del reloj ni su protocolo; `POST /api/fichadas-hoy/consultar-reloj` pasa a
  requerir rol `editor`, pero el driver en sí no cambia. **Cumple**.
- **IV — Test-First en Capas Críticas**: el control de acceso no es
  "protocolo" ni "repositorio Oracle" en el sentido estricto del principio,
  pero por ser una capa de seguridad transversal se aplica el mismo criterio
  de test-first: los tests de `exigirRol`/resolución de rol y el contrato
  `403 ACCESO_DENEGADO` de cada ruta protegida se escriben antes de envolver
  las rutas existentes. **Cumple** (buena práctica adoptada, no exigida
  literalmente por el principio).
- **V — Observabilidad y Protección de Datos Sensibles**: el `rolOrigen`
  leído del header es un dato de identidad, no biométrico; no se introduce
  ningún log de fichajes nuevo. No se agrega auditoría de "quién hizo qué
  cambio" (fuera de alcance, ver Assumptions del spec — coherente con la
  feature 014, que dejó ese punto pendiente de "una eventual autenticación
  de usuarios": esta feature resuelve el control de acceso, no la
  auditoría). **Cumple**.
- **VI — Persistencia por Niveles**: `config/roles.json` es configuración de
  dominio (como `categorias.json`/`motivos-ausencia.json`), no estado
  operativo por período ni registro de liquidación; no abre ningún camino
  nuevo de escritura a Oracle. **Cumple** (no aplica).
- **Flujo de Git**: desarrollo en la rama `016-control-acceso-roles`.
  **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity
Tracking` vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios — ver research.md y
data-model.md; el diseño no introduce login propio, acceso a Oracle, ni
cambios al protocolo del reloj o a la persistencia de negocio existente.

## Project Structure

### Documentation (this feature)

```text
specs/016-control-acceso-roles/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md         # Fase 1 — entidades y su forma persistida
├── quickstart.md         # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   └── web-api-acl.md    # GET /api/acl/mi-rol + extensión 403 ACCESO_DENEGADO
│                          # sobre rutas existentes
├── checklists/
│   └── requirements.md   # Checklist de calidad del spec (ya existente)
└── tasks.md              # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
config/
├── roles.json             # NUEVO — mapeo fijo rolOrigen→rolInterno + rolPorDefecto
└── roles.example.json     # NUEVO — plantilla sin nombres de roles reales de APEX

src/
├── config/
│   └── roles-config.js    # NUEVO — loader fail-fast de config/roles.json (mismo
│                            # estilo que env-file.js): valida rolPorDefecto y cada
│                            # valor de `mapeo` contra los 3 roles válidos; expone
│                            # `mapear(rolOrigen)` y `rolPorDefecto`
├── web/
│   ├── acl/
│   │   └── autorizacion.js  # NUEVO — ROLES ordenados, `resolverRolActual(req, ctx)`
│   │                          # (lee el header configurado, aplica rolesConfig.mapear),
│   │                          # y `exigirRol(rolMinimo, handler)` (envoltorio de
│   │                          # handler del router; lanza ApiError(403,
│   │                          # 'ACCESO_DENEGADO', ...) si el rango no alcanza)
│   ├── wiring.js  # + `rolesConfigPath`/`aclHeaderRol` resueltos desde el entorno,
│   │                # `rolesConfig` (getter con re-lectura por request, mismo
│   │                # criterio que `motivosAusenciaConfig`)
│   ├── api/
│   │   ├── acl-handlers.js            # NUEVO — GET /api/acl/mi-rol (sin exigirRol)
│   │   ├── calendario-handlers.js     # + exigirRol('editor', ...) en generar/
│   │   │                                # cerrar/reabrir/reclasificar
│   │   ├── fichadas-hoy-handlers.js   # + exigirRol('editor', ...) en correcciones/
│   │   │                                # pausas/retiros-anticipados/consultar-reloj
│   │   ├── justificaciones-handlers.js  # + exigirRol('editor', ...) en POST/DELETE
│   │   ├── vacaciones-handlers.js     # + exigirRol('editor', ...) en asignaciones
│   │   │                                # (POST/DELETE)
│   │   ├── configuracion-handlers.js  # + exigirRol('configurador', ...) en TODAS
│   │   │                                # sus rutas, incluidos los GET (FR-007)
│   │   └── router.js  # sin cambios de forma (sigue exponiendo `req` al handler,
│   │                    # que es lo único que necesita `exigirRol`)
│   └── server.js  # + registra acl-handlers.js

frontend/
├── src/
│   ├── api/
│   │   └── acl-client.js       # NUEVO — mismo patrón que configuracion-client.js:
│   │                              # obtenerMiRol() → GET /api/acl/mi-rol
│   ├── contexto/
│   │   └── RolContext.jsx      # NUEVO — Provider que hace un único fetch al montar
│   │                              # la app y expone `{ rol, puede(rolMinimo) }` vía
│   │                              # un hook `useRol()`
│   ├── components/
│   │   ├── AppShell.jsx  # + oculta la entrada de navegación "Configuración" y
│   │   │                   # muestra el rol actual cuando `!puede('configurador')`
│   │   │                   # / siempre, respectivamente
│   │   ├── FormularioCorreccion.jsx        # + deshabilita/oculta si `!puede('editor')`
│   │   ├── FormularioPausaRetiro.jsx       # ídem
│   │   ├── FormularioJustificacion.jsx     # ídem
│   │   ├── FormularioAsignarVacaciones.jsx # ídem
│   │   └── PaginaCalendario.jsx            # deshabilita/oculta generar/cerrar/
│   │                                          # reabrir/reclasificar si `!puede('editor')`
│   └── App.jsx  # envuelve el árbol con `RolContext.Provider`

tests/
├── contract/
│   └── web-api-acl.test.js   # GET /api/acl/mi-rol + 403 ACCESO_DENEGADO en al menos
│                               # una ruta de cada handler protegido (calendario,
│                               # fichadas-hoy, justificaciones, vacaciones,
│                               # configuracion)
├── integration/
│   └── control-acceso.integration.test.js  # 1 a 1 con los Acceptance Scenarios de
│                                              # US1/US2/US3 y el Edge Case de rol
│                                              # indeterminado
└── unit/
    ├── roles-config.test.js     # carga válida, rolPorDefecto/mapeo inválidos
    └── autorizacion.test.js     # resolverRolActual (header ausente/desconocido/
                                    # mapeado), exigirRol (rango suficiente/insuficiente)
```

**Structure Decision**: Web application ya existente (backend Node.js en
`src/` + frontend React en `frontend/`, feature 007). Esta feature no agrega
proyectos ni cambia la topología de dos procesos backend (`rs956-web` +
`rs956-fichadas`); solo extiende `rs956-web` con una capa de autorización
transversal (`src/web/acl/`) y un archivo de configuración nuevo
(`config/roles.json`), siguiendo el mismo patrón de capas (config → API →
cliente → componente/contexto) que 010/011/012/014/015.

## Complexity Tracking

*Sin violaciones del Constitution Check — sección vacía.*
