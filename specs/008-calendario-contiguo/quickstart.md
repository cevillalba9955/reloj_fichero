# Quickstart — Validación de la generación contigua (feature 008)

Guía para validar end-to-end que la generación desde la IU respeta la contigüidad. Referencias:
[contracts/web-api.md](contracts/web-api.md) y [data-model.md](data-model.md).

## Prerrequisitos

- Node.js ≥ 20.
- Repo de presentismo apuntando a un directorio de trabajo (por defecto `./data/presentismo` o
  el `PRESENTISMO_REPO_DIR` configurado). Para pruebas limpias, usar un directorio temporal vacío.

## Setup

```bash
# Backend + build del frontend
npm install
cd frontend && npm install && npm run build && cd ..

# Levantar el servidor web (API en /api + estáticos)
npm run web
# → escucha en http://localhost:4173
```

## Validación por API (rápida, sin navegador)

Con un repositorio **vacío** (sin calendarios):

1. **Semilla disponible**
   ```bash
   curl -s http://localhost:4173/api/calendarios
   # Espera: { "periodos": [], "ultimo": null, "mesActual": "AAAAMM", "generables": ["AAAAMM"] }
   ```
2. **Generar el mes semilla (actual)** — reemplazar `AAAAMM` por el `mesActual` devuelto:
   ```bash
   curl -s -X POST http://localhost:4173/api/calendarios/AAAAMM/generar
   # Espera: 200 con la VistaCalendarioMes del mes semilla.
   ```
3. **Rechazo de salto hacia adelante** — intentar generar mes+2 (dejaría hueco):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4173/api/calendarios/<mes+2>/generar
   # Espera: 409 con codigo PERIODO_NO_CONTIGUO (o PERIODO_FUTURO si mes+2 > mesActual).
   ```
4. **Backfill hacia atrás** — generar mes−1 (contiguo):
   ```bash
   curl -s -X POST http://localhost:4173/api/calendarios/<mes-1>/generar
   # Espera: 200; el GET siguiente muestra periodos = [mes-1, mesActual] y nueva frontera.
   ```
5. **Idempotencia** — volver a generar un período ya generado:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4173/api/calendarios/AAAAMM/generar
   # Espera: 200, sin duplicados ni cambios en la secuencia.
   ```

## Validación por IU (navegador)

Con al menos un mes generado (p. ej. el semilla):

1. Abrir `http://localhost:4173`. La pantalla muestra el último mes generado.
2. **Generar el mes contiguo**: navegar "mes anterior" hasta el mes−1 (frontera). El estado
   vacío muestra el botón **"Generar calendario"**. Presionarlo → aparece la grilla del mes−1.
3. **No-contiguo sin acción**: intentar navegar dos meses más allá del extremo. El control de
   navegación en la dirección no generable está **deshabilitado**: no se puede aterrizar en un
   mes vacío no generable (US3/FR-007).
4. **Futuro bloqueado**: si el mes siguiente al último generado es posterior al mes actual, el
   control "mes siguiente" está deshabilitado desde el último generado (FR-004).
5. **Mensaje de no-contiguo**: si por algún camino se llega a un mes vacío no generable, el
   estado vacío no ofrece "Generar" y explica qué período debe generarse primero (US2 scenario 2).

## Tests automatizados

```bash
# Backend: contrato + integración + unit (incluye guardas de contigüidad e idempotencia)
npm test

# Frontend: componentes (NavegacionMes deshabilitado por flags; EstadoVacio botón/mensaje)
cd frontend && npm test
```

## Resultado esperado (criterios de la spec)

- **SC-001**: ningún camino de la IU genera un período no contiguo (los intentos por API → 409).
- **SC-002**: desde un mes contiguo generable, un clic genera y muestra la grilla.
- **SC-003**: los meses vacíos no contiguos no ofrecen "Generar" y explican qué falta.
- **SC-004**: no se puede avanzar la navegación hacia un mes no generable (control deshabilitado).
