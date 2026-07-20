# Contract: Configuración del Catálogo de Motivos de Ausencia

**Feature**: 012-justificacion-ausencias | **Date**: 2026-07-20

Archivo `config/motivos-ausencia.json` (real, no commiteado si difiere del ejemplo) con
ejemplo versionado `config/motivos-ausencia.example.json`. Cargado y **validado
fail-fast al arranque**, mismo criterio que `categorias-config.js` (research.md §6).

## Estructura

```json
{
  "motivos": [
    { "id": "sin_aviso", "etiqueta": "Sin Aviso", "tipoPago": "No paga", "activo": true },
    { "id": "aviso_justificado", "etiqueta": "Aviso Justificado", "tipoPago": "No paga", "activo": true },
    { "id": "enfermedad", "etiqueta": "Enfermedad", "tipoPago": "Paga", "activo": true },
    { "id": "art", "etiqueta": "ART", "tipoPago": "Paga", "activo": true },
    { "id": "nacimiento", "etiqueta": "Nacimiento", "tipoPago": "Paga", "activo": true },
    { "id": "fallecimiento", "etiqueta": "Fallecimiento", "tipoPago": "Paga", "activo": true },
    { "id": "vacaciones", "etiqueta": "Vacaciones", "tipoPago": "Paga", "activo": true },
    { "id": "matrimonio", "etiqueta": "Matrimonio", "tipoPago": "Paga", "activo": true },
    { "id": "examen", "etiqueta": "Examen", "tipoPago": "Paga", "activo": true }
  ]
}
```

## Reglas de validación (fail-fast)

- `motivos` DEBE ser un array no vacío.
- Cada `motivos[i].id`: string no vacío, único dentro del catálogo (case-sensitive).
- Cada `motivos[i].etiqueta`: string no vacío (texto mostrado en la lista de selección).
- Cada `motivos[i].tipoPago` ∈ {`Paga`, `No paga`}; cualquier otro valor es error de
  arranque.
- `motivos[i].activo`: boolean, default `true` si se omite.
- DEBE existir al menos un motivo con `activo: true` (un catálogo sin ningún motivo
  ofrecible es una configuración inválida — edge case del spec "catálogo vacío o
  inválido").
- Extender el catálogo (agregar un motivo, renombrar `etiqueta`, cambiar `tipoPago` o
  `activo` de uno existente) NO requiere cambios de código (FR-006); alcanza con editar
  el archivo y reiniciar/recargar la configuración.

## Uso

- La lista ofrecida al registrar una Justificación es `motivos.filter(m => m.activo)`.
- Al crear una Justificación, se copian `etiqueta` → `etiquetaMotivo` y `tipoPago` al
  registro (no se referencia el catálogo en runtime después de la carga — ver
  data-model.md, evita que cambios futuros del catálogo alteren justificaciones ya
  registradas).
- Un `motivoId` que no exista en el catálogo activo al momento de la carga se rechaza
  (`JUSTIFICACION_INVALIDA` / motivo desconocido).

## Errores

- Config ausente o JSON inválido → error fatal de arranque con mensaje claro (mismo
  patrón que `categorias-config`/`oracle-roster-config`).
- `id` duplicado, `tipoPago` inválido, o ningún motivo activo → error fatal, nombra el
  problema concreto.
- Ningún dato sensible en este archivo ni en sus logs de carga.
