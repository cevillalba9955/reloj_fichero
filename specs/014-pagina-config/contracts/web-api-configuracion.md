# Contract: API web de Configuración

**Feature**: 014-pagina-config | **Date**: 2026-07-22

Rutas nuevas bajo `/api/configuracion/*`, registradas en
`src/web/api/configuracion-handlers.js` (mismo router sin framework de
`src/web/api/router.js`, forma de error uniforme
`{ error: { codigo, mensaje } }`, igual criterio que
`justificaciones-handlers.js`/`resumen-periodo-handlers.js`).

## Reloj y servicio (Historias 1 y 4 — `.env`)

### `GET /api/configuracion/reloj`

**200**
```json
{
  "host": "10.0.0.5",
  "port": 5005,
  "timeoutMs": 5000,
  "tickIntervalMs": 300000,
  "statusIntervalMs": 60000,
  "entradaHora": "07:00",
  "entradaDuracion": 30,
  "fullHandshake": false,
  "controlPort": 5006,
  "resumenPeriodo": "MENSUAL"
}
```
`controlPort` es `null` si `FICHADAS_CONTROL_PORT` no está definido.

### `PUT /api/configuracion/reloj`

Body: subconjunto parcial de los campos de arriba (solo lo que cambia).
Valida cada campo presente contra `contracts/env-config.schema.md`.

- **200**: mismo cuerpo que el `GET`, ya actualizado.
- **400** `CONFIGURACION_INVALIDA`: el mensaje nombra el campo inválido; no se
  persiste ningún campo del body (FR-004, rechazo atómico).

### `POST /api/configuracion/reloj/probar-conexion`

Body: `{ "host": "10.0.0.5", "port": 5005 }` (valores candidatos, no
necesariamente guardados). Reenvía al control-API del proceso
`rs956-fichadas` (`contracts/control-api.md` de esta feature).

- **200** `{ "ok": true }` o `{ "ok": false, "motivo": "..." }`.
- **400** `CONFIGURACION_INVALIDA`: host/port del body faltantes o mal
  tipados.
- **502** `SERVICIO_FICHADAS_NO_DISPONIBLE`: el control-API no respondió
  (servicio caído o `FICHADAS_CONTROL_PORT` no configurado).

## Motivos de ausencia (Historia 2 — `config/motivos-ausencia.json`)

Distinta de la ya existente `GET /api/motivos-ausencia` (spec 012, solo trae
activos para el selector de Justificación) — esta trae **todos**, para poder
administrarlos.

### `GET /api/configuracion/motivos-ausencia`

**200**
```json
{ "motivos": [
  { "id": "sin_aviso", "etiqueta": "Sin Aviso", "tipoPago": "No paga", "activo": true }
] }
```

### `POST /api/configuracion/motivos-ausencia`

Body: `{ "id": "...", "etiqueta": "...", "tipoPago": "Paga" | "No paga", "activo"?: boolean }`
(`activo` default `true`).

- **201**: el motivo creado.
- **400** `CONFIGURACION_INVALIDA`: campos faltantes/mal tipados.
- **400** `MOTIVO_DUPLICADO`: ya existe un motivo con ese `id` (FR-010).

### `PUT /api/configuracion/motivos-ausencia/:id`

Body: `{ "etiqueta"?: "...", "tipoPago"?: "Paga" | "No paga", "activo"?: boolean }`.
El `id` de la URL nunca se modifica (inmutable, ver Clarifications del spec).

- **200**: el motivo actualizado.
- **400** `CONFIGURACION_INVALIDA`: valores inválidos.
- **404** `MOTIVO_NO_ENCONTRADO`.

No hay `DELETE`: dar de baja un motivo es `PUT .../:id` con `{ "activo": false }`
(FR-009).

## Categorías, modalidades y esquema semanal (Historia 3 — `config/categorias.json`)

### `GET /api/configuracion/categorias`

**200**
```json
{
  "esquemaSemanal": ["lunes", "martes", "miercoles", "jueves", "viernes"],
  "modalidades": {
    "mensual": { "tipo": "Mensual", "aperturaOficial": "07:00", "cierreOficial": "16:00",
                 "margenAperturaMin": 30, "margenCierreMin": 30,
                 "ventanaApertura": ["05:00", "12:00"], "ventanaCierre": ["12:00", "23:59"] }
  },
  "categorias": { "ADMIN": { "modalidad": "mensual" } }
}
```

### `PUT /api/configuracion/categorias/esquema-semanal`

Body: `{ "dias": ["lunes", "martes", ...] }`.

- **200**: `{ "esquemaSemanal": [...] }` actualizado.
- **400** `CONFIGURACION_INVALIDA`: lista vacía, día repetido o nombre de día
  desconocido.

### `POST /api/configuracion/categorias/modalidades`

Body: `{ "nombre": "...", "tipo": "Mensual" | "Quincenal", "aperturaOficial": "HH:MM",
"cierreOficial": "HH:MM", "margenAperturaMin": n, "margenCierreMin": n,
"ventanaApertura": ["HH:MM","HH:MM"], "ventanaCierre": ["HH:MM","HH:MM"] }`.

- **201**: la modalidad creada.
- **400** `CONFIGURACION_INVALIDA`: horarios inválidos (mismas reglas que
  `parseModalidad`) o `nombre` ya existente.

### `PUT /api/configuracion/categorias/modalidades/:nombre`

Body: igual forma que el alta (sin `nombre`, que es fijo). Actualiza los
horarios de una modalidad existente.

- **200**: la modalidad actualizada.
- **400** `CONFIGURACION_INVALIDA`.
- **404** `MODALIDAD_NO_ENCONTRADA`.

### `DELETE /api/configuracion/categorias/modalidades/:nombre`

- **200** `{ "eliminada": true }`: ninguna categoría la usaba.
- **409** `MODALIDAD_EN_USO`: `{ "error": { "codigo": "MODALIDAD_EN_USO", "mensaje": "..." }, "categorias": ["ADMIN", "PROD"] }`
  — lista las categorías que la referencian (FR-012).
- **404** `MODALIDAD_NO_ENCONTRADA`.

### `POST /api/configuracion/categorias/categorias`

Body: `{ "codigo": "...", "modalidad": "..." }`.

- **201**: la categoría creada.
- **400** `CONFIGURACION_INVALIDA`: `codigo` vacío o `modalidad` faltante.
- **400** `CATEGORIA_DUPLICADA`: ya existe ese `codigo`.
- **400** `MODALIDAD_INEXISTENTE`: la `modalidad` referenciada no existe.

### `PUT /api/configuracion/categorias/categorias/:codigo`

Body: `{ "modalidad": "..." }` (único campo editable; el `codigo` de la URL es
fijo, FR-012b).

- **200**: la categoría actualizada.
- **400** `MODALIDAD_INEXISTENTE`.
- **404** `CATEGORIA_NO_ENCONTRADA`.

No hay `DELETE` de categorías (FR-012a, fuera de alcance de esta feature).

## Códigos de error usados en este documento

| Código | HTTP | Cuándo |
|---|---|---|
| `CONFIGURACION_INVALIDA` | 400 | validación de forma/tipo/rango fallida |
| `MOTIVO_DUPLICADO` | 400 | alta de motivo con `id` ya existente |
| `MOTIVO_NO_ENCONTRADO` | 404 | edición de motivo inexistente |
| `CATEGORIA_DUPLICADA` | 400 | alta de categoría con `codigo` ya existente |
| `CATEGORIA_NO_ENCONTRADA` | 404 | edición de categoría inexistente |
| `MODALIDAD_INEXISTENTE` | 400 | referencia a una modalidad que no existe |
| `MODALIDAD_NO_ENCONTRADA` | 404 | edición/baja de modalidad inexistente |
| `MODALIDAD_EN_USO` | 409 | baja de modalidad referenciada por ≥1 categoría |
| `SERVICIO_FICHADAS_NO_DISPONIBLE` | 502 | `probar-conexion` no pudo alcanzar el control-API |
| `ERROR_INTERNO` | 500 | fallo de escritura en disco u otro error no anticipado |
