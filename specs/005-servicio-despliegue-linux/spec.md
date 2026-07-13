# Feature Specification: Servicio de Fichadas — Persistencia y Despliegue Desatendido en Linux

**Feature Branch**: `005-servicio-despliegue-linux`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Desplegar y operar el servicio-fichadas-programado (feature 002) en un servidor Linux como daemon persistente: (1) persistir las fichadas obtenidas para que las consuma calcular-presentismo (feature 004), en el mismo archivo acumulativo por período, deduplicadas por rawHex; (2) leer el padrón de empleados activos desde el snapshot local de la feature 004 además del formato legacy, sin depender de Oracle en runtime; (3) operar de forma confiable día tras día con reinicio diario; (4) desplegarse como servicio de sistema en Linux (systemd) con arranque al boot, apagado limpio y reinicio ante fallo, con una guía reproducible. Alcance: despliegue + persistencia + lectura del snapshot como padrón. NO incluye interfaz de usuario."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Las fichadas recolectadas quedan disponibles para el cálculo de presentismo (Priority: P1)

Como responsable de liquidación, quiero que las fichadas que el servicio recolecta del
reloj queden guardadas de forma durable en el mismo lugar del que el cálculo de
presentismo las toma, para poder calcular las horas del período sin ningún paso manual de
importación y sin perder marcaciones si el servicio se reinicia.

**Why this priority**: es el valor central de esta feature. Hoy el servicio recolecta las
fichadas pero las mantiene solo en memoria: se pierden al reiniciar y el cálculo de
presentismo no las ve. Sin persistencia durable, correr el servicio no aporta datos a la
liquidación.

**Independent Test**: se puede probar completo dejando que el servicio recolecte fichadas
en una ventana, verificando que quedan escritas en el almacenamiento por período, y que el
cálculo de presentismo del mismo período las refleja — todo sin ejecutar ninguna
importación manual.

**Acceptance Scenarios**:

1. **Given** el servicio corriendo dentro de una ventana de sondeo, **When** el reloj
   reporta fichadas nuevas, **Then** esas fichadas quedan persistidas en el almacenamiento
   del período correspondiente y el cálculo de presentismo de ese período las incluye.
2. **Given** fichadas ya persistidas de un período, **When** el reloj vuelve a reportar las
   mismas fichadas en un ciclo posterior, **Then** no se duplican en el almacenamiento
   (una sola vez por identidad cruda).
3. **Given** fichadas ya persistidas, **When** el servicio se reinicia, **Then** las
   fichadas persistidas siguen disponibles (no se pierden) y no se re-cuentan al re-reportarse.
4. **Given** una fichada cuya fecha no puede determinarse, **When** el servicio la
   recolecta, **Then** se persiste igual (imputada a un período por su fecha de recolección)
   y nunca se descarta en silencio.
5. **Given** una falla transitoria de escritura en el almacenamiento, **When** ocurre en un
   ciclo, **Then** el ciclo lo reporta como error y las fichadas se vuelven a intentar
   persistir en el próximo ciclo, sin pérdida.

---

### User Story 2 - El servicio corre desatendido y se recupera solo (Priority: P2)

Como administrador del servidor, quiero que el servicio arranque automáticamente al
encender el servidor, se reinicie solo si se cae y se apague de forma limpia en una
actualización o reinicio, para no tener que supervisarlo manualmente ni perder datos en
una parada.

**Why this priority**: convierte un proceso de desarrollo en un servicio de producción
confiable. Sin esto, cualquier reinicio del servidor o caída deja de recolectar fichadas
hasta que alguien lo note.

**Independent Test**: se puede probar reiniciando el servidor y verificando que el servicio
queda activo sin intervención; deteniéndolo con una señal de terminación y verificando que
no corta abruptamente una consulta en curso; y provocando una caída y verificando que se
reinicia solo.

**Acceptance Scenarios**:

1. **Given** el servidor recién iniciado, **When** el sistema termina de arrancar, **Then**
   el servicio queda activo sin intervención manual.
2. **Given** el servicio en ejecución, **When** recibe una señal de terminación, **Then** se
   detiene de forma limpia, permitiendo que una consulta en curso termine por sí sola.
3. **Given** el servicio en ejecución, **When** el proceso termina de forma inesperada,
   **Then** el sistema lo reinicia automáticamente.
4. **Given** un servidor nuevo, **When** un operador sigue la guía de despliegue, **Then**
   puede dejar el servicio corriendo de forma reproducible sin conocer el código.

---

### User Story 3 - El servicio opera de forma confiable día tras día (Priority: P2)

Como responsable de liquidación, quiero que el servicio recolecte fichadas en las ventanas
de entrada y salida de cada día, no solo del primer día que arrancó, para que la asistencia
quede registrada de manera continua sin que alguien tenga que reiniciarlo a mano cada
jornada.

**Why this priority**: el servicio, tal como está, sirve un solo día (los checkpoints no se
reinician al cambiar de fecha). Sin continuidad multi-día, la recolección se detiene en
silencio después del primer cierre.

**Independent Test**: se puede probar dejando (o simulando) el paso de varios días y
verificando que el servicio vuelve a consultar el reloj en las ventanas de cada día, y que
el mecanismo de continuidad no pierde las fichadas ya persistidas.

**Acceptance Scenarios**:

1. **Given** el servicio que ya cerró las ventanas de un día, **When** empieza un nuevo día
   calendario, **Then** vuelve a consultar el reloj en las ventanas de entrada y salida del
   nuevo día.
2. **Given** el mecanismo de continuidad diaria, **When** se aplica, **Then** las fichadas
   ya persistidas del período no se pierden ni se duplican.

---

### User Story 4 - El padrón sale del snapshot local, sin depender de Oracle en runtime (Priority: P3)

Como administrador, quiero que el servicio determine los empleados activos a partir del
snapshot local del padrón (el que ya produce el sistema de presentismo), sin abrir una
conexión a la base corporativa cada día, para reducir la dependencia operativa y poder
correr el servicio aunque la base no sea alcanzable desde el servidor.

**Why this priority**: es una mejora operativa. El cierre por completitud de un checkpoint
(todos los activos ya ficharon) necesita la lista de activos, pero traerla en vivo de
Oracle agrega una dependencia de red y credenciales en runtime que el snapshot local evita.

**Independent Test**: se puede probar configurando el servicio para leer el snapshot local
y verificando que resuelve los legajos activos y opera sin ninguna conexión a la base; y que
un snapshot ausente o con formato inesperado se reporta como padrón no disponible sin frenar
el servicio.

**Acceptance Scenarios**:

1. **Given** un snapshot local del padrón disponible, **When** el servicio arranca en modo
   archivo apuntando a ese snapshot, **Then** resuelve la lista de empleados activos y opera
   sin conexión a la base corporativa.
2. **Given** el formato legacy del padrón local, **When** el servicio lo lee, **Then** sigue
   funcionando igual que antes (compatibilidad hacia atrás).
3. **Given** un snapshot ausente, ilegible o sin legajos válidos, **When** el servicio lo
   consulta, **Then** lo reporta como padrón no disponible en el ciclo, sin frenar el
   servicio ni asumir un padrón vacío.

---

### Edge Cases

- **Falla de escritura persistente**: si el almacenamiento no es escribible en un ciclo
  (permisos, disco lleno), el ciclo se reporta como error y se reintenta la persistencia en
  el próximo ciclo; no se pierden fichadas (el reloj las sigue reportando como pendientes).
- **Fichada duplicada entre reinicios**: tras un reinicio, el reloj vuelve a reportar las
  fichadas pendientes; la deduplicación por identidad cruda evita contarlas o guardarlas dos
  veces contra lo ya persistido.
- **Fichada sin fecha determinable**: se persiste imputada a un período por su fecha de
  recolección, nunca se descarta en silencio.
- **Reinicio a mitad del día**: las fichadas ya persistidas siguen en el almacenamiento; el
  estado en memoria (progreso de checkpoints) se recomputa desde el reloj en el arranque.
- **Reloj inalcanzable**: el ciclo se registra como error y el servicio sigue reintentando
  en el próximo tick, sin caerse.
- **Snapshot del padrón desactualizado**: el snapshot es una foto; si cambia el padrón
  activo, se refresca por fuera del servicio (feature 004). Un snapshot viejo no rompe el
  servicio; puede afectar solo la evaluación de completitud de checkpoints.
- **Servidor sin acceso a la base corporativa**: en modo archivo/snapshot el servicio opera
  sin esa conexión; solo el paso puntual de generar/refrescar el snapshot la requiere.

## Requirements *(mandatory)*

### Functional Requirements

#### Persistencia de fichadas (durable, compartida con presentismo)

- **FR-001**: El servicio DEBE persistir en almacenamiento durable cada fichada nueva que
  obtiene del reloj, en el **mismo almacenamiento por período** que consume el cálculo de
  presentismo, de modo que las fichadas queden disponibles para el cálculo sin ningún paso
  manual de importación.
- **FR-002**: Las fichadas persistidas DEBEN deduplicarse por su identidad cruda: una misma
  fichada NO DEBE aparecer más de una vez, aunque el reloj la reporte en ciclos sucesivos o
  el servicio se reinicie.
- **FR-003**: La persistencia DEBE conservar el registro técnico crudo de cada fichada
  (para trazabilidad), que NO DEBE aparecer en los logs correlacionables del servicio ni
  propagarse al detalle del dominio de cálculo (Principio V).
- **FR-004**: Una falla transitoria de persistencia en un ciclo NO DEBE perder fichadas: el
  servicio DEBE reintentar la persistencia en el próximo ciclo y reportar el problema.
- **FR-005**: Las fichadas cuya fecha no pueda determinarse DEBEN persistirse igual,
  imputadas a un período por su fecha de recolección; nunca se descartan en silencio.
- **FR-006**: Un reinicio del servicio (manual, por fallo o por rollover diario) NO DEBE
  perder las fichadas ya persistidas.

#### Operación desatendida como servicio de sistema

- **FR-007**: El servicio DEBE poder configurarse para arrancar automáticamente al iniciar
  el servidor.
- **FR-008**: El servicio DEBE reiniciarse automáticamente ante una terminación inesperada
  del proceso.
- **FR-009**: El servicio DEBE detenerse de forma limpia ante una señal de terminación,
  permitiendo que una consulta al reloj en curso termine por sí sola antes de salir.
- **FR-010**: DEBE existir una guía de despliegue reproducible que permita a un operador,
  sin conocimiento del código, dejar el servicio corriendo: prerrequisitos, provisión de
  configuración y secretos, e instalación del servicio de sistema.

#### Continuidad multi-día

- **FR-011**: El servicio DEBE recolectar fichadas en las ventanas de sondeo de **cada día
  calendario**, no solo el primero: DEBE existir un mecanismo de continuidad diaria que
  reinicie el ciclo de checkpoints antes de la ventana de entrada de cada día.
- **FR-012**: El mecanismo de continuidad diaria NO DEBE perder las fichadas ya persistidas
  ni duplicarlas.

#### Padrón de empleados activos desde el snapshot local

- **FR-013**: El servicio DEBE poder leer el padrón de empleados activos desde el **snapshot
  local** del sistema de presentismo, además del formato de padrón local previo (legacy);
  la fuente se elige por configuración.
- **FR-014**: Cuando usa el snapshot local, el servicio NO DEBE requerir una conexión a la
  base corporativa en runtime.
- **FR-015**: Un snapshot ausente, ilegible o sin legajos válidos DEBE reportarse como
  padrón no disponible en el ciclo afectado, sin frenar el servicio ni asumir un padrón
  vacío.

#### Trazabilidad y protección de datos

- **FR-016**: Ni la persistencia de fichadas ni los logs DEBEN exponer credenciales; los
  logs correlacionables del servicio NUNCA DEBEN contener el registro crudo de la fichada
  (Principio V). El almacenamiento durable de fichadas SÍ conserva ese registro crudo como
  dato técnico de trazabilidad (no es dato biométrico), fuera de los logs.

### Key Entities *(include if feature involves data)*

- **Fichada recolectada**: una marcación decodificada del reloj (legajo, fecha, hora,
  método, registro crudo). El servicio la consume del protocolo (features 001/002), no la
  redefine.
- **Almacenamiento durable de fichadas por período**: el archivo/almacén por período que
  usa el cálculo de presentismo (feature 004) como fuente de fichadas. Esta feature convierte
  al servicio en su **productor en vivo**; el consumidor es el cálculo de presentismo.
- **Snapshot del padrón**: copia local de los empleados activos (con su legajo) producida
  por el sistema de presentismo, usada por el servicio como fuente del padrón sin conexión a
  la base.
- **Unidad de servicio del sistema**: la definición que hace que el proceso corra
  desatendido (arranque al boot, reinicio ante fallo, apagado limpio) y el mecanismo de
  reinicio diario.
- **Ciclo de sondeo / checkpoint**: el mecanismo de la feature 002 que abre ventanas de
  entrada/salida y consulta el reloj; esta feature le agrega continuidad multi-día.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las fichadas que el servicio obtiene dentro de un período quedan
  disponibles para el cálculo de presentismo sin ningún paso manual de importación.
- **SC-002**: Reiniciar el servicio no reduce la cantidad de fichadas persistidas del
  período: 0 pérdidas sobre el conjunto de pruebas.
- **SC-003**: Las fichadas que el reloj repite en ciclos sucesivos o tras un reinicio
  aparecen una sola vez en el almacenamiento durable (deduplicación 100%).
- **SC-004**: Tras un reinicio del servidor, el servicio queda activo automáticamente sin
  intervención manual.
- **SC-005**: El servicio consulta el reloj en las ventanas de al menos dos días
  calendario consecutivos sin intervención manual (continuidad multi-día).
- **SC-006**: Un operador sin conocimiento del código puede desplegar el servicio desde cero
  siguiendo la guía en menos de 30 minutos.
- **SC-007**: Con el snapshot local como padrón, el servicio arranca y opera sin abrir
  ninguna conexión a la base corporativa.
- **SC-008**: Sobre una corrida completa, ningún log correlacionable del servicio contiene
  el registro crudo de una fichada ni credenciales (0 ocurrencias).

## Assumptions

- **Plataforma**: el servidor destino es Linux con un gestor de servicios de sistema
  (systemd) y una versión de la runtime del proyecto compatible con las features 001–004.
- **Red**: el servidor tiene alcance de red al reloj en su puerto; el acceso a la base
  corporativa solo se necesita para el paso puntual de generar/refrescar el snapshot del
  padrón, no en runtime.
- **Origen de las fichadas**: el servicio consume fichadas ya decodificadas y deduplicadas
  del protocolo (features 001/002); no lee el dispositivo de forma distinta ni redefine su
  formato.
- **Almacenamiento compartido**: el almacenamiento durable de fichadas por período es el
  mismo que ya define y consume el cálculo de presentismo (feature 004); esta feature no
  crea un formato nuevo, se enchufa al existente.
- **Snapshot del padrón**: lo genera y refresca el sistema de presentismo (feature 004,
  `sincronizar-padron`) por fuera del servicio; esta feature solo lo consume.
- **Reinicio diario**: la continuidad multi-día se resuelve reiniciando el servicio una vez
  por día antes de la ventana de entrada (por defecto, alrededor de las 06:00); el reinicio
  es seguro porque las fichadas ya están persistidas.
- **Sin interfaz de usuario**: esta feature es operación y persistencia; la visualización y
  edición se especifican por separado.
- **Identidad cruda como clave de deduplicación**: la deduplicación usa el registro crudo de
  la fichada como identidad, igual que en las features 001/002/004.
