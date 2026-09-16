# Research: Ocultar Fichadas de Vacaciones en Informes Generados

**Feature**: 023-ocultar-fichadas-vacaciones | **Date**: 2026-09-16

No quedaron marcadores `NEEDS CLARIFICATION` en el spec (los supuestos quedaron
documentados en la sección Assumptions durante `/speckit-specify`). Esta
investigación fija dónde y cómo intervenir el código existente (features 010,
011, 015, 018, 021, 022) para cumplir FR-001 a FR-007 sin tocar lo que ya
funciona.

## §1 — Vacaciones no es una `Clasificacion` propia: es una Justificación-espejo

**Decisión**: identificar un "día de vacaciones" en el pipeline de informes
por `dia.justificacion?.motivoId === MotivoVacaciones.id` (constante
`'vacaciones-anual'`, `src/presentismo/domain/vacaciones.js`), exactamente el
mismo criterio que ya usa `resumen-periodo.js` (`esVacaciones`).

**Evidencia** (código actual):

- `Clasificacion` (`src/presentismo/domain/calendario-mes.js`) sólo tiene
  `Laborable | No Laborable | Feriado`. No existe `Clasificacion.VACACIONES`.
- Una Asignación de Vacaciones vigente (feature 015) se aplica como una
  "Justificación-espejo" `No paga` con `motivoId: MotivoVacaciones.id` sobre el
  día, resuelta en `aplicarAjustes` (`src/presentismo/domain/jornada.js`).
- `src/presentismo/domain/resumen-periodo.js:113` ya distingue así:
  `const esVacaciones = d.justificacion?.motivoId === MotivoVacaciones.id;`

**Rationale**: reutilizar el criterio ya vigente evita introducir un segundo
concepto de "día de vacaciones" que pueda divergir del que ya usan los
contadores del resumen (`vacaciones`, feature 015 FR-006/FR-017).

**Alternativas descartadas**:
- Inspeccionar `estado === 'Sin fichadas'`: ambiguo — también es el estado de
  una ausencia laborable común o de una licencia sin fichadas; no identifica
  vacaciones específicamente.

## §2 — El punto de intervención es `informe-cierre.js`, no `resumen-periodo.js`

**Decisión**: aplicar el ocultamiento dentro de `renglonDe()` en
`src/presentismo/domain/informe-cierre.js`, la función que arma cada renglón
del `InformeDetalle`. NO tocar `detalleDeJornada()` en
`src/presentismo/domain/resumen-periodo.js`.

**Evidencia** (código actual):

- `detalleDeJornada()` (`resumen-periodo.js`) es la ÚNICA fuente de los campos
  `entrada`, `salida`, `pausas`, `requiereJustificacionRevision` de un día. Su
  salida (`fila.detalle`) alimenta dos consumidores distintos:
  1. La pantalla "Resumen del Período" (feature 011), vía
     `resumen-periodo-handlers.js` / `construirVistaResumenPeriodo` — el mismo
     dato que además reutiliza "Fichadas de Hoy" (feature 010) para el día de
     hoy.
  2. `emitirInformeCierre()` (`calcular-presentismo-service.js:156`), que pasa
     esas mismas `filas` (con su `detalle`) a `construirInformeCierre()`
     (`informe-cierre.js`) — el ÚNICO punto de armado de los tres informes
     generados (018 cierre, 021 mensual, 022 anticipado Q1: los tres llaman a
     la misma `emitirInformeCierre`/`construirInformeCierre`, confirmado en
     `specs/022-informe-primera-quincena-anticipado/plan.md` §Summary).
- `construirInformeCierre()` → `seccionDetalleDe()` → `renglonDe(d)` es donde
  el `detalle` de `resumen-periodo.js` se transforma en el renglón del
  documento (`InformeDetalle.secciones[].dias[]`). Es el único lugar del
  pipeline donde "pantalla interactiva" y "documento de informe" se
  bifurcan.

**Rationale**: modificar `resumen-periodo.js` ocultaría las fichadas también
en "Fichadas de Hoy" y "Resumen del Período", violando FR-004 (Historia 2 del
spec: esas pantallas deben seguir mostrando la fichada y la señal de revisión
sin cambios). `renglonDe()` es exclusivo de los documentos de informe
generados, así que es el único lugar que puede cambiar sin afectar la
pantalla.

**Alternativas descartadas**:
- Flag `paraInforme` en `detalleDeJornada()`/`proyectarResumenPeriodo()`:
  agrega una rama condicional a una función pura ya compartida por la pantalla
  interactiva y por el cálculo de contadores (016/019), aumentando superficie
  de riesgo para un cambio que es puramente de presentación del documento.
- Filtrar en el frontend (`InformeCierreContenido.jsx`): el dato ya viajaría
  de más hacia el cliente; y como el mismo componente sirve tanto la vista en
  pantalla del informe como el PDF (`InformeCierrePrintable.jsx`), un filtro
  ahí sería redundante con la lógica de dominio y más frágil ante un futuro
  tercer consumidor del mismo payload ya construido.

## §3 — Qué campos ocultar y bajo qué condición

**Decisión**: en `renglonDe(d)`, cuando
`d.justificacion?.motivoId === MotivoVacaciones.id`, forzar
`entrada: null, salida: null, pausas: [], requiereJustificacionRevision: false`
en el renglón resultante, sin condicionar además a
`d.requiereJustificacionRevision`. El campo `justificacion` (que alimenta el
badge "Vacaciones (No paga)" en `marcasDia()` del frontend) NO se toca: sigue
siendo la clasificación visible del día, igual que hoy en un día de vacaciones
sin fichadas.

**Evidencia** (código actual):

- Un día de vacaciones SIN ninguna fichada ya llega con esos cuatro campos en
  su valor "vacío" por construcción (`aplicarAjustes`, rama
  `justificacion` sin `llegaronFichadas`, `jornada.js:282-293`): no hay nada
  que ocultar, ya se ven igual que se pide en FR-002/SC-002.
- Un día de vacaciones CON fichadas (rama `llegaronFichadas`,
  `jornada.js:259-280`) preserva `entrada`/`salida` reales de `auto` (el
  spread `...auto` no los sobrescribe) y fija
  `requiereJustificacionRevision: true`; ESE es el caso que hoy se filtra hacia
  el informe y que esta feature debe ocultar.
- No condicionar por `requiereJustificacionRevision` además de por
  `motivoId` cubre también el edge case "entrada sin salida" (FR-002 escenario
  2 del spec) y es robusto a cualquier variante futura de `aplicarAjustes` que
  deje una fichada suelta sin marcar el flag.

**Rationale**: FR-002/SC-002 piden paridad total entre un día de vacaciones
con y sin fichadas ocultas; condicionar únicamente por `motivoId` garantiza esa
paridad con la mínima superficie de código.

**Alternativas descartadas**:
- Ocultar sólo si `requiereJustificacionRevision === true`: funcionalmente
  equivalente en el caso normal (si no hay fichadas esos campos ya están
  vacíos), pero acopla el ocultamiento a un flag que existe para otro
  propósito (señalar revisión en pantalla) en vez de al criterio de dominio
  directo ("es un día de vacaciones").

## §4 — Alcance automático a los tres informes (018/021/022)

**Decisión**: un único cambio en `informe-cierre.js` cubre el informe de
cierre de período (018), el informe mensual (021) y el informe anticipado de
Q1 (022), sin tocar sus handlers ni sus componentes de frontend específicos.

**Evidencia**: los tres comparten una única función de servicio
(`emitirInformeCierre`, `calcular-presentismo-service.js:156`) y una única
función de dominio (`construirInformeCierre`); no existen tres
implementaciones paralelas del informe de detalle. El endpoint también es
único: `POST`/`GET /api/calendarios/:periodo/informe-cierre` (con `?tramo=`
para distinguir `Mes`/`Q1`/`Q2`) — no hay una ruta separada "informe-mensual".

**Rationale**: confirma FR-001 (los tres informes) sin trabajo adicional por
feature ni riesgo de que uno de los tres quede desalineado.

## §5 — Frontend: sin cambios

**Decisión**: no modificar `InformeCierreContenido.jsx` ni
`InformeCierrePrintable.jsx`.

**Evidencia**: `InformeCierreContenido.jsx` ya renderiza los campos de forma
genérica —`d.entrada ?? '—'`, `d.salida ?? '—'`,
`d.pausas?.length ? … : '—'`, y `marcasDia(d)` (que sólo agrega el badge
"⚠ revisar" cuando `d.requiereJustificacionRevision` es `true`)— sin lógica
propia sobre Vacaciones. Con los campos ya vacíos desde el dominio (§3), el
componente los presenta igual que cualquier otro día sin fichadas, sin
requerir ningún cambio de UI. `InformeCierrePrintable.jsx` reutiliza el mismo
componente para pantalla y PDF, así que la paridad es automática entre "ver" y
"descargar".

**Rationale**: mantiene el Principio I (componentes de presentación puros, sin
lógica de negocio) intacto — la decisión de qué mostrar sigue viviendo
enteramente en el dominio.
