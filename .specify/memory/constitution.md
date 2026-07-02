<!--
Sync Impact Report
==================
Version change: TEMPLATE → 1.0.0 (initial ratification)
Modified principles: N/A (first fill of template placeholders)
Added sections:
  - I. Arquitectura Frontend basada en Componentes (React)
  - II. Repositorio de Datos Oracle Aislado
  - III. Protocolo del Reloj Biométrico Prosoft RS956 Documentado y Aislado (NON-NEGOTIABLE)
  - IV. Test-First en Capas Críticas (Protocolo y Datos)
  - V. Observabilidad y Protección de Datos Sensibles
  - Stack Tecnológico y Restricciones
  - Flujo de Desarrollo y Revisión
  - Governance
Removed sections: none (placeholders only)
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no change needed (Constitution Check gate is derived dynamically from this file)
  - .specify/templates/spec-template.md ✅ no change needed (no constitution-specific references)
  - .specify/templates/tasks-template.md ✅ no change needed (no constitution-specific references)
  - .specify/templates/checklist-template.md ✅ no change needed (no constitution-specific references)
Follow-up TODOs:
  - TODO(RATIFICATION_DATE): confirmed as the date this initial constitution was authored (2026-07-02); update if the team designates an earlier formal adoption date.
-->

# RS956 Fichaje Constitution

## Core Principles

### I. Arquitectura Frontend basada en Componentes (React)
Toda interfaz de usuario se construye como componentes funcionales de React con
hooks. Los componentes de presentación (UI pura) se mantienen separados de la
lógica de negocio y del acceso a datos/estado; el estado que se comparte entre
pantallas se gestiona de forma centralizada (context/store), no mediante prop
drilling extenso. Ningún componente de UI llama directamente a Oracle DB ni al
driver del reloj biométrico: siempre pasa por servicios/API intermedios.

**Rationale**: separar presentación de lógica de negocio y de integración es lo
que permite testear, reemplazar o escalar cada capa (UI, servicios, drivers)
sin que un cambio en una rompa las otras.

### II. Repositorio de Datos Oracle Aislado
Todo acceso a la base de datos Oracle (consulta de fichajes, personal, etc.)
DEBE pasar por una capa de repositorio/DAO dedicada. Ninguna sentencia SQL
cruda se escribe fuera de esa capa. Las credenciales y cadenas de conexión se
gestionan vía variables de entorno o un gestor de secretos; nunca se
hardcodean ni se versionan en el repositorio. El acceso se otorga con el
mínimo privilegio necesario (solo lectura salvo que una operación requiera
escritura explícita).

**Rationale**: aislar el acceso a datos permite testear con mocks, auditar
qué se consulta contra el sistema de la empresa, y evita fugas de
credenciales o SQL disperso y difícil de mantener.

### III. Protocolo del Reloj Biométrico Prosoft RS956 Documentado y Aislado (NON-NEGOTIABLE)
Dado que el fabricante no provee documentación ni conexión directa, el
protocolo de comunicación con el reloj biométrico Prosoft RS956 fue (y sigue
siendo) inferido observando tráfico real. Como consecuencia:
- Toda esta lógica DEBE vivir en un módulo adaptador/driver dedicado,
  completamente aislado del resto del sistema; ningún detalle del protocolo
  (framing, comandos, códigos de error) se filtra hacia la UI o la capa de
  negocio.
- Cada campo, comando o estructura inferida DEBE documentarse en el propio
  repositorio (formato, offsets, ejemplos de tráfico capturado que lo
  respaldan).
- Las capturas de tráfico que sustentan el protocolo se conservan como
  fixtures versionados; no se descartan sin dejar constancia del motivo.
- Un cambio de firmware o modelo del dispositivo exige re-validar el
  protocolo contra tráfico real actualizado antes de confiar en el driver.

**Rationale**: un protocolo reverse-engineered es inherentemente frágil y no
tiene garantía de estabilidad del fabricante. Aislarlo y documentarlo evita
que un cambio del dispositivo rompa toda la aplicación y preserva el
conocimiento adquirido para el equipo, en vez de que viva solo en la memoria
de quien lo investigó.

### IV. Test-First en Capas Críticas (Protocolo y Datos)
Antes de implementar el parser/driver del protocolo RS956 o cualquier
método del repositorio Oracle, se DEBEN escribir tests (unitarios y de
contrato) usando capturas de tráfico real o fixtures de datos como base;
ciclo Red-Green-Refactor obligatorio en estas dos capas. La UI puede seguir
un enfoque de testing más flexible, pero los flujos de fichaje (marcado de
entrada/salida y su reflejo en Oracle) DEBEN tener cobertura end-to-end.

**Rationale**: dada la fragilidad del protocolo inferido y el impacto de los
datos de asistencia sobre nómina y cumplimiento legal, un error silencioso en
estas capas es inaceptable; el testing debe detectar regresiones antes de que
lleguen a producción.

### V. Observabilidad y Protección de Datos Sensibles
Toda operación de lectura/escritura de fichajes y toda comunicación con el
reloj biométrico DEBEN loguearse de forma estructurada (correlacionable por
dispositivo, empleado y timestamp) para poder diagnosticar fallos de un
protocolo no documentado oficialmente. Los logs NUNCA exponen datos
biométricos crudos (templates de huella, imágenes) ni credenciales de Oracle
o del dispositivo. Los datos personales y biométricos se tratan bajo
principios de minimización (solo se persiste lo necesario) y almacenamiento
seguro.

**Rationale**: los datos biométricos son sensibles y pueden tener alcance
legal/regulatorio; a la vez, el protocolo no documentado exige trazabilidad
suficiente para depurar fallos sin comprometer la privacidad de las personas.

## Stack Tecnológico y Restricciones

- **Frontend**: JavaScript con React.
- **Integración con hardware**: capa intermedia (servicio backend) responsable
  de hablar el protocolo propietario del RS956 y exponer una API estable
  hacia el frontend; el frontend nunca abre la conexión al reloj
  directamente.
- **Persistencia**: Oracle DB existente de la empresa como repositorio de
  fichajes de personal, accedida exclusivamente a través de la capa de
  repositorio (Principio II).
- **Versionado del protocolo**: el adaptador del RS956 y sus fixtures de
  tráfico se versionan junto con el código; cualquier cambio de
  interpretación del protocolo se documenta en un changelog propio del
  módulo adaptador.

## Flujo de Desarrollo y Revisión

- Toda PR que modifique el adaptador del protocolo RS956 requiere revisión de
  al menos una persona familiarizada con la documentación del protocolo
  existente.
- Toda PR que modifique la capa de repositorio Oracle requiere verificar que
  no haya SQL fuera de esa capa ni credenciales hardcodeadas.
- Nuevas capturas de tráfico usadas para ampliar o corregir el protocolo se
  agregan como fixtures versionados junto con los tests que las ejercitan.
- Los flujos críticos (marcado de fichaje, sincronización con Oracle) no se
  mergean sin la cobertura de test exigida por el Principio IV.

## Governance

Esta constitución prevalece sobre cualquier otra práctica, convención o
documentación en conflicto dentro del proyecto. Las enmiendas requieren:
documentar el cambio propuesto, justificar el motivo, incrementar la versión
según semver (MAJOR: incompatibilidad o eliminación de principios; MINOR:
principio o sección nueva o expansión material de guía existente; PATCH:
aclaraciones o correcciones no semánticas), y propagar el impacto a las
plantillas dependientes (`plan-template.md`, `spec-template.md`,
`tasks-template.md`, `checklist-template.md`) cuando corresponda.

Toda PR y toda revisión de código DEBEN verificar el cumplimiento de estos
principios. Cualquier complejidad que los viole debe justificarse
explícitamente (ver `Complexity Tracking` en el plan) o rechazarse. La guía
operativa de desarrollo en tiempo de ejecución (si existe un `README.md` o
`CLAUDE.md` en el repositorio) debe mantenerse alineada con estos principios.

**Version**: 1.0.0 | **Ratified**: 2026-07-02 | **Last Amended**: 2026-07-02
