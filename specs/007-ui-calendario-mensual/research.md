# Research — IU: Calendario Mensual con Período Activo (feature 007)

Fase 0 del plan. Resuelve las decisiones técnicas y de diseño necesarias antes de definir
contratos y modelo de datos. No quedan marcadores `NEEDS CLARIFICATION` en el Technical
Context.

## Decisión 1 — Stack de frontend: React 18 + Vite + Vitest

- **Decisión**: implementar la UI con React 18 (componentes funcionales + hooks) usando
  Vite como dev server/bundler y Vitest + `@testing-library/react` para tests de
  componentes. El frontend vive en `frontend/` como workspace propio, con su `package.json`
  independiente del backend.
- **Rationale**: el Principio I de la constitución **exige** React con hooks ("Toda interfaz
  de usuario se construye como componentes funcionales de React con hooks"). React con JSX
  requiere un paso de build; Vite es el estándar de menor fricción (arranque instantáneo,
  configuración casi nula, salida estática para servir desde el backend Node). Vitest
  comparte configuración con Vite y da tests de componentes rápidos. Aislar el tooling en
  `frontend/` evita imponer un bundler al backend/CLI existente, que sigue siendo Node ESM
  puro.
- **Alternativas consideradas**:
  - *React vía CDN + Babel standalone (sin build)*: descartado — transpila en el navegador
    (lento, no apto para producción) y complica el testing.
  - *React con `React.createElement` sin JSX*: descartado — evita el build pero hace el
    código de UI verboso y difícil de mantener/revisar.
  - *Preact/htm sin build*: descartado — no es "React" según el Principio I y agrega una
    ambigüedad innecesaria al stack mandado por la constitución.

## Decisión 2 — Backend: API HTTP fina con `node:http` (sin framework)

- **Decisión**: exponer la API con el módulo incorporado `node:http` en `src/web/`, con un
  ruteo mínimo propio. Sin Express/Fastify.
- **Rationale**: el repo tiene una única dependencia runtime (`oracledb`) y evita frameworks
  pesados. La superficie de la API es diminuta (2 GET + 1 POST); `node:http` alcanza de
  sobra y mantiene el árbol de dependencias chico. El backend actúa como la "capa
  intermedia / API estable" que el Principio I pide entre la UI y los servicios.
- **Alternativas consideradas**:
  - *Express*: descartado — dependencia y peso innecesarios para 3 endpoints.
  - *Servir el frontend con Vite también en producción*: descartado — se prefiere un único
    proceso Node que sirva estáticos compilados + API, simple de desplegar (coherente con la
    feature 005 de despliegue).

## Decisión 3 — "El último mes generado": listar períodos desde el repositorio

- **Decisión**: agregar al `PresentismoRepository` un método de solo lectura
  `listarPeriodos()` que devuelva los `YYYYMM` con calendario persistido, ordenados. En el
  adaptador de archivos, se implementa escaneando `repoDir` por archivos `^\d{6}\.json$` que
  contengan un `calendario` no nulo. "El último generado" = el `max()` de esa lista
  (comparación lexicográfica de `YYYYMM`, equivalente a la numérica).
- **Rationale**: el dominio ya persiste un archivo por período; falta solo una consulta para
  enumerarlos. Poner el escaneo del filesystem en la capa de repositorio (no en el handler
  HTTP ni en la UI) respeta el aislamiento del acceso a datos (Principios II/VI). La
  clarificación de la spec fijó "último generado = `YYYYMM` más alto entre los generados",
  que se corresponde con `max()` sobre esa lista.
- **Alternativas consideradas**:
  - *Derivar "último" por fecha de modificación del archivo (mtime)*: descartado — la
    clarificación eligió explícitamente el `YYYYMM` más alto, no el más reciente por tiempo.
  - *Mantener un índice/manifiesto de períodos*: descartado por ahora — el escaneo de un
    directorio con pocos archivos es suficiente y evita un estado duplicado que mantener.

## Decisión 4 — Período de liquidación activo para la vista institucional

- **Decisión**: el "período activo" que muestra la pantalla se **deriva** del último mes
  generado como el **mes completo** (`Tramo = Mes`): etiqueta = `YYYYMM`, rango = primer y
  último día del mes. La pertenencia de un día al período activo (FR-009) se calcula con la
  función existente `periodo-liquidacion.recortar(calendario, tramo)`, que ya soporta
  `Mes`, `Q1` y `Q2`; así, si en el futuro se activa una quincena, el resaltado ya funciona.
- **Rationale**: la modalidad (Mensual/Quincenal) es un atributo **por categoría de
  empleado**, no del calendario institucional. La pantalla es institucional y común a todos
  los empleados (FR-014, y Assumptions de la spec), por lo que no hay una única modalidad que
  aplicar; el mes completo es el default institucional coherente. La spec dejó asentado que,
  de existir una noción de período activo persistida, la pantalla la consumiría; hoy no
  existe, así que se toma el mes completo del último generado.
- **Alternativas consideradas**:
  - *Elegir una modalidad "principal" para recortar a una quincena*: descartado — no hay
    base institucional para preferir una categoría; introduciría una decisión arbitraria.
  - *Persistir un "período activo" seleccionable por el operador*: fuera de alcance de esta
    feature (la spec lo menciona como posible extensión); se difiere.

## Decisión 5 — Recálculo tras reclasificar (FR-017): es derivado, no almacenado

- **Decisión**: al confirmar una reclasificación, el backend llama a
  `service.reclasificarDia(periodo, fecha, clasificacion, autor)`, que persiste el calendario
  actualizado y emite el evento `dia_reclasificado`. No hay resultados de cálculo
  almacenados que invalidar: el presentismo por empleado es **derivado y determinista**
  (research §6 de la feature 004; el propio servicio lo documenta). "Disparar el recálculo
  de los períodos afectados" se satisface porque cualquier cálculo posterior parte del
  calendario ya actualizado. La UI refleja el cambio recargando el calendario del mes.
- **Rationale**: evita introducir una caché de resultados y su invalidación. Mantiene la
  propiedad de determinismo del dominio (FR-023 de 004) y el modelo de persistencia por
  niveles (VI): el estado operativo (calendario) es la única fuente que cambia.
- **Alternativas consideradas**:
  - *Materializar/recalcular resúmenes por empleado al reclasificar*: descartado — no hay
    resúmenes persistidos en esta feature ni en 004 (se calculan on-demand); sería trabajo y
    estado sin consumidor en esta pantalla.

## Decisión 6 — Confirmación de reclasificación (FR-016) del lado del cliente

- **Decisión**: la confirmación explícita es un paso de UI (diálogo de confirmación) previo
  al `POST`. El backend solo recibe la petición cuando el usuario ya confirmó; una petición
  cancelada nunca sale del navegador, por lo que no persiste ni recalcula nada. El endpoint
  `POST` es, aun así, idempotente respecto del valor final (fijar la misma clasificación dos
  veces deja el mismo estado).
- **Rationale**: la confirmación es una salvaguarda de intención del usuario, naturalmente
  ubicada en la UI. El backend valida entradas (fecha del mes, clasificación válida) y
  delega en el dominio, que ya valida y es inmutable.
- **Alternativas consideradas**:
  - *Confirmación en dos pasos server-side (draft + commit)*: descartado — sobre-ingeniería
    para un cambio de un campo; el dominio ya es transaccional a nivel de archivo (escritura
    atómica temp+rename).

## Decisión 7 — Accesibilidad: distinción no basada solo en color (FR-004 / SC-004)

- **Decisión**: cada clasificación se distingue por **color + un segundo recurso**: una
  etiqueta/abreviatura textual visible o un ícono/patrón por celda, más `aria-label`
  descriptivo. "Hoy" se marca con un borde/anillo (forma, no solo color) y el pertenecer al
  período activo con un tratamiento estructural (p. ej. fondo/《banda》 del rango) distinto de
  la clasificación. La leyenda (FR-006) documenta todas las claves.
- **Rationale**: cumple SC-004 (interpretable en escala de grises / simulación de daltonismo)
  y las pautas WCAG de no depender solo del color. Es verificable en test de componente
  (presencia de texto/`aria-label` por celda) sin depender del render de color.
- **Alternativas consideradas**:
  - *Solo color con buen contraste*: descartado — incumple FR-004 explícitamente.

## Notas de integración

- El backend reutiliza el cableado existente (`config/categorias.json` para el esquema
  semanal y modalidades, `data/presentismo/` como `repoDir`, logger de presentismo). Se
  factoriza un `wiring.js` a partir de la lógica ya presente en
  `src/cli/calcular-presentismo.js` (resolución de `repoDir`, carga de config, creación del
  repo/servicio) para no duplicar ni divergir.
- No se toca Oracle: `listarPeriodos`, `cargarCalendario` y `reclasificarDia` operan solo
  sobre archivos JSON locales.
