# Quickstart — Validar la pantalla de Calendario Mensual (feature 007)

Guía para levantar y validar la feature end-to-end. No incluye código de implementación; ver
[contracts/](./contracts/) y [data-model.md](./data-model.md) para las formas exactas.

## Prerrequisitos

- Node.js ≥ 20.12 (ya requerido por el repo).
- Dependencias del backend: ninguna nueva (usa `node:http`).
- Dependencias del frontend (workspace `frontend/`): `react`, `react-dom`, `vite`, `vitest`,
  `@testing-library/react`, `@testing-library/jest-dom` (devDependencies del workspace).
- Al menos un calendario generado en `data/presentismo/`. Si no hay ninguno, generá uno con
  el CLI existente de la feature 004:
  ```bash
  npm run presentismo -- generar-calendario --periodo 202607
  ```
  (Ya existe `data/presentismo/202607.json` en este repo; alcanza para validar.)

## Levantar la aplicación (desarrollo)

1. Backend API + estáticos (proceso Node local):
   ```bash
   node src/web/server.js            # sirve /api y el frontend compilado
   ```
2. Frontend en modo dev (recarga en caliente), desde `frontend/`:
   ```bash
   cd frontend && npm install && npm run dev
   ```
   El dev server de Vite proxya `/api` al backend. En producción se sirve el build estático
   desde el mismo proceso Node del paso 1.

## Escenarios de validación (mapa a User Stories / SC)

### 1. Ver el calendario del último mes generado (US1, SC-001/002/007/008)

- Abrir la app. **Esperado**: se muestra la grilla del mes con el `YYYYMM` más alto entre los
  generados (p. ej. `202607`), con los 31 días ubicados en su día de semana, hábiles y
  feriados resaltados, y la leyenda visible. La pantalla aparece en < 3 s.
- Verificación de "último": generar además un mes menor (`202606`) y uno mayor (`202608`) y
  recargar. **Esperado**: abre `202608` (el más alto), no el más reciente por tiempo.

### 2. Día de hoy (US1, FR-007)

- Con la fecha del sistema dentro del mes mostrado. **Esperado**: la celda de hoy está
  marcada con un recurso de forma (borde), distinguible de la clasificación.
- Con el mes mostrado ≠ mes actual (habitual, porque abre el último generado). **Esperado**:
  ninguna celda marcada como hoy, sin error.

### 3. Período activo (US2, SC-005, FR-008/009/010)

- **Esperado**: el encabezado muestra la etiqueta del período activo y su rango
  (`desde–hasta`); los días del período se distinguen en la grilla. Si el tramo es el mes
  completo, todos los días figuran dentro del período.

### 4. Reclasificar con confirmación (US3, SC-009, FR-016/017)

- Elegir un día `Laborable` y pedir reclasificarlo a `Feriado`. **Esperado**: aparece un
  diálogo de confirmación; al **cancelar**, el día sigue `Laborable` y no hubo `POST`.
- Repetir y **confirmar**. **Esperado**: el día pasa a `Feriado`, la grilla lo refleja y su
  resaltado cambia. En `data/presentismo/{periodo}.json` el día queda con
  `reclasificadoManual: true`, y el log de presentismo registra `dia_reclasificado`.
- Comprobar privacidad: el evento del log y las respuestas de la API **no** contienen
  nombres, legajos ni fichadas (FR-014, Principio V).

### 5. Estado vacío (US1/US4, SC-006, FR-011/018)

- Renombrar/mover temporalmente los `*.json` de `data/presentismo/` (o apuntar `repoDir` a un
  directorio vacío) y abrir la app. **Esperado**: estado vacío global claro, sin error ni
  pantalla en blanco, y **sin** acción de reclasificar.
- Con calendarios presentes, navegar (P3) a un mes sin generar (p. ej. `202612`).
  **Esperado**: estado vacío de ese mes, sin error, sin reclasificar.

### 6. Navegación entre meses (US4, FR-012)

- Usar "mes siguiente"/"mes anterior". **Esperado**: la grilla, clasificaciones y resaltado
  se actualizan al mes elegido. "Volver" regresa al último mes generado en un gesto.

### 7. Accesibilidad sin color (SC-004, FR-004)

- Ver la pantalla en escala de grises (o con un simulador de daltonismo). **Esperado**: cada
  clasificación, el día de hoy y la pertenencia al período siguen siendo distinguibles por
  texto/forma, no solo por color.

## Correr los tests

```bash
# Backend: contrato + integración + unidad del repositorio
node --test tests/contract/web-api-calendario.test.js \
            tests/integration/reclasificar-desde-api.test.js \
            tests/unit/file-presentismo-repository-listar.test.js

# Todo el backend
npm test

# Frontend (componentes), desde frontend/
cd frontend && npm run test
```

**Esperado**: todo verde. Los tests de contrato verifican la forma de las respuestas y la
ausencia de datos personales; los de integración, que reclasificar persiste y se refleja; los
de componente, los estados y el flujo de confirmación descritos en
[contracts/ui-pantalla-calendario.md](./contracts/ui-pantalla-calendario.md).
