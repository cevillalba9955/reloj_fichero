# Feature Specification: Padrón Real de Empleados Activos desde Oracle/RRHH

**Feature Branch**: `003-padron-oracle-rrhh`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Integrar el padrón real de empleados activos
desde la base Oracle de RRHH detrás de la interfaz ActiveEmployeesProvider
existente, reemplazando el adapter placeholder de archivo local de la
feature 002 sin modificar el resto del servicio de consulta programada.
Acceso de solo lectura al padrón, a través de una capa de repositorio
dedicada (Principio II de la constitución), con credenciales vía variables
de entorno."

## Clarifications

### Session 2026-07-08

- Q: ¿De dónde surge el criterio de "empleado activo" en la fuente RRHH?
  → A: RRHH/DBA provee una vista (o consulta preparada) de solo lectura
  que ya devuelve los legajos activos; este servicio no conoce ni mantiene
  el criterio de actividad. Si la definición de "activo" cambia, se
  actualiza del lado de RRHH sin tocar este servicio.
- Q: Si la fuente de RRHH no está disponible, ¿qué padrón previo puede
  usarse como respaldo para evaluar completitud? → A: El último padrón
  válido obtenido, aunque provenga de un día anterior (el proceso es de
  larga duración y puede atravesar días). El servicio deja constancia en
  el log de que opera en modo degradado, incluyendo la antigüedad (fecha y
  hora de obtención) del padrón reutilizado. Solo si nunca se obtuvo un
  padrón válido (por ejemplo, primer arranque con la fuente caída) rige la
  regla heredada de la feature 002: error, sin asumir padrón vacío.
- Q: ¿Con qué frecuencia se refresca el padrón desde la fuente RRHH? → A:
  Una sola vez por día de servicio, en el primer ciclo del día; todo el
  día se evalúa con ese padrón. Si esa obtención falla, se reintenta en
  los ciclos siguientes hasta lograrla (mientras tanto rige el respaldo de
  FR-008 o el error de FR-007). Un alta o baja del mismo día se refleja
  recién al día siguiente — riesgo aceptado.
- Q: ¿Qué hace el servicio si la fuente devuelve un padrón vacío (0
  legajos) como respuesta exitosa? → A: Lo trata como fuente no disponible
  a efectos de completitud: ningún momento esperado se cierra por
  completitud con un universo vacío; rige el respaldo del último padrón
  válido (FR-008) o el error (FR-007), la obtención del padrón del día se
  considera todavía pendiente (se reintenta en ciclos siguientes, FR-014),
  y la anomalía queda registrada en el log. Racional: un vacío legítimo
  (día sin actividad) solo cuesta consultas de más, mientras que un vacío
  por una vista defectuosa cerraría el día entero por "completitud" falsa
  y detendría la recolección.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Evaluar completitud contra el padrón real de RRHH (Priority: P1)

Como integrador/administrador del sistema, quiero que el servicio de
consulta programada (`002-servicio-fichadas-programado`) obtenga el
universo de empleados activos directamente desde la base de datos de RRHH
de la empresa, en vez de un archivo local mantenido a mano, para que el
cierre por completitud de cada momento esperado (entrada/salida) y la
lista de empleados incompletos reflejen la plantilla real vigente sin
mantenimiento manual.

**Why this priority**: Es el objetivo central de la feature — el servicio
de la feature 002 ya funciona de punta a punta, pero su noción de
"empleados activos" descansa en un archivo placeholder que se desactualiza
apenas hay un alta o una baja. Sin esta integración, la completitud que
reporta el servicio no es confiable para operar.

**Independent Test**: Se puede probar configurando el servicio contra una
fuente de padrón (real o simulada) con un conjunto conocido de legajos
activos, y verificando que la completitud por momento esperado y la lista
de incompletos que expone el estado en memoria coinciden con ese conjunto,
sin que exista ningún archivo local de padrón involucrado.

**Acceptance Scenarios**:

1. **Given** el servicio está configurado para usar el padrón de RRHH y la
   fuente está disponible, **When** el servicio necesita evaluar la
   completitud de un momento esperado, **Then** el universo de empleados
   activos proviene de la fuente de RRHH (no de un archivo local) y la
   completitud se calcula contra ese universo.
2. **Given** un empleado fue dado de baja en RRHH antes del día de
   servicio, **When** el servicio obtiene el padrón del día, **Then** ese
   legajo no forma parte del universo de activos y su ausencia de fichadas
   no mantiene abierto ningún momento esperado ni lo expone como
   incompleto.
3. **Given** el resto del servicio de la feature 002 (scheduler, store,
   estado en memoria), **When** se reemplaza la fuente del padrón por la de
   RRHH, **Then** ningún otro comportamiento observable del servicio cambia
   (mismas reglas de cierre, deduplicación, exposición de estado).

---

### User Story 2 - Seguir operando ante indisponibilidad de la fuente (Priority: P2)

Como integrador, quiero que una caída o inaccesibilidad temporal de la
base de RRHH no detenga la recolección de fichadas ni produzca decisiones
incorrectas de completitud, para que el servicio siga siendo confiable
durante toda la jornada aunque la fuente del padrón falle a mitad del día.

**Why this priority**: La base de RRHH es un sistema externo fuera del
control de este servicio; su indisponibilidad transitoria es un escenario
esperable. La feature 002 ya define que sin padrón válido no se asume un
padrón vacío (FR-013 de esa spec); esta historia extiende esa regla con
una degradación razonable: reutilizar el último padrón válido obtenido,
aunque provenga de un día anterior.

**Independent Test**: Se puede probar simulando que la fuente del padrón
falla después de haber respondido bien al menos una vez (ese día o un día
anterior), y verificando que el servicio continúa evaluando completitud
con el último padrón válido, dejando constancia en el log de la
antigüedad del padrón reutilizado; y que, si la fuente falla sin ningún
padrón válido previo, el ciclo se registra como error sin cerrar ningún
momento esperado por "completitud" espuria.

**Acceptance Scenarios**:

1. **Given** el servicio ya obtuvo el padrón con éxito antes (hoy o un
   día anterior), **When** la fuente de RRHH deja de responder en un ciclo
   posterior, **Then** el servicio sigue evaluando completitud con el
   último padrón válido y registra en el log que está operando con un
   padrón potencialmente desactualizado, incluyendo su fecha y hora de
   obtención.
2. **Given** el servicio arranca y la fuente de RRHH no está disponible
   (sin ningún padrón válido previo), **When** llega el momento de
   evaluar completitud, **Then** el ciclo se registra como error, no se
   asume un padrón vacío ni ficticio, y ningún momento esperado se cierra
   por completitud (el cierre por margen agotado sigue operando normal).
3. **Given** la fuente vuelve a estar disponible después de una falla,
   **When** el servicio vuelve a consultarla, **Then** retoma el padrón
   fresco de la fuente y deja de usar el padrón cacheado.

---

### User Story 3 - Configurar la conexión de forma segura y diagnosticable (Priority: P3)

Como integrador, quiero configurar el acceso a la base de RRHH mediante
variables de entorno (credenciales, datos de conexión) y obtener errores
claros cuando la configuración falta o es inválida, para poder desplegar
el servicio en distintos entornos sin editar código ni exponer secretos.

**Why this priority**: Sin configuración segura la feature no es
desplegable en el entorno real, pero es un requisito transversal que solo
tiene sentido una vez que la integración (Historia 1) existe.

**Independent Test**: Se puede probar arrancando el servicio con distintas
combinaciones de variables de entorno (completas, faltantes, inválidas) y
verificando que: con configuración completa el servicio arranca y consulta
el padrón; con configuración faltante falla al arrancar con un mensaje
claro que identifica qué variable falta; y que ningún log ni mensaje de
error expone el valor de una credencial.

**Acceptance Scenarios**:

1. **Given** las variables de entorno de conexión están completas,
   **When** el servicio arranca, **Then** puede obtener el padrón sin que
   ninguna credencial esté escrita en código, en archivos versionados ni
   en la línea de comandos.
2. **Given** falta una variable de entorno requerida, **When** el servicio
   arranca configurado para usar el padrón de RRHH, **Then** falla de
   inmediato (antes de programar ciclos) con un mensaje que indica qué
   configuración falta, sin exponer valores de otras credenciales.
3. **Given** cualquier operación de consulta del padrón (exitosa o
   fallida), **When** se registra en el log estructurado, **Then** el
   registro incluye resultado, cantidad de legajos y duración, y nunca
   incluye credenciales ni cadenas de conexión completas.

---

### Edge Cases

- ¿Qué pasa si las credenciales son inválidas (autenticación rechazada)
  aunque estén presentes? El servicio lo trata como fuente no disponible
  (misma regla que la Historia 2) y el mensaje de error distingue "no pude
  autenticar" de "no pude conectar", sin exponer la credencial usada.
- ¿Qué pasa si la consulta del padrón queda colgada (la fuente no responde
  pero no rechaza)? La consulta debe tener un tiempo máximo de espera
  configurable; al agotarse, se trata como fuente no disponible y el ciclo
  de sondeo del reloj no queda bloqueado indefinidamente.
- ¿Qué pasa si la fuente devuelve un padrón vacío (0 legajos activos) como
  respuesta exitosa? Se trata como fuente no disponible a efectos de
  completitud (FR-011, ver Clarifications): ningún momento esperado cierra
  por completitud con universo vacío, rige el respaldo del último padrón
  válido o el error, la obtención del día se reintenta en ciclos
  siguientes, y la anomalía queda registrada en el log.
- ¿Qué pasa si la fuente devuelve legajos duplicados o valores no
  interpretables como legajo? El servicio normaliza (deduplica) los
  legajos válidos, descarta los inválidos dejando constancia en el log, y
  no falla el padrón completo por un registro defectuoso.
- ¿Qué pasa si hay un alta o baja en RRHH a mitad del día, después de que
  el servicio ya obtuvo el padrón del día? El cambio se refleja recién al
  día siguiente: el padrón se consulta una sola vez por día de servicio
  (FR-014, ver Clarifications) y el servicio no necesita enterarse en
  tiempo real.
- ¿Qué pasa con el archivo local de padrón de la feature 002? Sigue
  existiendo como alternativa explícita de configuración (para desarrollo
  y pruebas sin acceso a RRHH), pero deja de ser el modo por defecto
  cuando la conexión a RRHH está configurada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El servicio DEBE poder obtener el universo de empleados
  activos desde la base de datos de RRHH de la empresa a través de la
  interfaz `ActiveEmployeesProvider` ya definida en la feature 002, sin
  modificar el contrato de esa interfaz ni el comportamiento del resto del
  servicio de consulta programada (reemplazo drop-in del adapter).
- **FR-002**: El acceso a la base de RRHH DEBE ser exclusivamente de
  lectura: esta feature NO DEBE ejecutar ninguna operación de escritura,
  y el acceso DEBE otorgarse con el mínimo privilegio necesario
  (Constitución, Principio II).
- **FR-003**: Todo acceso a la base de RRHH DEBE pasar por una capa de
  repositorio dedicada; ninguna consulta a la base se escribe fuera de esa
  capa (Constitución, Principio II).
- **FR-004**: Las credenciales y los datos de conexión DEBEN proveerse por
  variables de entorno (o un gestor de secretos); NUNCA se hardcodean, se
  versionan en el repositorio, ni se pasan por la línea de comandos.
- **FR-005**: Si el servicio está configurado para usar el padrón de RRHH
  y falta configuración requerida (variable ausente o vacía), DEBE fallar
  al arrancar — antes de programar ciclos de sondeo — con un mensaje que
  identifique qué configuración falta, sin exponer valores de credenciales.
- **FR-006**: El resultado de la consulta del padrón DEBE tener la misma
  forma que el contrato existente del proveedor de empleados activos
  (lista de legajos activos), de modo que el consumidor no distinga de qué
  adapter proviene.
- **FR-007**: Si la fuente de RRHH no está disponible (error de conexión,
  autenticación rechazada, tiempo de espera agotado) y NO existe ningún
  padrón válido obtenido anteriormente (por ejemplo, primer arranque con
  la fuente caída), el servicio DEBE registrar el error y NO DEBE asumir
  un padrón vacío o ficticio (misma regla que FR-013 de la feature 002).
- **FR-008**: Si la fuente de RRHH no está disponible pero SÍ existe un
  padrón válido obtenido anteriormente — del mismo día o de un día previo
  (ver Clarifications) —, el servicio DEBE continuar evaluando completitud
  con ese último padrón válido, dejando constancia en el log de que opera
  con un padrón potencialmente desactualizado y de su fecha y hora de
  obtención; al recuperarse la fuente, DEBE volver a usar el padrón
  fresco.
- **FR-009**: Toda consulta del padrón DEBE tener un tiempo máximo de
  espera configurable; una consulta que lo exceda se trata como fuente no
  disponible y NO DEBE bloquear el ciclo de sondeo del reloj.
- **FR-010**: Cada consulta del padrón DEBE registrarse de forma
  estructurada (resultado, cantidad de legajos obtenidos, duración, si se
  usó padrón cacheado), sin exponer credenciales ni cadenas de conexión
  (Constitución, Principio V).
- **FR-011**: Un padrón vacío (0 legajos) devuelto como respuesta exitosa
  DEBE tratarse como fuente no disponible a efectos de completitud:
  ningún momento esperado se cierra por completitud con un universo
  vacío; se aplica FR-008 (último padrón válido) o FR-007 (error), la
  obtención del padrón del día se considera pendiente (se reintenta en
  ciclos siguientes, FR-014), y la anomalía queda registrada en el log.
- **FR-012**: El servicio DEBE normalizar el padrón recibido: deduplicar
  legajos repetidos y descartar valores no interpretables como legajo,
  dejando constancia en el log de cada descarte, sin invalidar el padrón
  completo por registros defectuosos aislados.
- **FR-013**: El adapter de archivo local de la feature 002 DEBE seguir
  disponible como alternativa explícita de configuración (desarrollo y
  pruebas sin acceso a RRHH); la selección del origen del padrón
  (RRHH o archivo local) DEBE ser una decisión de configuración, no de
  código.
- **FR-014**: El servicio DEBE consultar la fuente de RRHH una sola vez
  por día de servicio: en el primer ciclo de sondeo del día. Si esa
  obtención falla, DEBE reintentarla en los ciclos siguientes hasta
  lograrla (aplicando FR-007/FR-008 mientras tanto); una vez obtenido el
  padrón del día con éxito, NO DEBE volver a consultar la fuente hasta el
  día siguiente.

### Key Entities *(include if feature involves data)*

- **Empleado activo**: persona con relación laboral vigente según RRHH,
  identificada por su legajo (mismo identificador numérico que ya usan las
  fichadas del reloj). Esta feature solo necesita el legajo; cualquier
  otro dato personal del empleado queda fuera de alcance (minimización de
  datos, Principio V).
- **Padrón (snapshot)**: conjunto de legajos activos obtenido de la fuente
  en un momento dado, con su marca de tiempo de obtención y su origen
  (consulta fresca o último padrón válido del día reutilizado ante una
  falla). Es el universo contra el que se evalúa la completitud de cada
  momento esperado.
- **Fuente RRHH**: sistema externo de la empresa (base de datos de RRHH)
  que posee la verdad sobre qué empleados están activos, expuesta como una
  vista (o consulta preparada) de solo lectura provista por RRHH/DBA que
  ya devuelve los legajos activos — el criterio de actividad vive del lado
  de RRHH, no de este servicio (ver Clarifications). Se accede únicamente
  a través de la capa de repositorio dedicada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100% de los días con la fuente de RRHH disponible, la
  completitud de los momentos esperados se evalúa contra el padrón real
  vigente, sin que nadie edite manualmente un archivo de padrón.
- **SC-002**: Una revisión del repositorio y de los logs generados no
  encuentra ninguna credencial ni cadena de conexión completa (0
  ocurrencias) — verificable por auditoría automatizada.
- **SC-003**: Ante una indisponibilidad de la fuente de RRHH posterior a
  una obtención exitosa previa, el servicio continúa operando sin
  intervención manual y sin cerrar ningún momento esperado con un padrón
  asumido; el 100% de esos ciclos queda registrado con su condición
  degradada.
- **SC-004**: La obtención del padrón para una plantilla de hasta 500
  legajos completa en menos de 5 segundos en condiciones normales, sin
  afectar la cadencia de 5 minutos del sondeo del reloj.
- **SC-005**: El reemplazo del origen del padrón no altera ningún otro
  comportamiento observable del servicio: la suite de verificación
  existente de la feature 002 sigue pasando sin modificaciones de
  comportamiento (solo cambios de configuración/inyección del proveedor).
- **SC-006**: Con configuración incompleta, el servicio falla al arrancar
  con un mensaje accionable en el 100% de los casos, en vez de arrancar y
  fallar silenciosamente ciclo a ciclo.

## Assumptions

- La base de datos de RRHH de la empresa (Oracle) es accesible por red
  desde el host donde corre el servicio. El criterio de "empleado activo"
  es responsabilidad de RRHH: RRHH/DBA provee una vista (o consulta
  preparada) de solo lectura que ya devuelve los legajos activos (ver
  Clarifications, sesión 2026-07-08); este servicio la consume tal cual,
  sin conocer ni mantener el criterio. El nombre concreto de esa vista y
  su forma exacta se acuerdan con RRHH/DBA durante `/speckit-plan`.
- Esta dependencia es de solo lectura sobre el padrón. La escritura de
  fichadas a Oracle (sincronización de asistencias) sigue fuera de alcance,
  igual que en las features 001 y 002.
- El contrato del proveedor de empleados activos definido en la feature
  002 (`roster-provider-contract.md`) se mantiene sin cambios; si el
  diseño detecta que necesita extenderse, eso se resuelve en
  `/speckit-plan` sin romper al consumidor existente.
- El padrón cambia con baja frecuencia (altas/bajas administrativas), por
  lo que consultarlo una sola vez por día de servicio (FR-014, ver
  Clarifications) es suficiente; el riesgo aceptado es que un cambio del
  mismo día se refleje recién al día siguiente.
- El último padrón válido obtenido sirve como respaldo ante fallas de la
  fuente aunque provenga de un día anterior (ver Clarifications, sesión
  2026-07-08): el riesgo aceptado es que un alta o baja reciente se
  refleje tarde mientras dure la indisponibilidad, siempre con constancia
  en el log de la antigüedad del padrón usado. El respaldo vive solo en
  memoria de proceso: un reinicio del servicio lo descarta (no hay
  persistencia, igual que en la feature 002).
- El volumen esperado del padrón es de decenas a algunos cientos de
  legajos (misma escala asumida en la feature 002), no miles.
- La tecnología concreta de conexión a la base (driver, librería) es una
  decisión de diseño para `/speckit-plan`, sujeta a la política del
  proyecto de justificar toda dependencia nueva.
- El entorno de despliegue permite definir variables de entorno por
  proceso (mismo esquema que ya usa el proyecto para configuración).
