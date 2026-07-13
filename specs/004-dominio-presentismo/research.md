# Research: Dominio de Presentismo

**Feature**: 004-dominio-presentismo | **Date**: 2026-07-10

Este documento resuelve las decisiones técnicas del plan antes del diseño de detalle.
No quedan `NEEDS CLARIFICATION` de negocio: los tres puntos abiertos del spec se cerraron
en las sesiones de `/speckit-clarify` (ver `spec.md` §Clarifications). Aquí se fijan las
decisiones de implementación.

## §1 — Arquitectura: dominio puro + puertos/adaptadores

**Decisión**: separar un núcleo de dominio sin E/S (funciones puras y deterministas) de
la infraestructura (fichadas, categoría, persistencia, logging) detrás de puertos, con
adaptadores intercambiables. Un servicio orquestador cablea puertos + dominio.

**Racional**:
- El cálculo impacta liquidación de haberes; la Constitución (Principio IV) exige
  test-first y cobertura fuerte. Un núcleo puro se testea al minuto con fixtures, sin
  mocks de E/S, y garantiza el determinismo de FR-023/SC-005.
- El proyecto ya usa exitosamente este patrón en `src/roster/`
  (`ActiveEmployeesProvider` con adaptadores archivo/Oracle/cache). Reutilizar el patrón
  reduce carga cognitiva del equipo.
- Permite que la UI futura (fuera de alcance) consuma los mismos puertos sin reescribir
  el dominio.

**Alternativas consideradas**:
- *Lógica de cálculo mezclada con acceso a datos*: rechazada; imposibilita el
  test-first puro y arriesga que un cambio de persistencia rompa el cálculo.
- *Framework de aplicación (Nest/etc.)*: rechazada; el proyecto es librería estándar sin
  frameworks, y un framework sería complejidad injustificada (Constitución/Governance).

## §2 — Representación del tiempo

**Decisión**: representar horas de fichada, ventanas, horas oficiales y márgenes como
**minutos-del-día** (enteros `0..1439`). Las duraciones (horas trabajadas, descuentos de
pausa) son enteros en minutos. Formateo `HH:MM` solo en los bordes (entrada/salida de
datos y reportes). Sin librerías de fecha/hora de terceros.

**Racional**:
- Aritmética exacta y determinista al minuto (SC-002, SC-005); evita errores de punto
  flotante y de zonas horarias.
- El spec asume hora local del establecimiento, sin huso ni DST (Assumptions), y jornada
  dentro del mismo día (no cruza medianoche): un entero de minutos es suficiente y
  simple.
- Las fichadas del reloj ya se manejan a nivel de minutos/segundos en el store; para
  presentismo se trunca a minuto (el spec y sus ejemplos razonan al minuto).

**Alternativas consideradas**:
- *`Date`/timestamps*: rechazada; arrastra huso horario y complica la comparación de
  "hora del día" independiente de la fecha.
- *Librería (Luxon/dayjs)*: rechazada; dependencia innecesaria para aritmética trivial
  de minutos, contra la política de mínimas dependencias del proyecto.

**Nota de fecha**: la *fecha* de la fichada (para imputarla a un Día) se maneja como
`YYYY-MM-DD` (string ISO), consistente con el store existente (`periodo = fecha.slice(0,7)`).

## §3 — Persistencia del estado propio del sistema

**Decisión**: definir un puerto `PresentismoRepository` que persiste el estado editable
que este sistema **posee** (calendarios del mes y reclasificaciones, correcciones
manuales, pausas intermedias). Adaptador inicial: **archivo JSON** por instalación
(un archivo por mes o un archivo raíz con índice), con escritura atómica. Adaptador
`in-memory` para tests. La estructura del dominio no conoce el adaptador.

**Racional**:
- Este estado es propio del dominio de presentismo, **no** de RRHH: por Principio II no
  debe escribirse en la Oracle de RRHH (acceso de solo lectura, mínimo privilegio).
- El proyecto aún no tiene una base propia; un archivo JSON es coherente con los
  artefactos existentes (`config/*.json`, logs NDJSON) y suficiente para el volumen
  (~500 empleados, ~31 días). El puerto permite migrar a SQLite/otra base sin tocar el
  dominio si el volumen o la concurrencia lo exigen.
- Escritura atómica (archivo temporal + rename) evita corromper el estado ante un corte.

**Alternativas consideradas**:
- *Solo en memoria*: rechazada; las reclasificaciones de días, correcciones y pausas son
  durables y editables (FR-005/FR-006/FR-026/FR-037); perderlas al reiniciar es
  inaceptable.
- *Escribir en Oracle RRHH*: rechazada por Principio II (solo lectura) y porque son datos
  de este dominio, no del padrón.
- *SQLite ya*: aplazada; introduce dependencia/setup sin necesidad actual. El puerto deja
  la puerta abierta.

## §4 — Origen de la categoría del empleado

**Decisión**: la asignación legajo→categoría se **lee** del padrón Oracle de RRHH,
ampliando la capa de repositorio existente (`src/db/oracle-roster-repository.js`) para
proyectar una **columna de categoría** además del legajo. El nombre de la columna es
**configurable por variable de entorno** (p. ej. `RRHH_ORACLE_COLUMNA_CATEGORIA`, default
razonable), igual que `RRHH_ORACLE_COLUMNA_LEGAJO` en la feature 003. Un adaptador
`EmployeeCategoryProvider` normaliza el resultado (legajo → código de categoría).

**Racional**:
- El spec fija (Clarify Q2) que la asignación viene del padrón, solo lectura; la
  **definición** de la categoría (modalidad + parámetros) vive en este sistema (§5).
- Reutiliza el patrón, las credenciales y el aislamiento de la feature 003; sin SQL fuera
  de `src/db/` (Principio II).
- La columna configurable evita acoplar el código a un esquema concreto de RRHH; el
  nombre real lo define RRHH/DBA en despliegue.

**Punto deferido (no bloqueante)**: el nombre físico de la columna/vista de categoría en
Oracle es un detalle de despliegue, resuelto por configuración; no condiciona el diseño.
Si el padrón no expone categoría, se documenta como prerrequisito de RRHH en quickstart.

**Alternativas consideradas**:
- *Mapa legajo→categoría en archivo local*: rechazada como fuente primaria (el spec dice
  que viene del padrón); podría existir como adaptador alternativo para entornos sin
  Oracle, análogo a `local-file-active-employees-provider`, pero no es el camino oficial.

## §5 — Configuración de categorías y modalidades

**Decisión**: las **categorías** (código, modalidad de liquidación, y su juego de
parámetros de jornada) se definen en un **archivo de configuración de este sistema**
(`config/categorias.json`, con `config/categorias.example.json` de ejemplo), cargado y
**validado fail-fast al arranque**. Cada categoría referencia una modalidad `Mensual` o
`Quincenal`; cada modalidad trae ventana de apertura/cierre, hora oficial de
apertura/cierre y márgenes. El esquema semanal de días laborables es **global** (no por
modalidad), configurable aparte con default Lunes–Viernes.

**Racional**:
- Clarify Q2/Q3: definición local, parámetros por modalidad, esquema semanal global.
- Reproduce el patrón de `config/active-employees.json` (config validada, ejemplo
  versionado, valores reales no commiteados). La validación fail-fast (como
  `oracle-roster-config`) evita cálculos con parámetros a medio definir (FR-035 aplica a
  categorías del padrón no presentes en esta config).

**Alternativas consideradas**:
- *Parámetros por variables de entorno*: rechazada; son estructurados (varias
  modalidades, cada una con varios campos), un JSON es más claro y testeable.
- *Parámetros hardcodeados*: rechazada; FR-010/FR-003 exigen configurabilidad sin cambios
  de código.

## §6 — Modelo Calendario del mes vs Período de liquidación

**Decisión**: una entidad **Calendario del mes** (`YYYYMM`) única y compartida guarda la
clasificación institucional de cada Día. El **Período de liquidación** NO se persiste como
entidad separada: es una **vista/recorte derivado** del calendario según la modalidad
(mes completo, o quincena 1–15 / 16–fin) al momento de calcular. El resumen se emite sobre
ese recorte.

**Racional**:
- Clarify Q4: separar calendario (institucional, compartido) del período (propio de la
  modalidad) evita duplicar feriados por modalidad. Derivar el recorte en vez de
  persistirlo mantiene una sola fuente de verdad del calendario y elimina el riesgo de
  desincronización.
- Determinismo: el recorte es función pura del `YYYYMM` + modalidad; no hay estado extra
  que mantener consistente.

**Alternativas consideradas**:
- *Persistir cada Período de liquidación*: rechazada; duplica días y feriados, y crea
  riesgo de que un feriado cargado no se propague a todas las modalidades.

## §7 — Reglas de cálculo determinista (consolidación normativa)

Estas reglas provienen del spec (FR-012 a FR-020, FR-038) y se fijan aquí como base de
los fixtures de test. Todo en minutos-del-día.

- **Candidatas a entrada**: fichadas del legajo en el día dentro de la ventana de apertura
  de su modalidad; **entrada** = la más temprana.
- **Candidatas a salida**: fichadas dentro de la ventana de cierre de su modalidad y
  **posteriores** a la entrada; **salida** = la más tardía. Nunca la misma fichada que la
  entrada.
- **Hora efectiva de entrada** = `apertura_oficial` si `entrada ≤ apertura_oficial +
  margen_apertura`; si no, `entrada`.
- **Hora efectiva de salida** = `cierre_oficial` si `salida ≥ cierre_oficial −
  margen_cierre`; si no, `salida`.
- **Horas trabajadas (auto)** = `clamp(salida_efectiva − entrada_efectiva, 0,
  jornada_esperada)`. Límites de ventana/margen **inclusivos**.
- **Sin una u otra punta** (día `Laborable`): `0` y estado `Incompleta`; se calcula la
  **sugerencia no aplicada** completando con la hora oficial faltante (FR-015).
- **Feriado**: crédito automático = jornada esperada de la modalidad, estado `Feriado
  cumplido`, sin requerir fichadas (FR-020).
- **No Laborable / Sin fichadas**: `0`; fichadas en `No Laborable`/`Feriado` se reportan
  aparte, no suman (FR-018).
- **Pausa intermedia**: descuento = suma de `overlap([desde,hasta], [entrada_efectiva,
  salida_efectiva])` de cada pausa; `total_diario = max(0, horas − descuento)` (FR-038/39).
- **Corrección manual**: si existe y está vigente, su valor prevalece sobre el auto para
  el total (FR-028); puede exceder la jornada esperada solo por corrección (FR-024).
- **Quincena**: primera = días con `DD ≤ 15`; segunda = `DD ≥ 16`. Suma de ambas = mes
  (SC-012).

**Racional**: fijar la aritmética exacta y los bordes inclusivos elimina ambigüedad en
los tests y asegura reproducibilidad (SC-005).

## §8 — Testing y estrategia de fixtures

**Decisión**: `node:test` + `node:assert`. El motor de cálculo se cubre con una tabla de
fixtures derivada 1:1 de los Acceptance Scenarios (US2 esc. 1–12, US3 esc. 1–8), más
casos de borde del spec (pausa fuera de horario, pausa > trabajado, salida < entrada,
límites inclusivos). El repositorio Oracle de categoría se testea con una **fábrica de
conexiones inyectable** (fake que devuelve filas fijas), sin base real (igual que
`oracle-roster-repository.test.js`). Contrato de puertos: un test que corre el mismo set
contra cada adaptador (memoria vs archivo) para garantizar equivalencia.

**Racional**: Principio IV (test-first en cálculo y datos). Fixtures trazables al spec dan
cobertura verificable de SC-002/006/008/012/013/015 y facilitan detectar regresiones.

**Alternativas consideradas**:
- *Base Oracle real en la suite*: rechazada; frágil, lenta y no reproducible en CI. El
  smoke real queda manual y condicionado a entorno (quickstart).

## §9 — Observabilidad

**Decisión**: un logger NDJSON (`presentismo-logger.js`) al estilo de los loggers
existentes (`roster-fetch-logger`, `service-cycle-logger`), que emite eventos
estructurados correlacionables por `periodo`/`legajo`/`dia` para: generación de
calendario, reclasificación de día, cálculo de jornada/período, alta/reversión de
corrección, alta/reversión de pausa, y anomalías (categoría no configurada, fichada no
imputada). Nunca loguea datos biométricos ni credenciales.

**Racional**: FR-025 y Principio V. Reutiliza el formato NDJSON ya adoptado por el
proyecto para diagnóstico homogéneo.

## Resumen de decisiones

| # | Tema | Decisión |
|---|------|----------|
| 1 | Arquitectura | Dominio puro + puertos/adaptadores + servicio orquestador |
| 2 | Tiempo | Minutos-del-día enteros; fecha `YYYY-MM-DD`; sin librerías |
| 3 | Persistencia propia | Puerto `PresentismoRepository` + adaptador archivo JSON atómico |
| 4 | Categoría | Lectura Oracle read-only (amplía `src/db/`), columna configurable |
| 5 | Config categorías | `config/categorias.json` validado fail-fast; esquema semanal global |
| 6 | Calendario vs Período | Calendario persistido; período de liquidación derivado |
| 7 | Reglas de cálculo | Normalizadas en minutos, bordes inclusivos, deterministas |
| 8 | Testing | `node:test`, fixtures 1:1 con Acceptance, fake de conexión Oracle |
| 9 | Observabilidad | Logger NDJSON estructurado sin datos sensibles |
