# Research: Justificación de Ausencias

Fase 0 del plan. No quedan `NEEDS CLARIFICATION` en el Technical Context del plan —
esta feature reutiliza el stack, la persistencia y los patrones de puerto/adaptador ya
validados en 004/010/011. Este documento registra las decisiones de diseño específicas
de esta feature.

## 1. Dónde y cómo se persiste la Justificación

**Decisión**: se agrega una cuarta colección `justificaciones` al mismo archivo JSON
por período que ya usa `file-presentismo-repository.js` (`{ calendario, correcciones,
pausas, justificaciones }`), detrás del puerto `PresentismoRepository` existente. Un
elemento por día `Laborable` justificado (no un elemento por rango).

**Rationale**: es el mismo enfoque que ya usan `correcciones` y `pausas` en el mismo
archivo (Principio VI); no introduce un nuevo mecanismo de persistencia ni una nueva
dependencia. Guardar un registro por día (en vez de un registro con rango) mantiene el
modelo simple: cada día es la unidad que participa en el cálculo de `resumen-presentismo.js`,
igual que el Calendario del mes y las correcciones ya son por día.

**Alternatives considered**:
- Persistir el rango como una única entidad y resolverlo "al vuelo" en cada cálculo:
  descartado — obliga a repetir en cada consultador (resumen, corrección, vista de hoy)
  la lógica de expansión y de qué pasa si el rango se solapa parcialmente con una
  reclasificación posterior del calendario; un registro por día es más simple de
  razonar y de auditar (igual que ya se decidió para el Calendario del mes en 004).
- Un archivo separado por tipo (`justificaciones/<periodo>.json` aparte del archivo de
  004): descartado — fragmenta el estado de un mismo período en más archivos sin
  necesidad; el archivo único por período ya es la convención del repositorio.

## 2. Elegibilidad del día: pasado "Sin fichadas" vs. futuro

**Decisión**: `justificacion.js` expone un predicado puro `esDiaElegible({ clasificacion,
estadoJornada, esFuturo })` que devuelve elegible cuando `clasificacion === 'Laborable'`
y (`estadoJornada === 'Sin fichadas'` **o** `esFuturo === true`). Un día futuro se
considera "todavía sin fichadas posibles" por definición (no transcurrió), así que no
requiere que `calcularJornadaAuto` ya lo haya evaluado.

**Rationale**: reutiliza el `EstadoJornada` ya calculado por 004 para días pasados sin
inventar un estado nuevo, y trata el caso futuro como una precondición aparte y más
simple (el día ya existe en el Calendario del mes de 004 con su clasificación, solo que
aún no tiene jornada calculada). `esFuturo` se deriva comparando la fecha del día con
"hoy" (mismo cálculo de fecha local que ya usa `situacion-dia.js`/`fichadas-hoy`).

**Alternatives considered**: agregar un estado `Planificada` a `EstadoJornada` para
días futuros justificados — descartado para esta feature: `EstadoJornada` es
explícitamente el estado *retrospectivo de cierre* (comentario en `situacion-dia.js`);
mezclar un estado prospectivo ahí infla su alcance. La Justificación es su propia
entidad con su propio campo `vigente`, no necesita reflejarse como un `EstadoJornada`
nuevo para cumplir el spec.

## 3. Expansión de un rango de fechas a días individuales

**Decisión**: la carga por rango (`[desde, hasta]`) es una operación de dominio pura
(`expandirRangoElegible`) que, dado el Calendario del mes/los meses involucrados y el
estado de jornada de cada día, devuelve dos listas: `elegibles` (días que van a
justificarse) y `noAplicables` (con el motivo puntual: ya tiene fichadas, ya
justificado, o no es `Laborable`). El servicio (`cargarJustificacion`) crea un registro
por cada día de `elegibles` y devuelve ambas listas para que la UI informe el resultado
completo (Acceptance Scenario 7 del spec).

**Rationale**: cumple FR-003a (procesar el resto del rango sin bloquear por un día no
aplicable) sin necesitar transacciones multi-día: cada día se escribe como una
operación independiente sobre el archivo del período que le corresponde (un rango puede
cruzar dos períodos si la modalidad es quincenal; se resuelve período por período con
`periodoDe(fecha)`, ya existente en 004/010).

**Alternatives considered**: todo-o-nada (rechazar el rango completo si un solo día no
es elegible) — descartado explícitamente por el Acceptance Scenario 7 del spec, que
exige que el resto del rango se procese igual.

## 4. Efecto sobre el cálculo de horas del período (FR-013/FR-014)

**Decisión**: en `resumen-presentismo.js`, un día con Justificación vigente `Paga` se
trata en la agregación exactamente como un día `Feriado` ya se trata hoy: acredita su
jornada esperada como cumplida, sin fichadas ni corrección que lo respalden. Un día con
Justificación `No paga` no se toca en la agregación: sigue las reglas actuales de un
`Laborable` `Sin fichadas` (0 horas, contribuye a saldo negativo), y el resumen expone
el motivo/clasificación como dato adicional de ese día (no cambia el número).

**Rationale**: reutiliza el camino que ya existe para `Feriado` en vez de crear una
tercera vía de cómputo, minimizando el riesgo sobre una capa crítica (Principio IV,
liquidación). Es la interpretación elegida en la clarificación del spec (2026-07-20).

**Alternatives considered**: crédito parcial o distinto por tipo de motivo (por ejemplo,
Vacaciones cuenta distinto que Nacimiento) — fuera de alcance: el spec solo distingue
`Paga`/`No paga`, no un tercer nivel; si en el futuro se necesita, es una extensión del
catálogo (agregar un campo), no un cambio de este mecanismo.

## 5. Interacción con Corrección Manual y con `SituacionDia` (010)

**Decisión**: Justificación y Corrección Manual son mutuamente excluyentes por
construcción (FR-002: Justificación exige `Sin fichadas`/futuro; Corrección Manual
existente opera sobre jornadas ya calculadas). No se agrega ninguna validación cruzada
nueva: si un día tiene Corrección Manual vigente, ya tiene fichadas o una corrección de
horas, así que `esDiaElegible` lo excluye por sí solo. `SituacionDia` (proyección del
día en curso, 010) **no se modifica** en esta entrega: un día futuro justificado sigue
proyectando `ESPERANDO`/`AUSENTE` normalmente el día que efectivamente transcurre,
hasta que ese día se cierre y a partir de ahí sí se refleja en `EstadoJornada` +
Justificación. Se documenta como límite explícito de esta feature.

**Rationale**: evita expandir el alcance a la vista de "hoy en curso" (fuera de las
User Stories del spec) y evita una regla de precedencia nueva entre dos mecanismos
disjuntos por diseño.

**Alternatives considered**: hacer que `calcularSituacionHoy` devuelva un estado
`JUSTIFICADO` cuando el día en curso tiene Justificación vigente — se deja como
extensión futura, no bloqueante para las 3 User Stories de este spec.

## 6. Catálogo de motivos como configuración extensible

**Decisión**: `config/motivos-ausencia.json` (+ `.example.json`), con la misma
convención que `config/categorias.json`: un array `motivos` de objetos `{ id, etiqueta,
tipoPago, activo }`. `motivos-ausencia-config.js` valida fail-fast al arranque (ids
únicos, no vacíos; `tipoPago` ∈ {`Paga`, `No paga`}; al menos un motivo activo), mismo
criterio que `categorias-config.js`. `activo: false` permite retirar un motivo de la
lista ofrecida sin borrar el historial de Justificaciones que ya lo usaron (edge case
del spec).

**Rationale**: responde directamente al pedido explícito del usuario ("crear archivo
json para que sea extensible") con el mismo patrón de configuración ya establecido y
ya probado en el repositorio, sin inventar un formato nuevo.

**Alternatives considered**: catálogo hardcodeado en el dominio (array JS constante) —
descartado explícitamente por FR-006 (editable sin cambios de código) y por el pedido
del usuario.
