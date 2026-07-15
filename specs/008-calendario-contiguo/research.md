# Research — Generación de Calendario Contigua (feature 008)

Decisiones de diseño que resuelven el "cómo" antes de la Fase 1. No quedan `NEEDS
CLARIFICATION` de la Technical Context.

## D1 — Dónde vive la regla de contigüidad

- **Decisión**: La invariante de contigüidad es **lógica de negocio en el backend**. El servicio
  y la API son la fuente de verdad: el endpoint de generación **rechaza** un período no
  generable. La UI **no** decide la regla; solo renderiza los flags que el backend expone.
- **Rationale**: Principio I (separación UI–negocio). El trabajo previo (commit `6311bcc`) puso
  la regla en `NavegacionMes.jsx` (cálculo de `siguienteLocked` con la fecha del cliente). Eso
  (a) deja un hueco —un `POST /generar` directo o una carrera podría crear un salto—, (b) confía
  en el reloj del cliente, y (c) resultó difícil de verificar. Mover la regla al backend cierra
  el hueco y da un único lugar testeable.
- **Alternativas**:
  - *Solo UI* (estado actual): rechazada — invariante violable por API directa; reloj del
    cliente no confiable; sin test de negocio.
  - *Solo backend, UI sin flags*: rechazada — mala UX: el usuario solo se entera del error tras
    hacer clic; la navegación seguiría llevándolo a meses sin salida (viola US3/FR-007).
  - *Ambas capas con la regla duplicada*: rechazada — dos fuentes de verdad que divergen. Se
    elige backend-autoritativo + UI que **consume** flags (sin recomputar la regla).

## D2 — Cómo se calcula la "frontera generable"

- **Decisión**: A partir de la lista de períodos generados (ya disponible), la frontera es:
  - Si la lista está vacía → `{ mesActual }` (período semilla, FR-005).
  - Si no → `{ min-1, max+1 }`, con `max+1` incluido **solo si** `max+1 ≤ mesActual` (FR-004).
    `min-1` siempre es generable (no hay tope inferior, backfill permitido).
  - `mesActual` = mes `YYYYMM` derivado del reloj del **servidor** (reutiliza `hoyLocal`).
- **Rationale**: Reutiliza el `GET /api/calendarios` existente (que ya devuelve `periodos`); el
  cálculo es O(1) sobre min/max. Exponer la frontera evita que la UI recompute aritmética de
  períodos con reglas de negocio.
- **Contigüidad de la data preexistente**: la frontera se calcula sobre `min`/`max` globales.
  Se asume que los períodos ya generados forman una secuencia sin huecos (Assumption de la
  spec). Si hubiera un hueco heredado, la regla igual solo permite extender extremos; rellenar
  un hueco interno queda fuera de alcance y no es alcanzable por la UI (aceptado).

## D3 — Aritmética de períodos (helper puro en el dominio)

- **Decisión**: Agregar al dominio (`src/presentismo/domain/calendario-mes.js`) helpers puros
  `periodoAnterior(periodo)` y `periodoSiguiente(periodo)` (o un único `desplazarPeriodo(periodo,
  delta)`), que validan con `parsePeriodo` y manejan el cruce de año. El view-model los usa para
  la frontera; el servicio los usa para la guarda.
- **Rationale**: El dominio ya centraliza el parseo de `YYYYMM` (`parsePeriodo`). Mantener la
  aritmética de períodos junto a él evita reimplementarla en el web layer y la hace testeable
  como función pura (Principio IV, capa de dominio).
- **Alternativas**: Calcular con `Date.UTC` inline en el handler (como hace hoy
  `NavegacionMes.periodoAdyacente` en el frontend) — rechazada: dispersa la lógica de períodos y
  no es reutilizable ni testeable de forma aislada. El frontend conserva su `periodoAdyacente`
  **solo** para el destino de navegación (mero cálculo de a dónde ir), no para decidir la regla.

## D4 — Semántica del endpoint de generación

- **Decisión**: Endurecer el `POST /api/calendarios/:periodo/generar` existente:
  1. Valida formato `YYYYMM` (400 `PERIODO_INVALIDO`).
  2. **Idempotencia** (FR-010): si el período ya está generado → 200 con la `VistaCalendarioMes`
     actual, **sin** regenerar (evita recálculos sorpresa; 008 agrega meses, no regenera).
  3. **Guarda de contigüidad** (FR-002/FR-003): si no es adyacente a la secuencia → 409
     `PERIODO_NO_CONTIGUO`, con mensaje que identifica el período que debe generarse primero.
  4. **Guarda de futuro** (FR-004): si es posterior a `mesActual` → 409 `PERIODO_FUTURO`.
  5. Éxito: `service.generarCalendario(periodo)` (feature 004) y devuelve la
     `VistaCalendarioMes` recién generada (misma forma que `GET`/`reclasificar`, para refrescar
     la UI sin segundo request).
- **Rationale**: Reusa el patrón de respuesta de `reclasificar` (devolver la vista). Códigos de
  error específicos permiten tests de contrato precisos y mensajes claros en la UI. 409 (Conflict)
  expresa "el estado actual no permite esta generación".
- **Alternativas**:
  - Un único código `PERIODO_NO_GENERABLE`: rechazada — pierde la distinción contiguo/futuro que
    la UI necesita para el mensaje (US2 scenario 2 vs US3 scenario 2).
  - Regenerar si ya existe: rechazada para 008 — introduce efectos de recálculo no pedidos;
    idempotencia "mostrar y no duplicar" es lo que pide FR-010.

## D5 — Qué expone el backend a la UI (forma de los flags)

- **Decisión**: Extender la respuesta de `GET /api/calendarios` con:
  - `mesActual`: `"YYYYMM"` del servidor.
  - `generables`: array de 0..2 períodos `YYYYMM` habilitados para generar ahora.
  Se mantienen `periodos` y `ultimo`. La UI decide **solo por pertenencia** a estos arrays.
- **Rationale**: Un único fetch ya usado en el arranque entrega todo lo necesario. La UI no
  recalcula la regla: "¿muestro botón Generar para P?" = `generables.includes(P)`; "¿deshabilito
  siguiente desde P?" = `periodoSiguiente(P)` no está en `periodos` ni en `generables`.
- **Alternativas**: Un endpoint nuevo `GET /:periodo/generable` — rechazada: round-trips extra y
  estado disperso; el listado global basta.

## D6 — Reglas de deshabilitado de navegación (US3/FR-007)

- **Decisión**: Para el período mostrado `P`:
  - `siguiente` deshabilitado ⟺ `periodoSiguiente(P)` **no** está en `periodos` **ni** en
    `generables`.
  - `anterior` deshabilitado ⟺ `periodoAnterior(P)` **no** está en `periodos` **ni** en
    `generables`.
  Así el usuario puede pisar el mes-frontera (generable, vacío) pero no ir más allá.
- **Rationale**: Deriva 100% de los flags del backend (D5); elimina el `periodoHoy()` del cliente
  y la comparación de strings de fecha del trabajo previo, que era la parte no verificable.
- **Alternativas**: Mantener el cálculo local con la fecha del cliente — rechazada (D1).

## D7 — Estrategia de testing

- **Decisión**:
  - *Backend primero* (Principio IV): tests de contrato para `GET` (incluye `generables`,
    `mesActual`) y `POST /generar` (idempotente; 409 no-contiguo; 409 futuro; 200 al generar el
    frontera; 400 formato); test de integración del flujo de contigüidad (generar máx+1, luego el
    siguiente; intentar saltear → rechazo; backfill mín-1). Unit del helper de períodos (cruce de
    año, validación).
  - *Frontend*: tests de componente de `NavegacionMes` (deshabilitado según flags) y
    `EstadoVacio` (botón visible solo si generable; mensaje de no-contiguo).
- **Rationale**: La invariante (FR-008) y las guardas son correctness-critical; su cobertura vive
  en el backend, donde es autoritativa. El frontend se valida a nivel de render de flags.

## Puntos abiertos

Ninguno bloqueante. La spec no dejó `NEEDS CLARIFICATION`; las suposiciones (mes semilla = mes
actual; backfill sin tope inferior; tope superior = mes actual) están documentadas en la spec y
se implementan según D2/D4.
