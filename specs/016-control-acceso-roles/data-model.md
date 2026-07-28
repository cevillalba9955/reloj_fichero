# Data Model: Control de Acceso por Roles (Lector / Editor / Configurador)

**Feature**: 016-control-acceso-roles | **Date**: 2026-07-28

Ninguna de las entidades de esta feature se persiste como dato de negocio
(presentismo, vacaciones, etc.); son configuración de dominio (mapeo de
roles) y datos resueltos por request (identidad/rol actual), consistente con
que esta feature no agrega ni modifica el Principio VI (persistencia por
niveles) de la constitución.

## Rol

Uno de exactamente tres valores, con orden jerárquico y acumulativo
(FR-001):

| Valor      | Rango | Incluye los permisos de |
|------------|-------|--------------------------|
| `lector`      | 0 | — |
| `editor`      | 1 | `lector` |
| `configurador`| 2 | `editor` (y por lo tanto `lector`) |

Representado en código como una lista ordenada (`['lector', 'editor',
'configurador']`); "tiene rango suficiente" es `rango(rolActual) >=
rango(rolMinimoRequerido)`.

## Identidad resuelta (por request)

Dato efímero, calculado en cada request, nunca persistido:

| Campo | Tipo | Descripción |
|---|---|---|
| `rolOrigen` | string \| null | Valor crudo leído del header de identidad (ver research.md §1); `null` si el header no vino en la request. |
| `rol` | `'lector'` \| `'editor'` \| `'configurador'` | Rol interno ya resuelto: `mapeo[rolOrigen]` si existe una entrada, si no `rolPorDefecto` de `config/roles.json` (que a su vez es `lector` salvo que se reconfigure explícitamente). |

Reglas:
- Si `rolOrigen` es `null`, vacío, o no aparece como clave en `mapeo`, `rol`
  resuelve a `rolPorDefecto` (FR-004; ver Edge Cases del spec sobre mapeo
  ambiguo o mal formado).

## Mapeo de Roles (`config/roles.json`)

Configuración fija, versionada como archivo (mismo patrón que
`config/categorias.json` / `config/motivos-ausencia.json`), no editable
desde la interfaz en esta feature (FR-003):

| Campo | Tipo | Validación al cargar |
|---|---|---|
| `rolPorDefecto` | string | Debe ser uno de `lector` / `editor` / `configurador`. |
| `mapeo` | objeto `{ string: string }` | Cada clave es un rol/grupo de origen (texto libre, lo que en el futuro provea APEX); cada valor debe ser uno de `lector` / `editor` / `configurador`. Claves duplicadas son imposibles por construcción (son claves de un objeto JSON); un valor inválido hace fallar la carga completa (fail-fast, mismo criterio que el resto de `config/*.json`). |

Si el archivo falta o `mapeo` es `{}`, el sistema sigue funcionando: todo
usuario resuelve a `rolPorDefecto` (por defecto `lector`).

## Relación con las entidades existentes

Esta feature no agrega columnas ni campos a ninguna entidad de negocio ya
existente (Fichada, Vacaciones, Justificación, Calendario, Configuración).
El campo `autor` de texto libre que ya existe en algunas operaciones (por
ejemplo, `asignarVacaciones`) permanece sin cambios — no se vincula
automáticamente a la identidad resuelta (ver Assumptions del spec).
