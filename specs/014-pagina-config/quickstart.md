# Quickstart: Página de Configuración

Guía de validación end-to-end de las 4 historias de usuario. Formas de
request/response en `contracts/web-api-configuracion.md` y
`contracts/control-api.md`; reglas de validación en `data-model.md` y
`research.md §5`.

## Prerrequisitos

- Node.js 20+, dependencias instaladas (`npm install` en la raíz y en
  `frontend/`).
- Un `.env` de trabajo (puede partir de uno mínimo con `FICHADAS_HOST` seteado
  a cualquier IP de prueba).
- `config/categorias.json` y `config/motivos-ausencia.json` presentes (usar
  los `*.example.json` como base si no existen).
- Frontend compilado (`cd frontend && npm run build`) o corriendo en modo dev
  (`npm run dev` en `frontend/`, apuntando su proxy a `npm run web`).

## Levantar el sistema

```bash
npm run web
```

Opcional, para validar Historia 1 (probar conexión) end-to-end con el
control-API real:

```bash
npm run servicio -- --control-port 5006
```

## US1 — Configurar la conexión al reloj (P1)

1. Abrir la página "Configuración" (nueva entrada de navegación).
2. Cambiar `FICHADAS_HOST`/`FICHADAS_PORT` a valores de prueba y usar "Probar
   conexión" → esperar `{ ok: true|false }` sin que se haya guardado nada
   todavía (`GET /api/configuracion/reloj` sigue devolviendo los valores
   viejos).
3. Guardar → `PUT /api/configuracion/reloj` responde 200 y `GET` ya refleja
   el nuevo valor; la página indica que hace falta reiniciar
   `rs956-fichadas` para que el proceso en ejecución lo tome (FR-006).
4. Repetir el guardado con un puerto fuera de rango (p. ej. `70000`) → 400
   `CONFIGURACION_INVALIDA`, y `GET` sigue mostrando el valor anterior (no se
   persistió nada).

**Éxito**: acceptance scenarios 1-4 de la Historia 1 del spec.

## US2 — Catálogo de motivos de ausencia (P2)

1. `GET /api/configuracion/motivos-ausencia` → ver el catálogo completo
   (incluye inactivos, a diferencia de `GET /api/motivos-ausencia`).
2. `POST` un motivo nuevo (`id` único) → 201; confirmar que aparece en
   `GET /api/motivos-ausencia` (el selector de Justificación de Ausencias,
   spec 012).
3. `PUT .../:id` cambiando `etiqueta`/`tipoPago` de un motivo existente → 200,
   el `id` no cambia.
4. `PUT .../:id` con `{ "activo": false }` sobre un motivo usado en
   justificaciones ya registradas → confirmar que esas justificaciones
   existentes no cambian (consultar el resumen del período, spec 011) y que
   el motivo ya no aparece en `GET /api/motivos-ausencia`.
5. `POST` con un `id` repetido → 400 `MOTIVO_DUPLICADO`.

**Éxito**: acceptance scenarios 1-4 de la Historia 2 del spec.

## US3 — Categorías, modalidades y esquema semanal (P3)

1. `GET /api/configuracion/categorias` → ver modalidades, categorías y
   esquema semanal actuales.
2. `POST /api/configuracion/categorias/modalidades` con una modalidad nueva →
   201; asignarla a una categoría nueva
   (`POST /api/configuracion/categorias/categorias`) o existente
   (`PUT /api/configuracion/categorias/categorias/:codigo`).
3. Correr el cálculo de presentismo de esa categoría
   (`npm run presentismo`) y confirmar que usa los horarios recién definidos.
4. Intentar `DELETE /api/configuracion/categorias/modalidades/:nombre` sobre
   una modalidad en uso → 409 `MODALIDAD_EN_USO` con la lista de categorías
   que la usan.
5. `PUT /api/configuracion/categorias/esquema-semanal` con una lista vacía o
   con un día repetido → 400 `CONFIGURACION_INVALIDA`.

**Éxito**: acceptance scenarios 1-6 de la Historia 3 del spec.

## US4 — Resto de los parámetros operativos (P4)

1. Editar `FICHADAS_TIMEOUT_MS`/`FICHADAS_ENTRADA_HORA`/`FICHADAS_ENTRADA_DURACION`
   vía `PUT /api/configuracion/reloj` → 200, `GET` refleja los nuevos
   valores.
2. Enviar un valor fuera de rango (p. ej. `FICHADAS_TIMEOUT_MS: 0`) → 400
   `CONFIGURACION_INVALIDA`.

**Éxito**: acceptance scenarios 1-2 de la Historia 4 del spec.

## Verificación de no-regresión

- El selector de motivos de Justificación de Ausencias (spec 012) sigue
  funcionando con catálogos editados desde esta página.
- El Resumen del Período (spec 011) sigue calculando correctamente con
  categorías/modalidades editadas desde esta página.
- `RRHH_ORACLE_*` y las rutas de archivos/directorios no aparecen en ningún
  endpoint de `/api/configuracion/*` (FR-014).
