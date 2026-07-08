# Contrato: `OracleRosterRepository` (capa de repositorio Oracle)

**Motivo**: FR-002/FR-003 de [spec.md](../spec.md) y Constitución
Principio II — único punto del repositorio completo donde puede existir
SQL. Archivo: `src/db/oracle-roster-repository.js`.

## Interfaz

```text
createOracleRosterRepository({ config, connectionFactory? }) -> OracleRosterRepository
OracleRosterRepository.fetchLegajosActivos() -> Promise<unknown[]>
```

- `config`: `OracleRosterConfig` ya validada (ver
  [env-config-contract.md](./env-config-contract.md)); el repositorio
  asume identificadores ya validados pero **re-valida** vista y columna
  antes de interpolar (defensa en profundidad).
- `connectionFactory` (opcional, para tests): función async que devuelve
  una conexión con la forma mínima `{ execute(sql, binds, opts),
  close() }`. Default: `node-oracledb` real en modo thin con
  `connectTimeout`/`callTimeout` derivados de `config.timeoutMs`.
- Devuelve las filas crudas de la columna del legajo, **sin normalizar**
  (la normalización es responsabilidad del provider, FR-012) — el
  repositorio solo sabe de SQL y conexiones.

## Comportamiento obligatorio

- **Una única sentencia**: `SELECT <columnaLegajo> FROM <vistaPadron>`.
  Ninguna otra construcción de SQL puede existir en el repo (revisión
  exigida por la constitución para toda PR que toque esta capa).
- **Solo lectura**: jamás `INSERT`/`UPDATE`/`DELETE`/DDL (FR-002).
- **Conexión efímera**: abre conexión por llamada y la cierra SIEMPRE
  (try/finally), incluso ante error — con 1 consulta/día (FR-014) no hay
  pool.
- **Errores**: cualquier fallo (conexión, autenticación, timeout, SQL) se
  rechaza envuelto en `RosterNoDisponibleError` (tipo de 002,
  `src/roster/active-employees-provider.js`), con `detail` que distingue
  `conexion` / `autenticacion` / `timeout` / `consulta` y **nunca**
  incluye password ni connect string completo.
- **Timeout** (FR-009): `config.timeoutMs` acota tanto el connect como el
  execute; al agotarse, rechaza — nunca espera indefinida.

## Tests exigidos (Principio IV — antes de implementar)

Con `connectionFactory` fake (sin red):
1. Genera exactamente el SQL esperado con vista/columna de la config.
2. Rechaza (sin ejecutar) si vista o columna no pasan la validación de
   identificador.
3. Mapea las filas devueltas tal cual (sin normalizar).
4. Cierra la conexión en éxito y en error.
5. Un rechazo de la conexión/execute sale como `RosterNoDisponibleError`
   con la categoría correcta y sin secretos en el mensaje.
