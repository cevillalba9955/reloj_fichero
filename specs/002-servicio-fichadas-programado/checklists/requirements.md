# Specification Quality Checklist: Servicio de Consulta Programada de Fichadas

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Los 3 marcadores [NEEDS CLARIFICATION] originales (FR-006/007/008: origen
  del padrón de empleados activos, criterio de completitud, comportamiento
  al cierre) se resolvieron en la sesión de clarificación 2026-07-06 y
  quedaron incorporados en la spec (ver sección Clarifications y FR-002,
  FR-004 a FR-008).
- La resolución introdujo un concepto nuevo no explícito en el pedido
  original: "momentos esperados" (entrada/salida) con margen configurable,
  en vez de un único corte genérico a las 16:00. Esto reemplaza la lectura
  literal de "ventana 7:00–16:00" por dos ventanas de aceptación (una por
  cada momento esperado), documentado explícitamente en Assumptions para
  que quede trazable de dónde salió. **Superado por la sesión 2026-07-14**
  (ver última nota): el modelo pasó a un único momento "entrada" con
  ventana de un solo lado.
- **Sesión de clarificación 2026-07-14**: el modelo de dos momentos con
  margen simétrico ±30 se reemplazó por un **único checkpoint "entrada"**
  con **ventana de un solo lado** `[hora de entrada, hora de entrada + 30
  min]` (07:00 → 07:30 por defecto); el momento "salida" quedó fuera de
  alcance. Propagado a spec.md (FR-002/003/004/006/007), plan.md,
  research.md (§2/§6), data-model.md (§2/§3), contracts/ y quickstart.md.
  El código en `src/` y sus tests quedaron marcados para rework en
  `tasks.md` (Phase 7, T031–T035) — todavía implementan el modelo anterior.
- La dependencia de un padrón externo de empleados activos (RRHH/Oracle,
  todavía no integrado en este proyecto) es un riesgo de alcance a tener en
  cuenta en `/speckit-plan`: el mecanismo concreto de esa integración no se
  define acá a propósito (no es implementación), pero condiciona qué tan
  autónoma puede ser esta feature sin ese sistema disponible.
- Sesión de clarificación 2026-07-07: se agregó FR-017 (deduplicación de
  fichadas repetidas entre ciclos de sondeo, comparando `rawHex`), dado que
  el reloj no borra fichadas y las vuelve a reportar como pendientes en
  cada ciclo. Esta regla no estaba cubierta por ningún FR previo (FR-008
  cubre fichadas *nuevas* fuera de ventana, no repeticiones exactas). Nota
  para `/speckit-plan`/`/speckit-tasks`: `data-model.md` y `tasks.md` de
  esta feature todavía documentan la suposición anterior ("no hay
  deduplicación, queda fuera de alcance") y deberían actualizarse para
  reflejar FR-017 antes de implementar.
