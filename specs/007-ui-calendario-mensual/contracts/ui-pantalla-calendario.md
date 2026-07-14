# Contrato — Pantalla principal (UI, feature 007)

Comportamiento observable de la primera pantalla (React). Es un contrato de estados y
efectos, no de implementación. Cada regla enlaza con requisitos de la spec y es verificable
con tests de componente (Vitest + Testing Library).

## Estados de la pantalla

1. **Cargando**: al abrir, la app pide `GET /api/calendarios`; si hay `ultimo`, pide
   `GET /api/calendarios/{ultimo}`. Muestra un indicador de carga transitorio.
2. **Con calendario** (camino principal): renderiza la grilla del mes, la leyenda, el
   encabezado del período activo y (P3) la navegación. → Historias US1/US2.
3. **Vacío global** (`ultimo === null`): no hay ningún calendario generado. Muestra
   `EstadoVacio` explicando que aún no se generó ningún calendario; **no** ofrece
   reclasificar (FR-011, FR-018). → US1 escenario 5.
4. **Vacío de un mes** (GET de un mes → 404): al navegar a un mes sin generar, muestra
   `EstadoVacio` de ese mes sin error; sin acción de reclasificar (FR-011/FR-018). → US4
   escenario 3.
5. **Error de red/servidor**: mensaje de error legible con opción de reintentar; no deja la
   pantalla en blanco.

## Grilla del mes (GrillaMes / CeldaDia)

- Rejilla mensual con 7 columnas (domingo…sábado o lunes…domingo, consistente con
  `diaSemana`), ubicando cada día según `diaSemana`; huecos iniciales/finales vacíos, sin
  inventar días de meses vecinos (FR-002, edge case). → US1 escenario 1.
- Cada `CeldaDia` muestra: número de día, y su clasificación mediante **color + un segundo
  recurso** (etiqueta/abreviatura o ícono) y un `aria-label` descriptivo (FR-003, FR-004).
- **Días hábiles y feriados resaltados** respecto de los no laborables (FR-005). → US1
  escenario 3.
- El día `esHoy === true` se marca con un recurso de forma (borde/anillo), no solo color
  (FR-007). Si `vista.hoy === null`, ninguna celda se marca como hoy (edge case). → US1
  escenario 4.
- Las celdas con `enPeriodoActivo === true` se distinguen de las que no (banda/fondo del
  rango), diferenciable de la clasificación (FR-009). → US2 escenarios 2–3.

## Leyenda (Leyenda)

- Renderiza un ítem por cada `LeyendaItem` recibido: hábil, no laborable, feriado, hoy,
  período activo, con su etiqueta textual (FR-006). Garantiza que toda clave visual tenga
  significado legible (soporta SC-002/SC-003/SC-004).

## Encabezado del período activo (EncabezadoPeriodo)

- Si `periodoActivo != null`: muestra `etiqueta` y el rango `desde–hasta` (FR-008). → US2
  escenario 1.
- Si `periodoActivo == null`: indica explícitamente "sin período activo" y aun así se muestra
  la grilla (FR-010). → US2 escenario 4.

## Navegación (NavegacionMes) — P3

- Controles "mes anterior" / "mes siguiente" que cargan `GET /api/calendarios/{periodo±1}`
  (calculando el `YYYYMM` adyacente), actualizando grilla, clasificaciones y resaltado
  (FR-012). → US4 escenario 1.
- Control "volver" que regresa al mes por defecto (el `ultimo`) con un solo gesto (FR-012).
  → US4 escenario 2.
- Navegar a un mes sin calendario → estado *Vacío de un mes* (FR-011). → US4 escenario 3.

## Reclasificación (DialogoConfirmarReclasificar) — US3

- El usuario inicia la reclasificación de una `CeldaDia` (elige nueva clasificación). Se
  abre un diálogo de **confirmación explícita** que muestra el día y el cambio propuesto
  (FR-016).
- **Cancelar**: cierra el diálogo; no se hace `POST`, el día conserva su clasificación
  (FR-016). → US3 escenario 1.
- **Confirmar**: hace `POST /api/calendarios/{periodo}/reclasificar` con `{ fecha,
  clasificacion, autor }`; con la respuesta 200 (VistaCalendarioMes) actualiza la grilla;
  el día muestra la nueva clasificación y su resaltado (FR-017). → US3 escenarios 2–3.
- En estados *Vacío global* / *Vacío de un mes*, la acción de reclasificar **no está
  disponible** (FR-018). → US3 escenario 4.
- Errores del `POST` (400/404/red) se muestran sin aplicar el cambio localmente.

## Accesibilidad y privacidad (transversal)

- Ninguna vista muestra nombres, legajos ni fichadas de empleados (FR-014). Los componentes
  solo reciben la `VistaCalendarioMes`, que no los contiene.
- Toda distinción de estado es percibible sin color (FR-004), verificable comprobando la
  presencia de texto/`aria-label`/forma por celda en los tests de componente (SC-004).
- Rótulos en español (Assumptions).

## Cobertura de tests de componente (orientativa)

| Componente / flujo | Verifica |
|--------------------|----------|
| `App` (carga) | pide lista → carga último; estados cargando/vacío global/error |
| `GrillaMes` | cantidad y ubicación de días (SC-007); huecos correctos |
| `CeldaDia` | clasificación con 2º recurso (FR-004); marca de hoy; `enPeriodoActivo` |
| `Leyenda` | un ítem por clave (FR-006) |
| `EncabezadoPeriodo` | con/sin período activo (FR-008/010) |
| `DialogoConfirmarReclasificar` | cancelar no hace POST; confirmar hace POST y refresca (FR-016/017) |
| `NavegacionMes` | anterior/siguiente/volver; mes 404 → vacío (FR-012) |
