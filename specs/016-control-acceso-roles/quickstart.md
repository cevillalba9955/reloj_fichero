# Quickstart: Control de Acceso por Roles (Lector / Editor / Configurador)

Guía de validación end-to-end de las 3 historias de usuario. Formas de
request/response en `contracts/web-api-acl.md`; reglas de resolución del rol
en `data-model.md` y `research.md`.

## Prerrequisitos

- Node.js 20+, dependencias instaladas (`npm install` en la raíz y en
  `frontend/`).
- `config/roles.json` presente (usar `config/roles.example.json` como base
  si no existe) con al menos un valor de `mapeo` para `editor` y otro para
  `configurador`, por ejemplo:
  ```json
  {
    "rolPorDefecto": "lector",
    "mapeo": { "RRHH_EDITOR": "editor", "RRHH_ADMIN": "configurador" }
  }
  ```
- Frontend compilado (`cd frontend && npm run build`) o corriendo en modo dev
  (`npm run dev` en `frontend/`, apuntando su proxy a `npm run web`).

## Levantar el sistema

```bash
npm run web
```

## US1 — Ver todo, sin poder modificar nada, como Lector (P1)

1. Sin mandar ningún header de rol (o mandando uno que no está en el mapeo),
   entrar a la aplicación.
2. `GET /api/acl/mi-rol` (o el badge de rol en la interfaz) debe mostrar
   `lector`.
3. Navegar Calendario, Fichadas de hoy, Resumen período y Vacaciones: el
   contenido se ve igual que siempre, pero los controles de escritura
   (corregir, justificar, asignar vacaciones, cerrar/reabrir/reclasificar
   período) aparecen ocultos o deshabilitados.
4. La sección "Configuración" no aparece en la navegación.
5. Forzar una operación de escritura directamente contra la API, por
   ejemplo:
   ```bash
   curl -i -X POST http://localhost:4173/api/vacaciones/asignaciones \
     -H "Content-Type: application/json" \
     -d '{"legajo": 1001, "fechaInicio": "2026-08-01", "cantidadDias": 5}'
   ```
   Esperado: `403` con `{ "error": { "codigo": "ACCESO_DENEGADO", ... } }`, y
   `GET /api/vacaciones/1001` no refleja ningún cambio.

## US2 — Operar el día a día como Editor (P2)

1. Repetir los pasos de arriba mandando el header configurado (default
   `X-Apex-Rol`) con un valor mapeado a `editor` en `config/roles.json`, por
   ejemplo:
   ```bash
   curl -i http://localhost:4173/api/acl/mi-rol -H "X-Apex-Rol: RRHH_EDITOR"
   ```
   Esperado: `{ "rol": "editor" }`.
2. Desde la interfaz (con ese mismo header, si se prueba vía un proxy que lo
   inyecte, o simulándolo en el cliente HTTP de prueba), completar de punta a
   punta: corregir una fichada, registrar una pausa/retiro anticipado,
   justificar y luego quitar la justificación de una ausencia, asignar y
   revertir una asignación de vacaciones, y generar/cerrar/reabrir un
   período. Todas deben completarse con éxito, igual que antes de esta
   feature.
3. La sección "Configuración" sigue sin aparecer en la navegación; forzar
   `GET /api/configuracion/reloj` con este mismo header → `403`
   `ACCESO_DENEGADO`.

## US3 — Administrar la configuración técnica como Configurador (P3)

1. Repetir con un valor de header mapeado a `configurador`.
2. `GET /api/acl/mi-rol` → `{ "rol": "configurador" }`.
3. La sección "Configuración" aparece en la navegación; entrar y guardar un
   cambio (por ejemplo, `PUT /api/configuracion/reloj`) — debe persistir
   igual que antes de esta feature.
4. Todas las operaciones de Editor y Lector siguen funcionando sin
   restricciones adicionales.

## Rol indeterminado (Edge Case)

1. Mandar un header con un valor que no aparece en `mapeo` (por ejemplo,
   `X-Apex-Rol: ALGO_QUE_NO_EXISTE`).
2. `GET /api/acl/mi-rol` → `{ "rol": "lector" }` (o el valor de
   `rolPorDefecto` si se reconfiguró). La aplicación sigue completamente
   navegable en modo lectura — sin pantallas de error ni interrupciones.
