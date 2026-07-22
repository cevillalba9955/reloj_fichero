# Data Model: Página de Configuración

Ninguna de estas entidades introduce persistencia nueva (base de datos ni
colección por período, Principio VI): todas ya existen como archivos de
configuración leídos al arrancar; esta feature agrega la capacidad de
editarlas y reescribirlas.

## Parámetro de Conexión al Reloj (`.env`)

Claves sueltas del archivo `.env`, no un objeto único persistido — se agrupan
aquí porque la UI las presenta juntas (Historia 1 y 4).

| Campo (clave `.env`) | Tipo | Default | Regla |
|---|---|---|---|
| `FICHADAS_HOST` | string | *(sin default; requerido)* | no vacío |
| `FICHADAS_PORT` | int | `5005` | `1..65535` |
| `FICHADAS_TIMEOUT_MS` | int | `5000` | `> 0` |
| `FICHADAS_TICK_INTERVAL_MS` | int | `300000` | `> 0` |
| `FICHADAS_STATUS_INTERVAL_MS` | int | `60000` | `> 0` |
| `FICHADAS_ENTRADA_HORA` | `HH:MM` | `07:00` | formato de hora válido |
| `FICHADAS_ENTRADA_DURACION` | int (minutos) | `30` | `>= 0` |
| `FICHADAS_FULL_HANDSHAKE` | boolean | `false` | — |
| `FICHADAS_CONTROL_PORT` | int \| ausente | *(deshabilitado)* | si está presente, `1..65535` |

**Transiciones**: sin estados; un guardado válido reemplaza el valor anterior.
El valor persistido no afecta al proceso `rs956-fichadas` ya en ejecución
hasta su próximo reinicio (FR-006) — no hay "aplicado" vs "pendiente" como
estado modelado, es una propiedad de cómo Node carga `.env` al iniciar.

## Parámetro de Presentismo (`.env`)

| Campo (clave `.env`) | Tipo | Default | Regla |
|---|---|---|---|
| `PRESENTISMO_RESUMEN_PERIODO` | enum | `MENSUAL` | `MENSUAL` \| `QUINCENAL` |

## Motivo de Ausencia (`config/motivos-ausencia.json` → `motivos[]`)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | string | no vacío, único, **inmutable** tras crearse (FR-010) |
| `etiqueta` | string | no vacía, editable |
| `tipoPago` | enum | `Paga` \| `No paga`, editable |
| `activo` | boolean | editable (reemplaza al borrado, FR-009) |

**Transiciones de estado**: `activo: true → false` (desactivar) y
`false → true` (reactivar) son las únicas transiciones; no hay borrado. El
catálogo puede quedar con cero motivos activos (edge case del spec) — ver
research.md §3 sobre la relajación del fail-fast previo de spec 012.

**Relación**: una Justificación de Ausencia (spec 012) referencia un `id` de
Motivo en el momento en que se registra; desactivar un motivo no modifica
justificaciones ya registradas (dato histórico independiente, FR-009).

## Modalidad Horaria (`config/categorias.json` → `modalidades{}`)

| Campo | Tipo | Regla |
|---|---|---|
| clave del objeto (nombre) | string | identificador de la modalidad dentro del archivo |
| `tipo` | enum | `Mensual` \| `Quincenal` |
| `aperturaOficial`, `cierreOficial` | `HH:MM` | apertura < cierre |
| `margenAperturaMin`, `margenCierreMin` | int | `>= 0` |
| `ventanaApertura`, `ventanaCierre` | `[HH:MM, HH:MM]` | cierre de la ventana posterior a su apertura |

**Transiciones**: alta y edición libres; **eliminación bloqueada** si alguna
Categoría la referencia (FR-012, el sistema debe indicar cuáles).

## Categoría de Empleado (`config/categorias.json` → `categorias{}`)

| Campo | Tipo | Regla |
|---|---|---|
| clave del objeto (código) | string | no vacío, único, **inmutable** tras crearse (FR-012b) |
| `modalidad` | string (referencia) | debe existir en `modalidades{}` |

**Transiciones**: alta (código + modalidad inicial) y edición de `modalidad`
únicamente; **sin eliminación** desde esta página (FR-012a).

## Esquema Semanal (`config/categorias.json` → `esquemaSemanal[]`)

| Campo | Tipo | Regla |
|---|---|---|
| lista de días | `string[]` | no vacía, sin repetidos, cada valor es un día de semana reconocido (`lunes`..`domingo`) |

**Alcance**: un único esquema compartido por todas las modalidades (no hay
uno por modalidad); editarlo afecta el cálculo de todas ellas por igual.

## Resumen de invariantes cross-entidad

- Una Modalidad en uso por ≥1 Categoría no se puede eliminar (FR-012).
- Una Categoría no se puede eliminar desde esta página, solo agregar/editar su
  Modalidad asignada (FR-012a); su código es inmutable (FR-012b).
- Un `id` de Motivo es inmutable tras crearse; no se puede duplicar (FR-010).
- Ningún guardado parcialmente inválido llega a persistirse: toda edición se
  re-valida con el mismo parser fail-fast que ya usa la carga al arrancar
  (research.md §3) antes de escribirse a disco.
