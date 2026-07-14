# Quickstart: Servicio de Consulta Programada de Fichadas

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Guía para validar que el servicio funciona de punta a punta, una vez
implementado. No incluye código de implementación — ver `tasks.md`
(generado por `/speckit-tasks`) para el detalle de construcción.

## Prerrequisitos

- Node.js 20+ instalado.
- El cliente RS596 de `001-consulta-fichadas-rs596` ya implementado y
  probado (`src/protocol/client.js`).
- Un archivo de configuración local con el padrón placeholder de
  empleados activos (ver `contracts/roster-provider-contract.md`), por
  ejemplo `{ "legajosActivos": [1, 2, 3] }`.
- Acceso de red al reloj RS596 **o** un mock TCP server basado en las
  fixtures de `tests/contract/fixtures/` de feature 001, para validar sin
  hardware real.

## Validar el ciclo de un checkpoint contra el mock (sin esperar horas reales)

1. Arrancar el servicio con un `now()` inyectado que simule estar dentro
   de la ventana de aceptación de "entrada" (por ejemplo, con horaEsperada
   07:00 y duración 30 min → ventana 07:00–07:30 → simular las 07:05).
2. Levantar el mock TCP del reloj (reutilizando el patrón de
   `tests/integration/` de feature 001) con fichadas pendientes para
   todos los legajos del padrón placeholder.
3. Avanzar el reloj simulado en pasos de 5 minutos.
4. **Resultado esperado**:
   - Tras el primer tick, el servicio consulta al reloj y acumula las
     fichadas recibidas.
   - `getState()` refleja, para el checkpoint "entrada", qué empleados
     del padrón ya están `completo` (tienen una fichada dentro de la
     ventana de aceptación) y cuáles siguen `incompleto`.
   - Apenas todos los empleados activos del padrón estén completos para
     "entrada", los siguientes ticks de 5 minutos no disparan una nueva
     consulta y el checkpoint "entrada" se cierra (no hay un segundo
     checkpoint "salida" en esta feature).

## Validar el cierre por ventana vencida (30 min)

1. Igual que arriba, pero con el mock devolviendo fichadas para menos
   empleados de los que declara el padrón placeholder.
2. Avanzar el reloj simulado hasta superar `horaEsperada + duracionMinutos`
   del checkpoint (07:30 con los valores por defecto).
3. **Resultado esperado**: el checkpoint pasa a `cerrado_ventana_vencida`;
   los empleados sin fichada quedan expuestos como `incompleto` en
   `getState()`; el servicio no genera ninguna alerta ni fuerza un valor
   (FR-007/SC-006); no se disparan más consultas motivadas por ese
   checkpoint.

## Validar la deduplicación de fichadas repetidas entre ciclos

1. Configurar el mock TCP para que devuelva, en dos ticks consecutivos, la
   misma fichada pendiente (mismo `rawHex`) — reproduciendo el
   comportamiento real del reloj, que no borra fichadas y las vuelve a
   reportar hasta que se eliminen explícitamente.
2. Dejar correr al menos 2 ticks de 5 minutos.
3. **Resultado esperado** (FR-017): `getState()` refleja la fichada una
   sola vez en `periodos[]`; el segundo tick no la vuelve a contar ni la
   duplica, aunque el reloj la haya reportado de nuevo.

## Validar no-solapamiento de consultas

1. Configurar el mock para que la respuesta a la consulta tarde más que
   el intervalo de 5 minutos entre ticks (o invocar dos ticks
   manualmente en rápida sucesión).
2. **Resultado esperado**: el segundo tick no dispara una segunda
   `runQuerySession` mientras la primera sigue en curso; queda registrado
   como ciclo `omitido` en el log estructurado (`contracts/service-contract.md`).

## Validar fallo del padrón de empleados activos

1. Configurar `rosterProvider.getActiveEmployees()` para que rechace la
   promesa (simulando que la fuente RRHH/Oracle placeholder no está
   disponible).
2. **Resultado esperado**: el ciclo se registra como `error`
   (`RosterNoDisponibleError`), el servicio no asume un padrón vacío, y
   reintenta en el próximo tick programado (FR-013).

## Correr la suite de tests

```bash
node --test
```

Debe incluir, además de los tests ya existentes de feature 001:
- Tests unitarios del cálculo de ventanas de aceptación y transición de
  estados de checkpoint (`pendiente → abierto → cerrado_*`), con `now()`
  inyectado.
- Tests de integración del scheduler completo contra un mock TCP,
  cubriendo los cinco escenarios de este quickstart.
- Test del adapter placeholder `LocalFileActiveEmployeesProvider` contra
  un archivo de configuración de prueba.
- Test unitario de `FichadasMemoryStore` que confirma que una Fichada con
  `rawHex` ya almacenado se ignora (FR-017, research.md §9).

## Casos límite a ejercitar manualmente al menos una vez

- Arrancar el servicio después de la hora esperada de "entrada" (por
  ejemplo, a las 09:00) y confirmar que igual consulta dentro de lo que
  quede de ventana, o considera el checkpoint cerrado si ya venció la
  ventana de 30 min.
- Reiniciar el proceso a mitad de la ventana horaria y confirmar que el
  progreso de recolección del día se pierde y arranca de nuevo (sin
  persistencia, según spec.md Assumptions).
- Una fichada que llega al día siguiente para un checkpoint del día
  anterior ya cerrado: confirmar que se registra con normalidad, agrupada
  en el período (año-mes) real de su campo `fecha` decodificado.
- Contra hardware real (no solo el mock): confirmar que, al repetir la
  consulta varias veces sin que nadie borre fichadas del reloj, el
  `getState()` no infla la cantidad de fichadas por período — cada
  fichada real debe aparecer una única vez pese a los ciclos repetidos
  (FR-017).
