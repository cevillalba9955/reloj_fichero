# Contract: Configuración de Categorías y Modalidades

**Feature**: 004-dominio-presentismo | **Date**: 2026-07-10

Archivo `config/categorias.json` (real, no commiteado) con ejemplo versionado
`config/categorias.example.json`. Cargado y **validado fail-fast al arranque** (research
§5). Horas en formato `HH:MM` en el archivo; el cargador las convierte a minutos-del-día.

## Estructura

```json
{
  "esquemaSemanal": ["lunes", "martes", "miercoles", "jueves", "viernes"],
  "modalidades": {
    "mensual": {
      "tipo": "Mensual",
      "aperturaOficial": "07:00",
      "cierreOficial": "16:00",
      "margenAperturaMin": 30,
      "margenCierreMin": 30,
      "ventanaApertura": ["05:00", "12:00"],
      "ventanaCierre": ["12:00", "23:59"]
    },
    "quincenal_operarios": {
      "tipo": "Quincenal",
      "aperturaOficial": "06:00",
      "cierreOficial": "14:00",
      "margenAperturaMin": 15,
      "margenCierreMin": 15,
      "ventanaApertura": ["04:00", "11:00"],
      "ventanaCierre": ["11:00", "22:00"]
    }
  },
  "categorias": {
    "ADMIN": { "modalidad": "mensual" },
    "PROD":  { "modalidad": "quincenal_operarios" }
  }
}
```

## Reglas de validación (fail-fast)

- `esquemaSemanal`: subconjunto no vacío de los 7 días; default L–V si se omite (FR-003).
- Cada `modalidades[k].tipo` ∈ {`Mensual`, `Quincenal`}.
- `aperturaOficial < cierreOficial`; márgenes enteros `≥ 0`; ventanas `[ini, fin]` con
  `ini ≤ fin`, en formato `HH:MM` válido → convertidas a minutos.
- Cada `categorias[c].modalidad` DEBE referenciar una clave existente en `modalidades`;
  si no, error de arranque (no se calcula con config inconsistente).
- El `codigo` de categoría (clave) es el valor que el padrón reporta por empleado; el
  cotejo padrón→config ocurre en runtime: una categoría del padrón ausente aquí es
  anomalía por empleado (FR-035), no error de arranque.
- Derivado por modalidad: `jornadaEsperada = cierreOficial − aperturaOficial` (FR-011).

## Errores

- Config ausente o JSON inválido → error fatal de arranque con mensaje claro (patrón de
  `oracle-roster-config`).
- Referencia de categoría a modalidad inexistente → error fatal, nombra la categoría.
- Ningún valor sensible se loguea.
