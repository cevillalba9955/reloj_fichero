# Protocolo de comunicación — Prosoft RS596 WiFi

**Estado:** Ingeniería inversa parcial, basada en análisis de tráfico de red (Wireshark) entre el software oficial "Gestión de Personal Pro-Soft" y el equipo.

**Última actualización:** 2 de julio de 2026

**Advertencia:** Este documento no está basado en documentación oficial del fabricante (no existe públicamente). Es el resultado de observar tráfico real. Los campos marcados como "confirmado" fueron validados comparando múltiples capturas; los marcados como "hipótesis" o "sin resolver" son observaciones no verificadas y pueden estar incompletos o ser incorrectos.

---

## 1. Datos de conexión

| Parámetro | Valor |
|---|---|
| Transporte | TCP |
| Puerto | `5005` |
| IP del equipo | Configurable en el propio reloj (`Menú > Configuración > Red`) |
| Autenticación | El software pide usuario/contraseña (ej. `admin` / `88888888`), pero **no se envía por este puerto** — es autenticación local del software contra su propia base de datos, no contra el equipo |

---

## 2. Framing general (estructura de todos los mensajes)

Todos los mensajes usan un marcador fijo de 2 bytes al inicio para distinguir dirección:

| Marcador | Dirección |
|---|---|
| `55 AA` | Software → Reloj (comando) |
| `AA 55` | Reloj → Software (respuesta/ACK) |

### 2.1 Formato de comando (software → reloj)

```
55 AA 01 [CMD] [4 bytes variable] [2 bytes: FF FF o 00 00] [2 bytes: contador de secuencia LE] 00
```

- Byte 2 (`01`): constante observada en todos los comandos
- Byte 3 (`CMD`): código de comando (ver tabla en sección 3)
- El contador de secuencia incrementa en cada mensaje dentro de una misma sesión TCP, en little-endian (`01 00`, `02 00`, `03 00`, ...)

### 2.2 Formato de respuesta/ACK (reloj → software)

Casi todas las respuestas empiezan con un ACK corto:

```
AA 55 01 01 [4 bytes, normalmente 00000000] [2 bytes: mismo contador de secuencia] 00
```

Cuando el comando requiere devolver datos, el ACK va seguido inmediatamente del marcador `55 AA` y el payload de datos (ver secciones siguientes). Es decir, la respuesta con datos tiene esta forma:

```
AA 55 01 01 [4 bytes] [contador] 00  |  55 AA [payload específico del comando]
```

También aparecen paquetes de solo `00 00 00 00 00 00` (6 bytes) intercalados — parecen ser confirmaciones de nivel TCP/keepalive sin contenido útil.

---

## 3. Comandos identificados

| Código | Nombre (hipótesis) | Confirmado | Descripción |
|---|---|---|---|
| `0x80` | Handshake / apertura de sesión | ✅ | Primer mensaje de toda sesión. El equipo responde con ACK simple. |
| `0x13` | Consulta de parámetros del equipo | ✅ | Se envía dos veces por sesión; la primera respuesta (64 bytes) trae parámetros de configuración binarios sin decodificar; la segunda (1040 bytes) trae el bloque de identificación (ver sección 4). |
| `0x81` | Inicio/fin de una operación de sincronización | ✅ | Aparece envolviendo bloques de operaciones (ej. antes y después de subir usuarios, antes y después de bajar fichadas). |
| `0xB4` | Consultar fichadas pendientes | ✅ | El reloj responde con un ACK donde uno de los bytes indica la cantidad de registros pendientes (`01`, `02`, etc. — ver ejemplos en sección 5). |
| `0xA4` | Solicitar el detalle de las fichadas pendientes | ✅ | El reloj devuelve el payload con los registros (ver sección 5). |
| `0xA8` | Borrar fichadas ya descargadas | ✅ | Comando corto, sin payload de datos. El equipo responde con ACK simple. Se usa después de `0xA4` para limpiar lo ya leído. |
| `0xE9` | Subir nombre de usuario | ✅ | Payload de 196 bytes con el nombre codificado en **UTF-16LE**. Usado al dar de alta empleados desde el software hacia el equipo. |
| `0x98` | Subir legajo/número de usuario | ✅ | Acompaña al comando anterior; trae el número de legajo en ASCII. |
| `0x96` | Confirmación / siguiente ítem de lote | ✅ | Se envía después de cada `0xE9`/`0x98`, con contador incremental — controla el avance registro por registro en una carga masiva de usuarios. |
| `0xC3` | Consultar identificación extendida | ✅ | Payload de 272 bytes con modelo (`RS596-WiFi`), marca, sitio web, número de serie y fecha de firmware — mismo contenido que el bloque de 1040 bytes de `0x13`, en formato más compacto. Los 4 bytes finales son constantes entre sesiones (probable checksum, no timestamp). |
| `0xB2` | **Consultar fecha/hora del equipo** | ✅ | **Confirmado y decodificado por completo — ver sección 5.4.** Devuelve la fecha/hora actual del reloj en un formato de campos separados (no empaquetado), fácil de leer. |

---

## 4. Bloque de identificación del equipo (respuesta al segundo `0x13`, 1040 bytes)

Contiene, en texto plano dentro del binario:

- **Capacidades del equipo** (formato tipo `clave:valor` separado por comas, entre llaves):
  ```
  CommunicationInterfaceId:12_1,CodePage:UTF-16,UDiskBackupFileFormatId:3,
  SupportSetupImages:OK,SetupInfoStructType:10,
  EnrollDataType:{fp,pwd,idcard,face},fpver:128,facever:528
  ```
- **Nombre del modelo**: `RS596-WiFi`
- **Marca**: `ProSoft`
- **Sitio web**: `www.pro-soft.com.ar`
- **Número de serie**: `7712601200185`
- **Fecha** (posiblemente de fabricación o de firmware): `20-01-2026`
- **Identificador secundario** (posible MAC o serial de placa): `C26540509F121637`

El resto del bloque son ceros de relleno (padding fijo a 1040 bytes).

---

## 5. Estructura de un registro de fichada

### 5.1 Secuencia completa para descargar fichadas

```
1. Software → Reloj:  0x80  (handshake)
2. Software → Reloj:  0x13  (x2, trae parámetros + bloque de identificación)
3. Software → Reloj:  0xB4  (¿hay fichadas pendientes?)
   Reloj → Software:  ACK con flag de cantidad pendiente
4. Software → Reloj:  0xA4  (traer detalle)
   Reloj → Software:  payload con N registros de 20 bytes cada uno
5. Software → Reloj:  0x81  (cierre de esta operación)
6. [en otra sesión TCP] Software → Reloj: 0xA8  (borrar lo descargado)
```

### 5.2 Formato del payload de respuesta a `0xA4`

```
[4 bytes: contador de registros o header]  [registro 1: 20 bytes]  [registro 2: 20 bytes]  ...
```

Cada registro de 20 bytes se divide en 5 campos de 4 bytes:

| Campo | Bytes | Confirmado | Descripción |
|---|---|---|---|
| campo[0] | 0–3 | ⚠️ Hipótesis | Constante `01 00 00 XX` — el último byte varía por registro; no se pudo correlacionar con hora/fecha real |
| campo[1] | 4–7 | ⚠️ Hipótesis | Primeros 2 bytes (`F9 71`) constantes en todas las capturas observadas; los 2 bytes finales varían. Fuerte candidato a contener parte de fecha/hora, pero no se logró decodificar la fórmula exacta |
| campo[2] | 8–11 | ✅ Constante | Siempre `00 00 00 01` en todos los registros observados. Posible flag fijo (¿tipo de registro = asistencia?) |
| campo[3] | 12–15 | ✅ Confirmado (parcial) | Varía entre registros con distinto método de verificación: `00 00 00 10` vs `00 00 00 40` (bits distintos → **candidato a "método de verificación": huella/rostro/tarjeta**, sin confirmar cuál bit corresponde a cuál método) |
| campo[4] | 16–19 | ❌ Sin resolver | Valor pequeño y no monotónico entre sesiones (se observaron 665, 1, 1242, 884 para distintos registros/reintentos del mismo evento). No es un ID de registro estable ni un timestamp reconocible |

> Nota: se confirmó por separado el comando `0xB2` que sí trae la fecha/hora del equipo en formato simple de bytes individuales (ver sección 5.4). El campo de timestamp dentro del registro de fichada sigue sin resolverse — no usa el mismo formato.

### 5.4 Comando de fecha/hora — decodificado ✅

**Secuencia conectar / consultar hora / desconectar:**

```
1. Software → Reloj:  0x80  (conectar / handshake)
2. Software → Reloj:  0x13  (x2, parámetros + identificación — el software siempre los pide al conectar)
3. Software → Reloj:  0xC3  (identificación extendida, opcional en esta secuencia)
4. Software → Reloj:  0x81  (abre operación)
5. Software → Reloj:  0xB2  (consultar fecha/hora)
   Reloj → Software:  payload de 12 bytes con la fecha/hora actual (ver formato abajo)
6. Software → Reloj:  0x81  (cierra la operación / "desconectar" lógico)
   [cierre de la conexión TCP — no hay un comando explícito de "desconectar", el protocolo simplemente cierra el socket]
```

**Formato de la respuesta a `0xB2` (12 bytes), campo por campo — SIN empaquetado matemático:**

| Offset | Bytes | Campo | Ejemplo capturado | Valor decodificado |
|---|---|---|---|---|
| 0–1 | `EA 07` | Año (uint16 LE) | `EA 07` | 2026 |
| 2 | `07` | Mes | `07` | 7 (julio) |
| 3 | `02` | Día | `02` | 2 |
| 4 | `04` | Día de semana (0=domingo) | `04` | 4 = jueves |
| 5 | `0A` | Hora | `0A` | 10 |
| 6 | `18` | Minuto | `18` | 24 |
| 7 | `26` | Segundo | `26` | 38 |
| 8–11 | `45 02 00 00` | Sin identificar | — | Posibles milisegundos/reservado |

Verificado contra la fecha real del día de la captura (jueves 2 de julio de 2026, ~10:24:38) — **coincide exactamente**, incluyendo el día de la semana.

**Importante:** este formato (byte por campo, año en `uint16` + resto en bytes individuales) es **distinto** del formato usado en los registros de fichada (sección 5.2), que parece usar un empaquetado binario diferente. Confirmar la hora del equipo no resolvió directamente el campo de timestamp de las fichadas, pero da una fórmula de referencia sólida por si el mismo empaquetado `año/mes/día/hora/min/seg en bytes separados` aparece en otras partes del protocolo aún no capturadas.

### 5.5 Lo que NO se pudo confirmar (fichadas)

**El campo exacto de fecha/hora no fue identificado con certeza.** Se probó exhaustivamente:
- Interpretación como timestamp Unix estándar (segundos desde 1970) en little-endian y big-endian, en cada offset posible dentro del registro
- Interpretación como formato compacto típico de estos equipos (segundos empaquetados con aritmética año-mes-día-hora-min-seg, año base 2000)
- Interpretación BCD (dígitos decimales empaquetados en nibbles)

Ninguna dio resultados consistentes con las horas reales conocidas de las fichadas de prueba (confirmadas por el usuario: 09:30:44, 09:31:15, 09:31:29 en una de las pruebas).

**Hipótesis pendientes de investigar:**
1. El timestamp podría requerir combinarse con un valor de referencia obtenido en otro comando no capturado aún (ej. "hora actual del equipo")
2. Estos 20 bytes podrían ser solo una notificación de evento, y la fecha/hora completa se resuelva del lado del software cruzando contra su propia base de datos, no viajar completa por este canal
3. Podría haber un desfase de alineación de bytes en el parsing (los límites de "registro" asumidos podrían no ser exactamente cada 20 bytes)

---

## 6. Ejemplos de capturas reales (hex)

### 6.1 Un registro pendiente (fichada única — Cesar Villalba)

```
Comando:   55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 05 00
Respuesta: AA 55 01 01 01 00 00 00 05 00        <- flag "01" = 1 registro pendiente

Comando:   55 AA 01 A4 00 00 00 00 01 00 00 14 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00 55 AA
           01 00 00 00                                    <- header
           01 00 00 16 F9 71 02 05 00 00 00 01
           00 00 00 10 99 02 00 00                        <- registro (20 bytes)
```

### 6.2 Dos registros pendientes (rostro + huella, más el anterior sin borrar)

```
Comando:   55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 05 00
Respuesta: AA 55 01 01 02 00 00 00 05 00        <- flag "02" = 2 registros pendientes

Respuesta a 0xA4:
  header:     01 00 00 00
  registro 1: 01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 10 01 00 00 00
  registro 2: 01 00 00 09 F9 71 02 89 00 00 00 01 00 00 00 40 DA 04 00 00
```

### 6.3 Comando de borrado

```
Comando:   55 AA 01 A8 00 00 00 00 00 00 FF FF 00 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00        <- ACK simple, sin payload
```

---

## 7. Recomendación práctica para integración

Dado que el campo de fecha/hora no está resuelto con certeza, se recomienda un enfoque híbrido para producción:

1. **Usar este protocolo (`0xB4` + `0xA4`) solo como disparador de eventos** — "hay una fichada nueva" — sin depender del timestamp crudo que trae el registro binario.
2. **Obtener la fecha/hora exacta desde el software oficial Pro-Soft**, vía su función de exportación (CSV/Excel/TXT), que sí interpreta correctamente el dato porque conoce el formato propietario completo.
3. Considerar contactar a Pro-Soft solicitando formalmente documentación del protocolo o un SDK — sigue siendo el camino más confiable si se necesita una integración 100% autónoma sin depender del software oficial corriendo en paralelo.

---

## 8. Próximos pasos sugeridos para completar la documentación

- [ ] Capturar el comando de "consultar hora actual del equipo" (si existe) para tener una referencia de calibración
- [ ] Exportar un reporte CSV del software con las fichadas de prueba ya realizadas, y correlacionar sus timestamps exactos contra los bytes crudos capturados
- [ ] Capturar una sesión de alta de usuario completa (comandos `0xE9`/`0x98`/`0x96`) con más detalle para documentar ese flujo también
- [ ] Confirmar el significado exacto de campo[3] (método de verificación) con pruebas dirigidas: una fichada solo por tarjeta, otra solo por PIN, etc.
