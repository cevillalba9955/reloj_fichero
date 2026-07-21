# Feature Specification: Reestructurar Almacenamiento por Período

**Feature Branch**: `013-reestructurar-data-periodos`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "reestructurar carpeta data, quiero dentro una carpeta por cada periodo mensual, "PYYYYMM", dentro contiene el archivo calendario.json, fichadas.json, padron.json. Motivo: archivar al cierre del mes, y permitir eliminar periodos antiguos una vez subidos a la BD (sin desarrollar aun), el archivo padron se genera junto con el calendario, el back apunta a la carpeta del mes en curso al actualizar el padron. agregar flag al calendario cuando este cerrado de solo lectura"

## Clarifications

### Session 2026-07-20

- Q: ¿Qué dispara el cierre de un período (marcarlo de solo lectura)? → A: Acción
  manual de un responsable: se agrega una acción explícita ("cerrar período") que se
  ejecuta cuando el responsable decide que el mes ya está liquidado; el sistema no
  cierra períodos por sí solo al cambiar de mes.
- Q: ¿Un período cerrado se puede reabrir? → A: Sí, es reversible: un responsable
  puede reabrirlo, con la misma auditoría (quién y cuándo) que ya rige para revertir
  una Corrección Manual o una Justificación.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un período mensual vive en una carpeta propia y autocontenida (Priority: P1)

Como responsable de administración de personal (y como quien opera el entorno del
sistema), quiero que todo el estado operativo de un período mensual —su calendario,
sus fichadas y el padrón de empleados vigente ese mes— viva junto en una única
carpeta identificada por el período (`PYYYYMM`), para poder ubicar, archivar o
eliminar de una sola vez todo lo referido a un mes, sin tener que buscar sus piezas
repartidas en distintas carpetas o mezcladas con las de otros meses.

**Why this priority**: es la base de todo lo demás (archivar, cerrar, eliminar más
adelante). Sin esta reorganización no hay una unidad de período clara sobre la cual
aplicar ninguna política de ciclo de vida. Entrega valor por sí sola: hoy localizar
todos los datos de un mes exige cruzar varias rutas.

**Independent Test**: se puede probar completo generando el calendario de un período
nuevo y verificando que se crea una carpeta `PYYYYMM` con su calendario, su padrón y
un lugar para sus fichadas, sin tocar ni depender de las carpetas de otros períodos.

**Acceptance Scenarios**:

1. **Given** que no existe ningún dato del período `202608`, **When** se genera el
   calendario de ese período, **Then** se crea una carpeta identificada como
   `P202608` que contiene el calendario de ese mes.
2. **Given** el período `202608` ya tiene su carpeta, **When** se consultan sus
   fichadas o se registran fichadas nuevas de ese mes, **Then** quedan dentro de la
   misma carpeta `P202608`, sin mezclarse con las de `P202607`.
3. **Given** dos períodos distintos ya existen (`P202607` y `P202608`), **When** se
   opera sobre uno de ellos (calcular presentismo, corregir una jornada, consultar el
   resumen), **Then** el otro período no se lee ni se modifica.

---

### User Story 2 - El padrón queda fechado por período y se actualiza sobre el mes en curso (Priority: P2)

Como responsable de administración de personal, quiero que cada período tenga su
propio padrón de empleados (tomado al generar el calendario de ese mes) y que
cualquier actualización posterior del padrón se aplique siempre sobre el período en
curso, para saber con certeza qué nómina de empleados regía en un mes ya cerrado,
incluso si la nómina cambió después.

**Why this priority**: depende de que exista la carpeta por período (US1), pero es
lo que le da sentido a "archivar": un período archivado con un padrón fechado sigue
siendo consultable e íntegro, mientras que un padrón único y global no reflejaría
correctamente la nómina histórica de un mes ya cerrado.

**Independent Test**: se puede probar completo generando el calendario de un período
nuevo (que crea su padrón), sincronizando después el padrón (que actualiza el
período en curso) y verificando que el padrón de un período anterior no cambió.

**Acceptance Scenarios**:

1. **Given** que se genera el calendario del período `202608`, **When** se completa
   la generación, **Then** ese período queda con su propio padrón (una copia de los
   empleados vigentes en ese momento).
2. **Given** los períodos `202607` (pasado) y `202608` (mes en curso) ya generados,
   **When** se sincroniza el padrón desde la fuente de RRHH, **Then** el padrón de
   `202608` se actualiza y el padrón de `202607` permanece exactamente igual.

---

### User Story 3 - Un período cerrado queda protegido de modificaciones (Priority: P3)

Como responsable de administración de personal, quiero poder marcar el calendario de
un período como cerrado —con una acción explícita, cuando decido que el mes ya está
liquidado— y que, a partir de ese momento, el sistema no permita modificarlo
(correcciones, pausas, justificaciones, reclasificación de días, carga de fichadas
nuevas), para asegurar que un mes ya liquidado no cambie por error una vez que sus
datos fueron subidos a la base institucional. Si cerré un período por error o hace
falta corregir algo después, quiero poder reabrirlo.

**Why this priority**: no bloquea el valor de tener la carpeta por período (US1) ni el
padrón fechado (US2), pero es lo que hace segura la futura eliminación de períodos
antiguos: solo tiene sentido archivar o borrar un período cuya integridad ya no puede
alterarse. La subida a la base y el borrado en sí quedan fuera de esta feature.

**Independent Test**: se puede probar completo marcando un período como cerrado y
verificando que un intento de corregir una jornada, reclasificar un día o cargar una
Justificación sobre ese período se rechaza, mientras que consultarlo (calcular,
resumen, detalle) sigue funcionando igual que antes.

**Acceptance Scenarios**:

1. **Given** un período abierto con su calendario generado, **When** se lo marca como
   cerrado, **Then** su calendario queda identificado como cerrado (de solo lectura).
2. **Given** un período cerrado, **When** se intenta reclasificar un día, cargar una
   corrección, una pausa o una Justificación sobre ese período, **Then** el sistema
   rechaza la operación indicando que el período está cerrado.
3. **Given** un período cerrado, **When** se consulta su calendario, su resumen o el
   detalle de un empleado, **Then** la consulta responde con normalidad, igual que
   sobre un período abierto.
4. **Given** un período recién generado, **When** se consulta si está cerrado,
   **Then** el sistema indica que NO está cerrado (abierto por defecto).
5. **Given** un período cerrado por error, **When** un responsable lo reabre,
   **Then** el período vuelve a admitir modificaciones y queda registrado quién y
   cuándo lo reabrió, sin perder el registro de que estuvo cerrado.

---

### Edge Cases

- **Generar el calendario de un período que ya existe**: no debe duplicar ni perder
  el padrón, las fichadas ni el estado ya cargado de ese período (mismo criterio que
  ya rige hoy para no duplicar reclasificaciones al regenerar un calendario).
- **Sincronizar el padrón sin haber generado antes el calendario del mes en curso**:
  el sistema no debe fallar de forma confusa; debe dejar el padrón del mes en curso
  disponible de todos modos.
- **Intentar cerrar un período que ya está cerrado**: no debe producir un error
  confuso ni un doble registro; queda simplemente cerrado.
- **Fichadas nuevas que llegan (del reloj o de una importación) para un período ya
  cerrado**: se rechazan igual que cualquier otra modificación (FR-006), en vez de
  colarse en un período que ya se consideró cerrado.
- **Un período cerrado por error**: el sistema debe ofrecer una forma de revertir el
  cierre (ver Clarifications), para no dejar un mes bloqueado sin salida ante un error
  operativo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE organizar el estado operativo por período mensual en
  una carpeta propia por período, identificada como `PYYYYMM` (por ejemplo,
  `P202608` para agosto de 2026).
- **FR-002**: Cada carpeta de período DEBE contener, en archivos separados dentro de
  esa misma carpeta, el calendario del período (incluyendo su estado operativo:
  reclasificaciones, correcciones, pausas y justificaciones), las fichadas de ese
  período, y el padrón de empleados de ese período.
- **FR-003**: Al generar el calendario de un período, el sistema DEBE crear (si no
  existe todavía) el padrón de ese mismo período, a partir de la nómina de empleados
  vigente en ese momento.
- **FR-004**: Toda sincronización o actualización del padrón DEBE escribirse en la
  carpeta del período correspondiente al mes en curso (el mes real al momento de la
  actualización), nunca en la carpeta de un período pasado.
- **FR-005**: El calendario de un período DEBE exponer un indicador de "cerrado"
  (verdadero/falso), en `false` por defecto al generarse.
- **FR-005a**: El sistema DEBE ofrecer una acción explícita para que un responsable
  cierre un período abierto, y otra para reabrir un período cerrado; ninguna de las
  dos ocurre automáticamente por el solo paso del tiempo o al generar el calendario
  de otro mes.
- **FR-006**: Mientras el calendario de un período esté marcado como cerrado, el
  sistema NO DEBE permitir ninguna modificación de su estado: ni reclasificar días,
  ni registrar correcciones, pausas o Justificaciones, ni incorporar fichadas nuevas
  a ese período.
- **FR-007**: Un período cerrado DEBE seguir siendo consultable sin restricciones
  (cálculo de presentismo, resumen del período, detalle por empleado, listado del
  padrón), exactamente igual que uno abierto.
- **FR-008**: Cerrar o reabrir un período DEBE dejar constancia de quién lo hizo y
  cuándo (mismo criterio de auditoría que correcciones, pausas y Justificaciones); un
  período reabierto vuelve a admitir modificaciones sin perder el registro histórico
  de que estuvo cerrado.
- **FR-009**: Cerrar un período NO DEBE mover, renombrar ni eliminar ningún archivo
  de su carpeta: la carpeta permanece intacta y disponible para un archivado o
  eliminación manual posterior, fuera del alcance de esta feature.
- **FR-010**: El resultado de calcular presentismo, generar resúmenes o consultar el
  padrón de un período NO DEBE cambiar por esta reestructuración: solo cambia dónde y
  cómo se guardan los archivos, no lo que informan.

### Key Entities *(include if feature involves data)*

- **Carpeta de Período (`PYYYYMM`)**: unidad de almacenamiento de un mes calendario.
  Agrupa el calendario, las fichadas y el padrón de ese mes en un mismo lugar,
  independiente de cualquier otro período.
- **Calendario del período**: ya existente (feature 004); se le agrega el indicador
  de cerrado (verdadero/falso) y los datos de auditoría de cuándo y por quién se
  cerró o reabrió.
- **Padrón del período**: snapshot de los empleados vigentes, ahora propio de cada
  carpeta de período en vez de un único archivo compartido por todo el sistema;
  creado junto con el calendario y actualizado únicamente sobre el período del mes en
  curso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Toda la información de un período mensual (calendario, fichadas,
  padrón) se encuentra en una única carpeta, localizable sin tener que combinar rutas
  ni archivos de otros períodos.
- **SC-002**: El padrón de un período que ya pasó no cambia nunca después de que
  termina ese mes, incluso si la nómina de empleados cambia más adelante.
- **SC-003**: El 100% de los intentos de modificar un período cerrado (reclasificar,
  corregir, pausar, justificar, incorporar fichadas) se rechazan sin alterar ningún
  dato de ese período.
- **SC-004**: Cerrar o reabrir un período no cambia ningún resultado de cálculo ya
  existente: el presentismo calculado antes y después del cierre es idéntico mientras
  no cambien las fichadas ni los ajustes previos.

## Assumptions

- La migración de los datos ya existentes en el formato anterior (un archivo por
  período junto a una subcarpeta compartida de fichadas y un único padrón global)
  queda fuera del alcance de esta especificación: es una decisión de implementación
  (script de migración, recreación desde cero, o convivencia temporal de ambos
  formatos), no un requisito de negocio.
- Un período se identifica y se ordena por su mes calendario (`YYYYMM`); el prefijo
  `P` es solo la convención de nombre de carpeta pedida, no cambia la identidad del
  período que ya usan el resto de las features (004/010/011/012).
- La subida de un período a la base institucional y la eliminación efectiva de
  carpetas de períodos antiguos, mencionadas como motivación, quedan explícitamente
  fuera de alcance ("sin desarrollar aún" según el pedido): esta feature deja el
  terreno preparado (períodos autocontenidos y cerrables) pero no implementa ni la
  subida ni el borrado.
- El rol habilitado para cerrar y reabrir un período es el mismo responsable de
  administración de personal que hoy puede aplicar una Corrección Manual o una
  Justificación; no se introduce un rol nuevo.
