# Feature Specification: Página de Configuración

**Feature Branch**: `014-pagina-config`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Pagina-Config. hacer configurable dinamicamente ciertos parametros del archivo .env. ej IP PORT del reloj, ademas editar parametros de config/categorias.json y config/motivos-ausencia.json"

## Clarifications

### Session 2026-07-22

- Q: ¿Se debe permitir eliminar una categoría completa desde esta página (no solo
  bloquear la eliminación de una modalidad en uso)? → A: No permitir eliminar
  categorías desde esta página; solo se pueden agregar y editar (incluida la
  modalidad asignada). Retirar una categoría por completo queda fuera de
  alcance de esta feature.
- Q: `config/categorias.json` también tiene `esquemaSemanal` (lista de días
  laborales compartida por todas las modalidades) — ¿debe ser editable desde
  esta página? → A: Sí, editable, por extensibilidad (queda dentro del mismo
  alcance que el resto de `categorias.json`).
- Q: ¿Los cambios de configuración (reloj, motivos, categorías/modalidades,
  esquema semanal) deben quedar registrados en un log de auditoría? → A: No,
  esta feature no registra auditoría de estos cambios (se puede evaluar más
  adelante, junto con una eventual autenticación de usuarios).
- Q: Una vez creada una categoría (por ejemplo `ADMIN`, `PROD`), ¿su código se
  puede renombrar, o queda fijo (solo se edita la modalidad asignada)? → A: El
  código queda fijo una vez creada la categoría; solo se edita la modalidad
  asignada, igual que el identificador de un motivo de ausencia.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar la conexión al reloj sin editar archivos a mano (Priority: P1)

Como responsable de operar el sistema, quiero ver y modificar la IP y el puerto del
reloj biométrico (y demás parámetros de conexión/sondeo del servicio de fichadas)
desde una pantalla de la aplicación, para no tener que editar el archivo `.env` a
mano ni depender de acceso directo al servidor cada vez que el reloj cambia de
dirección o se ajusta un tiempo de espera.

**Why this priority**: es el caso concreto que motiva la feature — hoy un cambio de
IP del reloj (reemplazo de equipo, cambio de red) requiere edición manual de
archivos y reinicio del servicio por alguien con acceso al entorno. Sin esta
capacidad, cualquier otra mejora a la página de configuración carece de la
funcionalidad que le da nombre.

**Independent Test**: se puede probar completo entrando a la página de
Configuración, cambiando la IP y el puerto del reloj, guardando, y verificando
que el nuevo valor persiste (se refleja al recargar la página y al reiniciar el
servicio de fichadas), sin tocar categorías ni motivos de ausencia.

**Acceptance Scenarios**:

1. **Given** la página de Configuración muestra la IP y el puerto actuales del
   reloj, **When** el usuario ingresa una IP y un puerto válidos y guarda,
   **Then** el sistema persiste los nuevos valores y confirma el guardado.
2. **Given** el usuario ingresó una IP con formato inválido o un puerto fuera del
   rango permitido (1-65535), **When** intenta guardar, **Then** el sistema
   rechaza el guardado y señala qué campo es inválido, sin persistir el cambio.
3. **Given** el usuario cambió la IP/puerto del reloj, **When** guarda el cambio,
   **Then** la página indica claramente que el servicio de fichadas debe
   reiniciarse para que el nuevo valor tenga efecto (el cambio no se aplica en
   caliente a un proceso ya en ejecución).
4. **Given** el usuario quiere confirmar que una IP/puerto nuevos son correctos
   antes de guardar, **When** usa la opción de probar la conexión, **Then** el
   sistema informa si logra o no comunicarse con el reloj en esa dirección,
   sin persistir el cambio todavía.

---

### User Story 2 - Editar el catálogo de motivos de ausencia (Priority: P2)

Como responsable de administración de personal, quiero agregar, editar o dar de
baja motivos de ausencia (los que se ofrecen al justificar una falta) desde la
aplicación, para adaptar el catálogo a la política vigente sin depender de que
alguien edite `config/motivos-ausencia.json` a mano.

**Why this priority**: da valor independiente (la política de motivos de ausencia
cambia con menor frecuencia que la IP del reloj, pero sigue siendo una edición
manual de archivo hoy) y no depende de la Historia 1.

**Independent Test**: se puede probar completo agregando un motivo nuevo, editando
la etiqueta o el tipo de pago de uno existente, y desactivando uno que ya no se
use, y verificando que el selector de motivos de la página de Justificación de
Ausencias (spec 012) refleja esos cambios.

**Acceptance Scenarios**:

1. **Given** el catálogo de motivos actual, **When** el usuario agrega un motivo
   nuevo con etiqueta y tipo de pago, **Then** el motivo queda disponible (activo)
   en el catálogo y en el selector de Justificación de Ausencias.
2. **Given** un motivo existente, **When** el usuario edita su etiqueta o su tipo
   de pago, **Then** el cambio se refleja en el catálogo sin alterar el
   identificador del motivo.
3. **Given** un motivo que ya no debe ofrecerse, **When** el usuario lo desactiva,
   **Then** deja de aparecer como opción para nuevas justificaciones, pero las
   justificaciones ya registradas con ese motivo conservan su información
   histórica sin cambios.
4. **Given** el usuario intenta crear un motivo con un identificador que ya existe,
   **When** guarda, **Then** el sistema rechaza el guardado y señala el
   duplicado.

---

### User Story 3 - Editar categorías y modalidades horarias (Priority: P3)

Como responsable de administración de personal, quiero agregar o editar
categorías de empleados, las modalidades horarias (apertura/cierre oficial,
márgenes, ventanas) que se les asignan, y el esquema semanal de días laborales
compartido por todas las modalidades, desde la aplicación, para dar de alta una
categoría nueva o ajustar un horario sin editar `config/categorias.json` a mano.

**Why this priority**: valor real pero de menor frecuencia de uso que las
Historias 1 y 2 (los horarios oficiales cambian con poca frecuencia); depende de
que exista la misma pantalla de Configuración que las historias anteriores.

**Independent Test**: se puede probar completo agregando una modalidad horaria
nueva, asignándosela a una categoría (nueva o existente), y verificando que el
cálculo de presentismo de esa categoría usa el horario recién definido. No
incluye eliminar categorías (ver Clarifications).

**Acceptance Scenarios**:

1. **Given** el catálogo de modalidades actual, **When** el usuario define una
   modalidad nueva con sus horarios oficiales, márgenes y ventanas, **Then**
   queda disponible para asignar a categorías.
2. **Given** una categoría existente, **When** el usuario le cambia la modalidad
   asignada, **Then** el cambio se refleja en los próximos cálculos de
   presentismo de esa categoría.
3. **Given** el usuario intenta eliminar una modalidad que sigue asignada a al
   menos una categoría, **When** confirma la eliminación, **Then** el sistema la
   rechaza y le indica qué categorías la usan.
4. **Given** el usuario ingresa un horario con formato inválido (hora fuera de
   `00:00`-`23:59`) o una ventana donde el cierre es anterior a la apertura,
   **When** intenta guardar, **Then** el sistema rechaza el guardado y señala el
   campo inválido.
5. **Given** el esquema semanal de días laborales actual, **When** el usuario
   modifica qué días de la semana se consideran laborales, **Then** el cambio
   se persiste y rige para todas las modalidades por igual (es un único
   esquema compartido, no uno por modalidad).
6. **Given** el usuario intenta guardar un esquema semanal vacío o con un día
   repetido, **When** guarda, **Then** el sistema rechaza el guardado y señala
   el error.

---

### User Story 4 - Editar el resto de los parámetros operativos del servicio de fichadas (Priority: P4)

Como responsable de operar el sistema, quiero ajustar desde la misma página los
demás parámetros operativos hoy definidos en `.env` (tiempos de espera,
frecuencia de sondeo, checkpoint de entrada esperado, uso del handshake
completo), para afinar el comportamiento del servicio sin editar el archivo a
mano.

**Why this priority**: menor prioridad porque son ajustes finos que rara vez
cambian una vez calibrados; el valor principal de la feature ya está cubierto por
la Historia 1.

**Independent Test**: se puede probar completo cambiando el tiempo de espera de
consulta al reloj y la hora/duración del checkpoint de entrada, guardando, y
verificando que los nuevos valores persisten y quedan reflejados en la página.

**Acceptance Scenarios**:

1. **Given** los parámetros operativos actuales del servicio de fichadas, **When**
   el usuario edita un valor (por ejemplo, el tiempo de espera de consulta) dentro
   de su rango válido, **Then** el sistema lo persiste y confirma el guardado.
2. **Given** el usuario ingresa un valor fuera de rango (por ejemplo, un tiempo de
   espera negativo o cero), **When** intenta guardar, **Then** el sistema rechaza
   el guardado y señala el campo inválido.

---

### Edge Cases

- ¿Qué pasa si dos personas editan la Configuración al mismo tiempo? El sistema no
  ofrece bloqueo de edición concurrente; la última operación de guardado exitosa
  es la que queda vigente (no se combinan cambios parciales de ediciones
  simultáneas).
- ¿Qué pasa si el archivo de configuración (`.env`, `categorias.json` o
  `motivos-ausencia.json`) no se puede escribir en disco al momento de guardar
  (permisos, disco lleno)? El sistema informa el error al usuario y no deja el
  archivo en un estado parcialmente escrito ni pierde el valor anterior.
- ¿Qué pasa si el usuario recarga la página de Configuración mientras el servicio
  de fichadas todavía corre con los valores viejos (porque no se reinició)? La
  página distingue el valor persistido (lo que se aplicará al próximo reinicio)
  del hecho de que el proceso en ejecución puede seguir usando el valor anterior.
- ¿Qué pasa si se intenta desactivar el único motivo de ausencia marcado como
  "Paga" o dejar el catálogo de motivos vacío? El sistema lo permite (no impone un
  motivo mínimo obligatorio), ya que la validez del catálogo es una decisión de
  negocio, no una restricción técnica.
- ¿Qué pasa si se edita una categoría o modalidad mientras hay un período de
  presentismo abierto en curso? El cambio aplica a los cálculos que se ejecuten
  desde ese momento en adelante; no recalcula retroactivamente días ya
  procesados del período abierto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer una página de Configuración, accesible desde
  la navegación principal junto a Calendario, Fichadas de hoy y Resumen período.
- **FR-002**: El sistema DEBE mostrar los valores actuales de los parámetros de
  conexión y sondeo del reloj biométrico (IP/host, puerto, tiempo de espera de
  consulta, frecuencia de re-consulta, frecuencia de resumen de estado, hora y
  duración del checkpoint de entrada, uso de handshake completo, puerto del
  servidor de control) y permitir editarlos.
- **FR-003**: El sistema DEBE mostrar el valor actual de la granularidad del
  Resumen del Período (mensual/quincenal) y permitir cambiarlo entre esas dos
  opciones.
- **FR-004**: El sistema DEBE validar cada parámetro editable según su tipo antes
  de guardar (IP/host no vacío, puertos enteros entre 1 y 65535, tiempos de
  espera e intervalos enteros positivos, horas en formato `HH:MM`, duración en
  minutos entera positiva, granularidad de resumen limitada a los valores
  admitidos) y rechazar el guardado completo si algún campo es inválido,
  señalando cuál.
- **FR-005**: El sistema DEBE persistir los cambios de forma durable, de modo que
  el valor guardado se mantenga tanto al recargar la página de Configuración como
  a través de reinicios futuros del servicio o proceso correspondiente.
- **FR-006**: El sistema DEBE indicarle al usuario, para los parámetros de
  conexión/sondeo del reloj, que el cambio no tiene efecto sobre un proceso ya en
  ejecución y requiere un reinicio del servicio de fichadas para aplicarse; el
  sistema no reinicia procesos por sí mismo.
- **FR-007**: El sistema DEBE ofrecer una forma de probar la conectividad con el
  reloj usando la IP/puerto ingresados antes de guardar, informando éxito o
  fallo, sin persistir el cambio como resultado de la prueba.
- **FR-008**: El sistema DEBE permitir listar, agregar y editar (etiqueta y tipo
  de pago) los motivos de ausencia del catálogo (`config/motivos-ausencia.json`).
- **FR-009**: El sistema DEBE permitir desactivar un motivo de ausencia en lugar
  de eliminarlo, de forma que deje de ofrecerse para nuevas justificaciones sin
  alterar justificaciones ya registradas con ese motivo.
- **FR-010**: El sistema DEBE impedir crear un motivo de ausencia con un
  identificador ya existente en el catálogo.
- **FR-011**: El sistema DEBE permitir listar, agregar y editar las modalidades
  horarias (`config/categorias.json`: apertura/cierre oficial, márgenes,
  ventanas de apertura y cierre) y las categorías de empleados junto con la
  modalidad que tienen asignada.
- **FR-012**: El sistema DEBE impedir eliminar una modalidad horaria que esté
  asignada a alguna categoría, indicando qué categorías la usan.
- **FR-012a**: El sistema NO DEBE ofrecer la eliminación de una categoría de
  empleado desde esta página; una categoría solo se agrega o se edita (incluida
  la modalidad que tiene asignada), nunca se borra.
- **FR-012b**: El sistema DEBE mantener fijo el código de una categoría una vez
  creada; solo su modalidad asignada es editable, no su código.
- **FR-013**: El sistema DEBE validar los horarios de una modalidad (horas en
  formato válido, cierre de ventana posterior a la apertura de esa misma ventana)
  antes de guardar.
- **FR-013a**: El sistema DEBE permitir editar el esquema semanal de días
  laborales (`config/categorias.json`: `esquemaSemanal`), compartido por todas
  las modalidades, validando que no quede vacío y que no contenga días
  repetidos antes de guardar.
- **FR-014**: El sistema NO DEBE exponer ni permitir editar credenciales o cadenas
  de conexión a Oracle (usuario, contraseña, connect string) desde la página de
  Configuración.
- **FR-015**: El sistema DEBE confirmar visualmente al usuario cuando un guardado
  se completó con éxito, y mostrar un mensaje de error específico cuando falla
  (validación o error de escritura), sin dejar la configuración persistida en un
  estado parcial.

### Key Entities

- **Parámetro de Conexión al Reloj**: agrupa host/IP, puerto, tiempo de espera de
  consulta, frecuencia de re-consulta, frecuencia de resumen de estado, hora y
  duración del checkpoint de entrada esperado, uso de handshake completo, y
  puerto del servidor de control del servicio de fichadas.
- **Motivo de Ausencia**: identificador único, etiqueta visible, tipo de pago
  (paga/no paga), y estado (activo/inactivo).
- **Modalidad Horaria**: tipo (mensual/quincenal), apertura y cierre oficial,
  márgenes de tolerancia, ventanas válidas de apertura y de cierre.
- **Categoría de Empleado**: código de categoría y modalidad horaria asignada.
- **Esquema Semanal**: lista de días de la semana considerados laborales,
  compartida por todas las modalidades horarias.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un responsable puede actualizar la IP y el puerto del reloj desde
  la aplicación, sin editar archivos a mano, en menos de 1 minuto.
- **SC-002**: El 100% de los intentos de guardar un valor inválido (formato o
  rango) son rechazados antes de persistirse, sin dejar el archivo de
  configuración correspondiente en un estado corrupto o parcial.
- **SC-003**: Agregar un motivo de ausencia nuevo o una categoría/modalidad nueva
  toma menos de 2 minutos vía la interfaz, sin requerir ningún despliegue de
  código.
- **SC-004**: Luego de esta feature, cero cambios de los parámetros cubiertos
  (conexión al reloj, catálogo de motivos, categorías y modalidades) requieren
  acceso directo al sistema de archivos del servidor.

## Assumptions

- No existe hoy un sistema de autenticación/roles en la aplicación; esta feature
  no introduce uno nuevo. La página de Configuración queda accesible a quien ya
  puede usar la aplicación, igual que el resto de las secciones existentes.
- Los parámetros de credenciales/conexión a Oracle (`RRHH_ORACLE_*`) y las rutas
  de archivos/directorios (por ejemplo `PRESENTISMO_REPO_DIR`,
  `PRESENTISMO_LOG_DIR`, `FICHADAS_LOG_DIR`, `FICHADAS_ROSTER_CONFIG`, las rutas
  de los propios archivos de configuración) quedan fuera del alcance de esta
  página: son credenciales o parámetros de despliegue, no de operación diaria.
- El servicio de fichadas y el servidor web leen su configuración al iniciar el
  proceso; esta feature no incorpora recarga en caliente de un proceso en
  ejecución ni reinicio automático de servicios — persiste el valor y notifica
  que se requiere reinicio manual para que aplique.
- "Editar" el catálogo de motivos de ausencia y el de categorías/modalidades
  incluye agregar entradas nuevas y modificar las existentes; la eliminación se
  resuelve como desactivación (motivos) o bloqueo si está en uso (modalidades),
  no como borrado destructivo, para no invalidar datos históricos.
- No se requiere recalcular retroactivamente días de un período ya procesado
  cuando cambia una modalidad u otra categoría asignada; el cambio rige hacia
  adelante.
- Esta feature no incorpora un registro de auditoría (quién/cuándo) de los
  cambios de configuración; queda fuera de alcance hasta que, si corresponde,
  se incorpore autenticación de usuarios.
