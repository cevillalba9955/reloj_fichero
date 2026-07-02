# Protocolo de comunicación — Prosoft RS596 WiFi

**Estado:** Ingeniería inversa parcial, basada en análisis de tráfico de red (Wireshark) entre el software oficial "Gestión de Personal Pro-Soft" y el equipo.

**Última actualización:** 2 de julio de 2026 (agregada sección 6.4: handshake/`0x13`/`0x81` confirmados vía tshark sobre `research/*.pcapng`; corregido el comando `0xA4` de la sección 6.1)

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
| `0x80` | Handshake / apertura de sesión | ✅ | Primer mensaje de toda sesión. El equipo responde con ACK simple. Bytes reales en sección 6.4. |
| `0x13` | Consulta de parámetros del equipo | ✅ | Se envía **tres** veces por sesión (no dos, ver corrección 2026-07-02): 1ª y 3ª vez con la misma trama, respuesta de 64 bytes con parámetros de configuración binarios sin decodificar; 2ª vez con una trama distinta, respuesta de 1040 bytes con el bloque de identificación (ver sección 4). Bytes reales en sección 6.4. |
| `0x81` | Inicio/fin de una operación de sincronización | ✅ | Dos variantes por el byte 4 de la trama: `00` = apertura (usada antes de operaciones como `0xA8`), `01` = cierre (usada al final de toda sesión, incluida la descarga de fichadas — no hay apertura `0x81` antes de `0xB4`/`0xA4` en las capturas revisadas). Bytes reales en sección 6.4. |
| `0xB4` | Consultar fichadas pendientes | ✅ | El reloj responde con un ACK donde uno de los bytes indica la cantidad de registros pendientes (`01`, `02`, etc. — ver ejemplos en sección 5). |
| `0xA4` | Solicitar el detalle de las fichadas pendientes | ✅ | El reloj devuelve el payload con los registros (ver sección 5). |
| `0xA8` | Borrar fichadas ya descargadas | ✅ | Comando corto, sin payload de datos. El equipo responde con ACK simple. Se envuelve en `0x81` apertura/cierre, en una sesión TCP separada de la lectura (ver sección 6.5). **Probado contra el equipo real el 2026-07-02** (autorizado explícitamente por el usuario, prueba única): 3 fichadas pendientes → 0 tras el borrado, confirmado con una consulta `0xB4` posterior. No expuesto por el CLI de esta feature (FR-007 lo excluye deliberadamente del alcance). |
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

### 5.6 Dato de calibración real — fichada de prueba vs. software oficial (2026-07-02)

Se descargó en vivo (vía este script, contra `192.168.1.82`) el siguiente
registro real, único pendiente en ese momento:

```
rawHex:  01 00 00 06 F9 71 A2 E1 00 00 00 01 00 00 00 40 35 04 00 00
campo[0]: 01 00 00 06
campo[1]: F9 71 A2 E1
campo[2]: 00 00 00 01
campo[3]: 00 00 00 40   <- metodo de verificacion
campo[4]: 35 04 00 00
```

El software oficial, para esta misma fichada, informó: fecha `02/07/26`,
hora `13:56`, tipo `Entrada`, legajo `1`, id `72`, método **reconocimiento
facial**.

**Método de verificación `0x40` = rostro/facial — confirmado por comparación directa.**
Esto valida, con evidencia externa (no solo inferencia interna), el
significado de uno de los dos valores observados hasta ahora en campo[3]
(`0x10` y `0x40`). Encaja además con una fórmula plausible derivada del
propio equipo: el bloque de identificación (sección 4) declara
`EnrollDataType:{fp,pwd,idcard,face}`; si se numera esa lista 1 a 4 y se
multiplica por `0x10`, da `fp=0x10, pwd=0x20, idcard=0x30, face=0x40` —
coincide exactamente con el valor confirmado. **`0x10 = huella (fp)` queda
como hipótesis fuerte por esta fórmula, pero todavía sin una confirmación
independiente propia** (no se probó una fichada por huella contra el
software oficial). `verificationMethodLabel` en el código sigue
exponiéndose con `unconfirmed: true` para todos los valores, tal como exige
el contrato (`output-schema.json`); esta sección documenta el hallazgo a
nivel de investigación, no cambia esa garantía del código.

**Legajo — hipótesis nueva sobre campo[2]:** en las 4 sesiones reales
revisadas hasta ahora (incluida esta), campo[2] es siempre `00 00 00 01`, y
en las que se conoce el legajo del empleado (esta y la de la sección 6.1,
"Cesar Villalba"), el legajo real es `1` en ambos casos. Es decir, no hay
todavía ningún caso de prueba con un legajo distinto de `1` que permita
distinguir "campo[2] = legajo del empleado" de "campo[2] = constante fija
sin relación con el legajo". Para desambiguar hace falta una fichada de
prueba de un empleado con legajo distinto de 1.

**Timestamp:** sigue sin resolverse. Un solo punto de calibración (`13:56`,
sin segundos) no alcanza para aislar una fórmula de empaquetado de fecha/hora
entre los bytes candidatos (campo[1] y campo[4]); intentos previos con 3
horas reales conocidas (sección 5.5) ya habían fallado con los formatos más
comunes. Para avanzar hacer falta registrar el hex crudo de varias fichadas
junto con la hora exacta (con segundos) que informe el software oficial para
cada una.

**"id: 72" del software:** no se encontró como ninguno de los bytes del
registro (no aparece `0x48` en ningún campo). Es consistente con la
hipótesis ya documentada de que ese id es un correlativo interno de la base
de datos del software oficial, no un valor que viaje por este protocolo.

**Actualización (2026-07-02, misma sesión de pruebas):** una tercera
fichada trajo `verificationMethodCode = 00000030`, un valor nunca antes
observado en ninguna captura. El usuario confirmó contra el software
oficial que esa marcación fue **por tarjeta**. Esto confirma la fórmula de
la sección anterior para un segundo valor independiente:

| Código | Método | Confirmación |
|---|---|---|
| `0x10` | huella (fp) | hipótesis por fórmula, sin confirmar de forma independiente |
| `0x20` | clave (pwd) | nunca observado en ninguna captura — no se expone como hipótesis en el código |
| `0x30` | tarjeta (idcard) | ✅ **confirmado** contra el software oficial |
| `0x40` | rostro (face) | ✅ **confirmado** contra el software oficial |

Registro real (fixture `tests/contract/fixtures/tres-registros-pendientes-tarjeta.json`):
```
01 00 00 15 F9 71 C2 45 00 00 00 01 00 00 00 30 8D 09 00 00
```

### 5.7 Timestamp — segundos y minutos DECODIFICADOS ✅ (2026-07-02)

Usando `research/control_fichada.csv` (export real del software oficial con
hora exacta, con segundos, para 7 fichadas de prueba consecutivas) contra
los 7 registros descargados en la misma sesión, se aisló la fórmula para
dos de los tres componentes de hora que quedaban sin resolver.

**Correlación (las 7 filas, en orden):**

| CSV: hora | campo[0] (hex) | campo[1] (hex) |
|---|---|---|
| 14:34:**15** | 01 00 00 **0F** | F9 71 C2 **89** |
| 14:35:**54** | 01 00 00 **36** | F9 71 C2 **8D** |
| 14:36:**08** | 01 00 00 **08** | F9 71 C2 **91** |
| 14:38:**07** | 01 00 00 **07** | F9 71 C2 **99** |
| 14:39:**15** | 01 00 00 **0F** | F9 71 C2 **9D** |
| 14:41:**33** | 01 00 00 **21** | F9 71 C2 **A5** |
| 14:42:**58** | 01 00 00 **3A** | F9 71 C2 **A9** |

**Segundos — CONFIRMADO ✅:** el último byte de campo[0] es el segundo de la
hora, en binario simple (no BCD): `0x0F=15, 0x36=54, 0x08=8, 0x07=7, 0x21=33,
0x3A=58`. Coincide exacto en las 7 filas.

**Minutos — CONFIRMADO ✅:** el último byte de campo[1] es
`minuto * 4 + 1` (bits altos = minuto de 0-59, 2 bits bajos = flag fijo en
`01`): `34*4+1=137=0x89`, `35*4+1=141=0x8D`, `36*4+1=145=0x91`,
`38*4+1=153=0x99`, `39*4+1=157=0x9D`, `41*4+1=165=0xA5`, `42*4+1=169=0xA9`.
Coincide exacto en las 7 filas, y también en el dato de calibración previo
de la sección 5.6 (`13:56` → `56*4+1=225=0xE1`, y en efecto el registro de
esa fichada trae `F9 71 A2 E1`).

**Hora — hipótesis parcial, NO confirmada del todo:** el 3er byte de
campo[1] sigue la fórmula `(32 * hora + 2) mod 256`: hora 13 → `32*13+2=418`,
`418 mod 256 = 162 = 0xA2` ✓; hora 14 → `32*14+2=450`, `450 mod 256 = 194 =
0xC2` ✓. Ajusta perfecto para los dos valores de hora observados — **pero
esta fórmula da el mismo resultado cada 8 horas** (`32*8=256=0`), es decir
que con los datos actuales **no se puede distinguir, por ejemplo, la hora 6
de la hora 14, o la hora 5 de la hora 13**. El 2do byte de campo[1] (`71` en
todos los casos vistos hasta ahora) podría ser el que resuelve a qué bloque
de 8 horas corresponde, pero no varió en ninguna prueba porque las horas 13
y 14 caen en el mismo bloque (8-15) — hace falta un dato de calibración en
un horario de un bloque distinto (ej. mañana temprano o de noche) para
confirmarlo o descartarlo.

**Fecha (día/mes/año):** sin tocar. El primer byte de campo[0] (`01`), sus
2 bytes siguientes (`00 00`), y el 1er byte de campo[1] (`F9`) se mantienen
constantes en **todas** las capturas vistas hasta ahora — pero todas son
del mismo día calendario (2026-07-02), así que no hay todavía ningún dato
que permita saber si esos bytes cambian entre días.

**Cómo seguir:** para cerrar el formato completo haría falta una fichada de
prueba en un horario de un bloque de 8 horas distinto al ya probado (0-7,
16-23), e idealmente una prueba en un día calendario distinto, siempre
comparando el hex crudo contra la hora exacta (con segundos) del software
oficial, igual que en `research/control_fichada.csv`.

**Decisión (2026-07-02):** el usuario dio por válido este formato sin más
pruebas de calibración. Se implementó en `src/protocol/records.js`
(`timestampHypothesis`, ver `data-model.md` §1) exponiendo minuto y segundo
(confirmados) y la hora módulo 8 (con la ambigüedad de arriba sin resolver),
siempre con `unconfirmed: true`.

---

## 6. Ejemplos de capturas reales (hex)

### 6.1 Un registro pendiente (fichada única — Cesar Villalba)

```
Comando:   55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 05 00
Respuesta: AA 55 01 01 01 00 00 00 05 00        <- flag "01" = 1 registro pendiente

Comando:   55 AA 01 A4 00 00 00 00 01 00 00 00 14 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00 55 AA
           01 00 00 00                                    <- header
           01 00 00 16 F9 71 02 05 00 00 00 01
           00 00 00 10 99 02 00 00                        <- registro (20 bytes)
```

> **Corrección (2026-07-02):** el comando `0xA4` de este ejemplo se había
> transcripto con 15 bytes (faltaba un `00` en el campo de cantidad de
> registros, entre el byte `01` y el `00 00 14 00`). Se corrigió a 16 bytes
> tras extraer el tráfico con `tshark` directamente de
> `research/fichada3.pcapng` (stream 19, mismo caso de 1 registro pendiente)
> y de `research/fichada2.pcapng` (stream 11, 2 registros pendientes, ver
> 6.2). El formato real del comando `0xA4` es:
> ```
> 55 AA 01 A4 00 00 00 00 [cantidad de registros, LE32] [cantidad*20, LE16] [seq LE16]
> ```

### 6.2 Dos registros pendientes (rostro + huella, más el anterior sin borrar)

```
Comando:   55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 05 00
Respuesta: AA 55 01 01 02 00 00 00 05 00        <- flag "02" = 2 registros pendientes

Comando:   55 AA 01 A4 00 00 00 00 02 00 00 00 28 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00 55 AA
  header:     01 00 00 00
  registro 1: 01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 10 01 00 00 00
  registro 2: 01 00 00 09 F9 71 02 89 00 00 00 01 00 00 00 40 DA 04 00 00
```

> El comando `0xA4` y el ACK+marcador previos al header no estaban en la
> versión original de este ejemplo (solo se habían transcripto el header y
> los registros); se completaron el 2026-07-02 extrayéndolos con `tshark` de
> `research/fichada2.pcapng` (stream 11), que reproduce esta misma sesión de
> 2 registros pendientes byte a byte.

### 6.3 Comando de borrado

```
Comando:   55 AA 01 A8 00 00 00 00 00 00 FF FF 00 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00        <- ACK simple, sin payload
```

---

### 6.4 Apertura y cierre de sesión: `0x80`, `0x13` (x3) y `0x81` — confirmado ✅

Añadido el 2026-07-02, extraído con `tshark` de tres capturas independientes
(`research/fichada1.pcapng` stream 176, `research/fichada2.pcapng` streams
11 y 13, `research/fichada3.pcapng` stream 19), todas coincidentes byte a
byte salvo donde se indica. Resuelve el gap que impedía implementar
`buildHandshakeCommand`/`buildParamsCommand`/`buildCloseOperationCommand`
sin fabricar bytes (Constitución, Principio III).

**Secuencia real completa de una descarga de fichadas** (numeración de
secuencia desde 1 al conectar):

```
1. 0x80 (seq 1)               -> ACK
2. 0x13 "parametros"  (seq 2) -> ACK + 64 bytes
3. 0x13 "identificacion" (seq 3) -> ACK + 1040 bytes
4. 0x13 "parametros" de nuevo (seq 4) -> ACK + 64 bytes  (si, se repite)
5. 0xB4 (seq 5)                -> ACK con cantidad pendiente
6. 0xA4 (seq 6), solo si hay pendientes -> ACK + registros
7. 0x81 cierre (seq 6 o 7)     -> ACK
```

**0x80 — handshake:**
```
Comando:   55 AA 01 80 00 00 00 00 00 00 FF FF 00 00 01 00
Respuesta: AA 55 01 01 00 00 00 00 01 00
```
Los bytes 8-9 (aquí `00 00`) variaron entre capturas (`80 D2`, `4C D3`, `00 00`)
sin afectar el resultado — el equipo no parece validarlos.

**0x13 "parámetros" (64 bytes de respuesta, se envía 2 veces: 1ª y 3ª):**
```
Comando:   55 AA 01 13 00 00 00 00 00 00 00 00 30 00 [seq]
Respuesta: AA 55 01 01 00 00 00 00 [seq] 55 AA
           04 01 30 00 00 13 10 00 ED 04 00 00 01 01 00 01
           01 00 00 12 10 27 00 00 E8 03 00 00 E8 03 00 00
           E8 03 00 00 40 0D 03 00 01 01 00 01 00 00 00 04
           AD 05 00 00
```
Payload binario sin decodificar (parámetros de configuración del equipo),
idéntico byte a byte en las 4 sesiones revisadas.

**0x13 "identificación" (1040 bytes de respuesta, se envía 1 vez, 2ª):**
```
Comando:   55 AA 01 13 01 00 00 00 [4 bytes variables] 04 [seq]
Respuesta: AA 55 01 01 00 00 00 00 [seq] 55 AA + 1028 bytes
           (bloque de identificacion, ver seccion 4)
```
Los 4 "bytes variables" (posiciones 8-11) difieren por sesión (`08 CD`,
`D6 D1`, `00 00`) sin afectar el resultado, igual que en el handshake.

**0x81 — cierre de operación (variante byte4=`01`, usada al final de la sesión):**
```
Comando:   55 AA 01 81 01 00 00 00 00 00 FF FF 00 00 [seq]
Respuesta: AA 55 01 01 00 00 00 00 [seq]
```
Existe una variante byte4=`00` ("apertura de operación") usada antes de
comandos como `0xA8`, fuera del alcance de esta feature (FR-007).

### 6.5 Borrado (`0xA8`) — probado contra el equipo real (2026-07-02)

Fuera del CLI de esta feature (FR-007 lo excluye a propósito), pero probado
una vez de forma manual y explícitamente autorizada por el usuario, para
validar el comando contra el equipo real. Reproduce exactamente los bytes
observados en `research/fichada2.pcapng` stream 13, en una sesión TCP
**separada** de la lectura (no en la misma sesión que `0xB4`/`0xA4`):

```
1. 0x80 (seq 1) -> ACK
2. 0x13 "parametros" (seq 2) -> ACK + 64 bytes
3. 0x13 "identificacion" (seq 3) -> ACK + 1040 bytes
4. 0x13 "parametros" de nuevo (seq 4) -> ACK + 64 bytes
5. 0x81 apertura (seq 5): 55 AA 01 81 00 00 00 00 00 00 FF FF 00 00 05 00 -> ACK
6. 0xA8 borrar   (seq 6): 55 AA 01 A8 00 00 00 00 00 00 FF FF 00 00 06 00 -> ACK
7. 0x81 cierre   (seq 7): 55 AA 01 81 01 00 00 00 00 00 FF FF 00 00 07 00 -> ACK
```

**Resultado real:** antes del borrado, `0xB4` (en una tercera sesión TCP,
solo de verificación) declaraba 3 fichadas pendientes; después del `0xA8`,
la misma consulta `0xB4` declaró 0. Confirma que `0xA8` efectivamente limpia
el buffer de fichadas pendientes del equipo, sin devolver ningún payload de
datos (solo el ACK simple).

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
