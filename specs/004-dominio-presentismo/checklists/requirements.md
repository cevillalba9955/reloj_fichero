# Specification Quality Checklist: Dominio de Presentismo — Cálculo de Horas Trabajadas por Período

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-10
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

- Iteración 1 (2026-07-10): 3 marcadores `[NEEDS CLARIFICATION]` abiertos (FR-015,
  FR-018, FR-020), planteados al usuario como Q1/Q2/Q3. El resto de los ítems pasaba.
- Iteración 2 (2026-07-10): los tres quedan resueltos y registrados en la sección
  `Clarifications` del spec:
  - **FR-020** — `Feriado` aporta jornada esperada, cumplida automáticamente.
  - **FR-015** — punta faltante ⇒ `0:00` e `Incompleta`, con sugerencia a confirmar.
  - **FR-018** — fichadas en `No Laborable` / `Feriado` no suman; se reportan aparte.
- Además, el usuario agregó un requisito transversal: edición manual por usuario
  responsable en todos los casos. Se incorporó como User Story 3 (P2) y FR-026 a
  FR-030, con auditoría obligatoria (autor, fecha, valor anterior, valor nuevo,
  motivo) y protección frente a recálculos (FR-029).
- Todos los ítems de la checklist pasan. El spec queda listo para `/speckit-plan`.
- **Enmienda 2026-07-27** (retroactiva, post-implementación): se agregó FR-047 (pago
  en múltiplos de 30 minutos, truncando hacia abajo) tras detectarse en producción un
  caso real (legajo 59, entrada tardía `07:28`) sin esta regla documentada en ningún
  spec. Se actualizaron los Acceptance Scenarios 3 y 5 de la User Story 2 (sus
  resultados ya no son al minuto exacto), se agregó el Acceptance Scenario 13, dos
  edge cases y SC-016. Implementado y testeado antes de esta enmienda
  (`src/presentismo/domain/tiempo.js`/`jornada.js`); la enmienda documenta la regla
  ya vigente, no dispara trabajo nuevo.
