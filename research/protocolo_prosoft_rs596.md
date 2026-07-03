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

> **Corrección de encuadre (2026-07-03, ver §5.9):** el "header" de 4 bytes
> de arriba no es un valor sin significado — es el campo[4] (legajo) del
> registro 1. El corte correcto de 20 bytes por registro debería empezar 4
> bytes antes de donde el parser actual empieza a leer cada registro (o,
> equivalentemente, el orden real de campos por fichada es
> `[campo4, campo0, campo1, campo2, campo3]`, no
> `[campo0, campo1, campo2, campo3, campo4]`). El campo[4] del último
> registro de la respuesta queda colgando: es el legajo de una fichada que
> todavía no llegó en esta descarga.

Cada registro de 20 bytes se divide en 5 campos de 4 bytes:

| Campo | Bytes | Confirmado | Descripción |
|---|---|---|---|
| campo[0] | 0–3 | ⚠️ Hipótesis | Constante `01 00 00 XX` — el último byte varía por registro; no se pudo correlacionar con hora/fecha real |
| campo[1] | 4–7 | ⚠️ Hipótesis | Primeros 2 bytes (`F9 71`) constantes en todas las capturas observadas; los 2 bytes finales varían. Fuerte candidato a contener parte de fecha/hora, pero no se logró decodificar la fórmula exacta |
| campo[2] | 8–11 | ✅ Constante | Siempre `00 00 00 01` en todos los registros observados. Posible flag fijo (¿tipo de registro = asistencia?) |
| campo[3] | 12–15 | ✅ Confirmado (parcial) | Varía entre registros con distinto método de verificación: `00 00 00 10` vs `00 00 00 40` (bits distintos → **candidato a "método de verificación": huella/rostro/tarjeta**, sin confirmar cuál bit corresponde a cuál método) |
| campo[4] | 16–19 | ✅ Confirmado (byte0 = legajo, ver §5.9) | **Corrección (2026-07-03, §5.9):** el byte0 de este campo SÍ es un ID estable (legajo del empleado) — el parser actual lo asigna al registro equivocado por un error de encuadre de 4 bytes (ver §5.9); no leer esta fila sin la corrección de encuadre |

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

**Legajo — hipótesis sobre campo[2], REFUTADA ❌ (ver actualización §5.8):**
en las 4 sesiones reales revisadas hasta ese momento (incluida esta),
campo[2] era siempre `00 00 00 01`, y en las que se conocía el legajo del
empleado (esta y la de la sección 6.1, "Cesar Villalba"), el legajo real era
`1` en ambos casos. En ese momento no había ningún caso de prueba con un
legajo distinto de `1` que permitiera distinguir "campo[2] = legajo del
empleado" de "campo[2] = constante fija sin relación con el legajo". Esa
prueba ya se hizo: `research/control_fichada.csv` (usado en la sección 5.7)
incluye dos fichadas con legajo `2` (filas 1 y 2) tomadas en la misma
sesión que las cinco con legajo `1`, y las siete comparten el mismo
campo[2] = `00 00 00 01` (ver `tests/contract/fixtures/siete-registros-control-fichada.json`).
Esto refuta la hipótesis "campo[2] = legajo": el campo no varía entre
legajos distintos dentro de una misma sesión/lote. Ver sección 5.8 para la
hipótesis vigente (contador de lote/sesión, no de legajo ni de empleado).

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

### 5.8 campo[2] cambió de valor entre sesiones — hipótesis "legajo" refutada, nueva hipótesis "contador de lote" (2026-07-03)

Sesión real descargada el 2026-07-03 contra el mismo equipo de siempre
(`192.168.1.82`, también alcanzado vía IP pública `179.41.4.113` — mismos 28
registros por ambas rutas, sin diferencias byte a byte). Incluye fichadas de
varios legajos nuevos (no solo legajo 1), con horarios aproximados del
02/07 ~16:00 y del 03/07 ~07:00, según lo informado por el usuario (sin CSV
exacto de control para esta tanda, a diferencia de la sección 5.7).

**Hallazgo:** los 28 registros comparten el mismo valor de campo[2]:
`00 00 00 02` — un valor nunca antes observado (todas las capturas previas,
incluidas las de legajo 2 en la sección 5.6/5.7, traían `00 00 00 01`).

Esto es evidencia adicional (más allá de la refutación directa vía CSV,
sección 5.6) en contra de "campo[2] = legajo": si fuera legajo, con
"varios legajos nuevos" en el mismo lote se esperarían valores de campo[2]
distintos *dentro* del lote, no un único valor uniforme para las 28
fichadas. En cambio, el valor es constante *dentro* de cada sesión/lote de
descarga, pero cambió *entre* sesiones de días distintos (`01` el
2026-07-02, `02` el 2026-07-03).

**Hipótesis vigente (sin confirmar):** campo[2] podría ser un contador a
nivel de lote/sesión de descarga — por ejemplo, un índice de "generación" o
"día" que se incrementa una vez (no por fichada), posiblemente disparado
por el borrado (`0xA8`) probado el 2026-07-02 (sección 6.5) o por el cambio
de día calendario. No hay todavía suficientes puntos de datos (solo dos
valores consecutivos, `01` y `02`) para distinguir entre "contador de día",
"contador de lote/generación tras borrado" u otra causa. Hace falta
observar el valor en una tercera sesión (idealmente sin borrado de por
medio) para avanzar.

**Timestamp — sin decodificar para este lote:** los 28 registros dieron
`timestampHypothesis: null` en la implementación actual. Motivo: el chequeo
de "flag fijo" de `decodeTimestampHypothesis` (bits bajos del byte de hora,
`hourByte & 0b00011111 === 0b00010`) asume un valor constante (`2`) tomado
de los únicos dos horarios calibrados hasta ahora (13 y 14 hs, sección
5.7). En este lote nuevo aparecen bytes de hora con esos bits bajos en `2`
**y también en `3`** (ej. `hourByte = 0x02` → bits bajos `00010` = 2, pero
`hourByte = 0xC3` → bits bajos `00011` = 3), agrupados en bloques
consistentes con los dos horarios aproximados informados por el usuario
(~07:00 y ~16:00). Es decir, la fórmula de hora de la sección 5.7 no
generaliza tal cual a estos nuevos bloques horarios: el bit bajo que se
asumía "flag fijo" podría en realidad codificar información adicional de
hora (por ejemplo, distinguir sub-bloques dentro de las 8 horas, o el
bloque de 8 horas mismo en combinación con otro criterio). **No se ajusta
la fórmula todavía** — hace falta un CSV de control con horas exactas (con
segundos) para este lote, igual que en la sección 5.7, antes de tocar
`decodeTimestampHypothesis`.

**Qué no cambió:** los primeros 3 bytes de campo[0] (`01 00 00`) y el primer
byte de campo[1] (`F9`) siguen constantes también en este lote de un día
distinto (2026-07-02/03), reforzando que esos bytes específicos no son un
componente de fecha simple día-a-día (sección 5.7, "Fecha (día/mes/año):
sin tocar" sigue vigente sin novedad).

---

### 5.9 Bloque horario confirmado para esta muestra ✅ y legajo/ID de empleado DECODIFICADO ✅ — CORRECCIÓN DE ENCUADRE, no desfasaje temporal (2026-07-03)

El usuario confirmó, contra la aplicación oficial, a qué bloque de 8 horas
corresponde cada mitad del lote de 28 fichadas de la sección 5.8:
registros 1-14 → bloque **16-23hs**, registros 15-28 → bloque **00-07hs**.
Con eso, el timestamp completo (hora exacta, minuto, segundo) de las 28
fichadas queda confirmado (detalle fila por fila en
`research/hipotesis_fichadas_2026-07-03.csv`).

**Importante — esta confirmación es puntual, no generaliza la fórmula:**
seguimos sin poder saber, para una fichada nueva y aislada, a cuál de los 3
bloques de 8 horas pertenece sin una referencia externa (el byte que se
especuló que podría marcar el bloque, primer byte de campo[1] = `F9`, sigue
constante en ambos bloques de esta muestra). Lo que se gana acá es la
certeza de estos 28 registros puntuales, útil como fixture de contrato, no
una fórmula genérica de bloque.

**Legajo/ID de empleado — CONFIRMADO ✅. Primer intento de explicación
(desfasaje temporal) DESCARTADO — la causa real es un error de encuadre
(framing) en el propio parser, no un comportamiento raro del reloj.**

Primer intento (incorrecto): se había planteado que el campo[4] byte0 de
un registro describía el legajo del registro *siguiente* ("desfasaje de un
registro"), atribuyéndolo a una posible demora del firmware en confirmar
la identificación. El usuario señaló, con razón, que esa explicación era
incoherente. Redirigiendo el análisis directamente a los bytes crudos del
`0xA4` (sección 5.2) en vez de a la CSV derivada, apareció la explicación
correcta:

**El "header de 4 bytes" que se lee y se descarta antes del primer
registro (sección 5.2, `src/protocol/client.js`) no es basura — es el
campo[4] (legajo) del primer registro.** El parser actual corta el stream
de bytes 4 posiciones tarde: agrupa `[header 4 bytes descartados]` +
`[registro1: campo0,1,2,3,4]` + `[registro2: campo0,1,2,3,4]` + ...,
cuando el corte correcto es `[registro1: header+campo0,1,2,3]` +
`[registro2: campo4(del anterior)+campo0,1,2,3]` + ... — es decir, **el
campo[4] de cada fichada real son los 4 bytes que preceden a su propio
campo[0]**, no los que lo siguen. Esto explica todo sin apelar a ningún
comportamiento temporal extraño:

- El "header" descartado en cada sesión SIEMPRE fue el legajo de la
  primera fichada, disponible en la misma respuesta, nunca datos de una
  sesión anterior perdida.
- El campo[4] del ÚLTIMO registro de cada respuesta queda "colgando"
  (no pertenece a ningún registro con campo0-3 disponible en esta
  respuesta) — es simplemente el legajo de una fichada aún no llegada
  a esta descarga (pendiente o futura), no un caso especial de método de
  verificación.

**Verificación contra capturas reales independientes (no la CSV
derivada):**
- Sección 6.1 (registro único, "Cesar Villalba", capturado con tshark):
  header = `01 00 00 00` → byte0 = `1`. Legajo confirmado de Cesar
  Villalba = `1`. **Coincide.**
- Sección 6.2 (2 registros, mismo empleado, "el anterior sin borrar"):
  header = `01 00 00 00` → byte0 = `1`, igual que 6.1 (mismo empleado en
  ambos registros de esa captura). **Consistente.**
- Fixture `tests/contract/fixtures/siete-registros-control-fichada.json`
  (2026-07-02): aplicando el mismo re-encuadre, los legajos reales de
  `control_fichada.csv` coinciden con el campo[4] "adelantado" en las 6
  transiciones verificables (filas 2-7). El primer registro de esa sesión
  (legajo real `2`) necesitaría el header de esa captura puntual, que no
  quedó documentado aparte — coherente con el mismo patrón.
- Lote de 28 fichadas del 2026-07-03 (sección 5.8): con el re-encuadre,
  27 de 27 legajos verificables coinciden exactamente con la lista de
  legajos reales aportada por el usuario (`1, 2, 9, 10, 35, 53, 57, 59,
  71, 72, 73, 74, 76, 79`); el legajo de la fila 1 (`72`) es el que
  hubiera estado en el header de *esta* sesión (no capturado por
  separado porque `src/protocol/client.js` lo descarta sin loguearlo);
  el campo[4] de la fila 28 (`44`) queda colgando, perteneciente a una
  fichada aún no descargada.

**Conclusión:** el legajo/ID de empleado viaja en el primer byte de un
bloque de 4 bytes que el parser actual ubica en el lugar equivocado
(como "header" descartado antes del primer registro, y como "campo[4]"
al final de cada registro salvo el último). No hay ningún comportamiento
de "adelanto"/latencia del reloj: es nuestro propio código el que arma
mal los límites de cada registro. Esto también **refuta definitivamente**
la vieja hipótesis de que campo[2] fuera el legajo (sección 5.6/5.8:
campo[2] es `00000002` fijo para las 28, sin relación con la identidad de
nadie).

**Impacto en la implementación actual (bug real, no solo hallazgo de
investigación):** `src/protocol/client.js` descarta hoy el header de 4
bytes de cada sesión sin loguearlo ni exponerlo — eso significa que, tal
como está, el script **pierde silenciosamente el legajo de la primera
fichada de cada descarga**, en cada ejecución.

**Actualización (2026-07-03):** el re-encuadre ya se implementó —
`src/protocol/client.js` deja de descartar el header de 4 bytes y lo
antepone al buffer de registros antes de trocear; `src/protocol/records.js`
expone `legajoHipotesis` (primer byte del bloque re-encuadrado) y ajustó
los offsets de `timestampHypothesis`/`recordTypeConstant`/
`verificationMethodCode` a la posición correcta. Cubierto por tests nuevos
en `tests/contract/records.contract.test.js` y
`tests/integration/query-pending-fichadas.integration.test.js` contra las
capturas reales existentes (`un-registro-pendiente.json`,
`dos-registros-pendientes.json`, `siete-registros-control-fichada.json`).
Pendiente, no bloqueante: agregar el lote de 28 fichadas del 2026-07-03
como fixture de contrato nuevo (ver `research/hipotesis_fichadas_2026-07-03.csv`
como fuente).

---

### 5.10 Hora — bit0 del byte de hora es un flag AM/PM (hora <= 12), NO un marcador de bloque 00-07 (2026-07-03)

**Hipótesis anterior RETRACTADA:** en un lote de 4 fichadas nuevas
(mismo host `192.168.1.82`, sesión `2026-07-03T14:28`) se había propuesto
que el bit bajo del byte de hora (`hourByte & 0x1F = 3`, en vez del `2`
asumido originalmente) indicaba directamente que la hora real estaba en el
bloque 00-07hs. El usuario confirmó que la hora real de esas 4 fichadas es
**11**, no 3 — la hipótesis de "flag=3 ⟹ bloque 00-07" queda **refutada**
(hora 11 está en el bloque 8-15, no en 0-7).

**Hipótesis corregida y confirmada 7/7 contra todos los horarios reales
conocidos hasta ahora:** el bit bajo (bit0) del byte de hora es un flag
tipo AM/PM — `1` si la hora real es **menor o igual a 12**, `0` si es
**mayor a 12** — independiente del bloque de 8 horas (bits altos). Los
otros 4 bits bajos (bits 1-4) son fijos en `0001`. Verificación completa:

| Hora real | hourByte | bit0 (¿hora \<= 12?) | Coincide |
|---|---|---|---|
| 13 | `0xA2` | 0 (no) | ✅ |
| 14 | `0xC2` | 0 (no) | ✅ |
| 16 | `0x02` | 0 (no) | ✅ |
| 6 | `0xC3` | 1 (sí) | ✅ |
| 7 | `0xE3` | 1 (sí) | ✅ |
| 11 | `0x63` | 1 (sí) | ✅ |
| 12 | `0x83` | 1 (sí) | ✅ |

> **Corrección de límite (2026-07-03):** la primera versión de esta
> hipótesis usaba el límite "hora < 12" en vez de "hora <= 12". Con solo
> horas 6/7/11/13/14/16 confirmadas, ambos límites daban exactamente el
> mismo resultado (ninguna de esas horas es igual a 12). Una 5ta fichada
> nueva (sesión `2026-07-03T15:56`) resultó ser justo la hora límite: real
> **12:55**, `hourMod8=4`, bit0=1. Con el límite viejo ("< 12") el código
> resolvía esto como hora **4** (único candidato `< 12` del grupo
> `{4,12,20}`) — **incorrecto**. Con el límite corregido ("<= 12"), tanto
> `4` como `12` caen del lado "sí" del flag, así que el grupo `m=4` con
> flag=1 pasa a ser **ambiguo** (ya no se resuelve solo con este byte) en
> vez de resolverse mal. Ver `tests/contract/fixtures/muestras-hora-ampm-2026-07-03.json`
> (fila 7) para el caso real que forzó esta corrección.

**Qué resuelve y qué no:** combinado con `hourMod8` (bits altos, ya
confirmado), este flag a veces alcanza para resolver la ambigüedad de 8
horas por completo, y a veces no. Regla general: de los 3 candidatos
`{hourMod8, hourMod8+8, hourMod8+16}`, si **exactamente uno** cae del lado
que indica el flag (`<=12` o `>12`), la hora queda resuelta; si quedan 2
candidatos del mismo lado, sigue ambigua. Con `m = hourMod8` (0-7):

- `m ∈ {0,1,2,3}`: con flag=0 (hora >12) queda **resuelto** como `m+16`
  (único candidato >12). Con flag=1 (hora <=12) sigue **ambiguo entre `m`
  y `m+8`** (ambos <=12) — caso de las 4 fichadas de hora 11 (`m=3`,
  candidatos `3` u `11`).
- `m = 4` (caso especial, afectado por la corrección de límite): con
  flag=1 (hora <=12) sigue **ambiguo entre `4` y `12`** (ambos <=12 bajo
  el límite corregido — este es el caso de la fichada de hora 12). Con
  flag=0 (hora >12) queda **resuelto** como `20` (único candidato >12).
- `m ∈ {5,6,7}`: con flag=1 (hora <=12) queda **resuelto** como `m` (único
  candidato <=12 de ese grupo, ya que `m+8` va de 13 a 15). Con flag=0
  (hora >12) sigue **ambiguo entre `m+8` y `m+16`** (caso de las horas
  13/14, `m=5`/`m=6`).

Con solo 7 horas reales confirmadas hasta ahora (13, 14, 16, 6, 7, 11, 12),
esta hipótesis tiene buen soporte pero no cubre ni un tercio de las 24
horas posibles, y sigue sin dato alguno para la hora `0` (medianoche) —
no debe tratarse como fórmula definitiva sin más calibración.

**Confirmado con estos lotes:** las 4 fichadas de la sesión `14:28`
decodifican como `11:22:34`, `11:24:16`, `11:25:10`, `11:26:33` — minuto y
segundo ya coincidían con la fórmula existente, solo la hora necesitó
confirmación externa. La 5ta fichada de la sesión `15:56` (mismas 4 más
una nueva) decodifica como `12:55:48` — confirmó el caso límite hora=12 y
forzó la corrección de arriba.

**Implementado (2026-07-03, corregido el mismo día):**
`decodeTimestampHypothesis` en `src/protocol/records.js` acepta el flag de
hora en `2` o `3` (en vez de exigir exactamente `2`), calcula los 3
candidatos de hora y resuelve solo cuando exactamente uno cae del lado que
indica el flag AM/PM (límite `<=12`/`>12`), devolviendo `null` en caso
contrario. Cubierto por `tests/contract/fixtures/muestras-hora-ampm-2026-07-03.json`
(incluye el caso límite hora=12) y el test correspondiente en
`records.contract.test.js`.

**Hallazgo adicional al armar los tests (2026-07-03): el gate de minuto
también parece demasiado estricto.** `decodeTimestampHypothesis` exige que
los 2 bits bajos de `minuteByte` sean `01` para considerar el registro
válido — ese chequeo viene de antes de esta sesión (research.md §5.7),
confirmado originalmente solo contra las 7 fichadas de
`control_fichada.csv` (las 7 cumplían `01`). Al revisar los 28 registros
del lote de la sección 5.8/5.9 con hora ya confirmada por el usuario
(bloques 16-23 y 00-07), **ninguno de los 28 cumple ese flag** (`minuteByte`
observado con bits bajos `10` en el bloque 16-23, `00` en el bloque 00-07),
y sin embargo el minuto decodificado (`minuteByte >> 2`) coincide
exactamente con la hora real confirmada en todos los casos verificados
(filas 14, 15 y 27, por ejemplo). Es decir, igual que pasó con el byte de
hora: el gate de minuto probablemente esté rechazando registros
perfectamente decodificables. **No se tocó este gate todavía** — queda
como hallazgo pendiente de confirmar y de decidir si se relaja, análogo a
lo que se hizo con la hora en esta misma sección.

**Pendiente:**
- Decidir si conviene relajar también el gate de minuto (`minuteByte & 0b11`)
  ahora que hay evidencia de que rechaza minutos correctos, o esperar mas
  calibración.
- Seguir juntando horas reales confirmadas para terminar de validar el
  flag AM/PM (faltan 17 de 24 horas posibles; el caso límite hora=12 ya se
  confirmó y corrigió — ver arriba). Sigue sin dato la hora `0`
  (medianoche), que podría no seguir el mismo patrón que 1-12.

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

### 6.6 Experimento: ¿son necesarios los tres `0x13`? (2026-07-03)

Motivado por una inconsistencia entre `spec.md` FR-002 ("dos consultas
`0x13`") y la secuencia real implementada (tres: parámetros,
identificación, parámetros de nuevo), se corrieron dos experimentos
dirigidos contra el equipo real (`192.168.1.82`), con scripts ad-hoc en
`experiments/` (no forman parte del cliente de producción):

**Experimento A** (`experiments/probar-dos-0x13.mjs`): `0x80` → `0x13`
parámetros → `0x13` identificación → **(sin repetir parámetros)** → `0xB4`.
Corrido dos veces, con resultados **contradictorios**:

Intento 1:
```
[OK  ] 0x80 handshake
[OK  ] 0x13 parametros (1ra vez)
[FAIL] secuencia con 2 llamados 0x13 — Timeout esperando 1040 bytes (limite 3000ms)
[OK  ] 0x81 cierre
```

Intento 2 (mismo comando, misma máquina, corrido después):
```
[OK  ] 0x80 handshake
[OK  ] 0x13 parametros (1ra vez)
[OK  ] 0x13 identificacion
[OK  ] 0xB4 conteo de pendientes — declaredPendingCount=5
[OK  ] 0x81 cierre
```

**Experimento B** (`experiments/probar-solo-handshake.mjs`): `0x80` →
**(sin ningún `0x13`)** → `0xB4`.

```
[OK  ] 0x80 handshake
[OK  ] 0xB4 conteo de pendientes — declaredPendingCount=5
[OK  ] 0x81 cierre
```

El reloj respondió `0xB4` correctamente sin ningún `0x13` — sin errores,
sin timeout, con un conteo de pendientes coherente con la fichada de hora
12 documentada en la sección 5.10 (era la misma sesión con 5 fichadas
pendientes).

**Conclusión RETRACTADA:** la primera versión de esta sección afirmaba que
"lo que no funciona es una secuencia parcial (2 de 3)", basada en el
Intento 1 del Experimento A. El Intento 2, corrido después con la
**misma** secuencia exacta, funcionó de punta a punta sin problema. Dos
corridas idénticas con resultados opuestos es evidencia de que el fallo
del Intento 1 fue muy probablemente un **timeout circunstancial** (el
límite de 3000ms del script era ajustado para el tiempo real que tarda en
llegar la respuesta de identificación de 1040 bytes, posiblemente por
latencia de una conexión "fría"), **no** una señal de que el reloj
rechace o necesite una secuencia completa de tres `0x13`.

**Confirmación con 10 corridas adicionales (2026-07-03, `--timeout-ms 8000`):**
para descartar que el Intento 1 fuera un timeout ajustado en vez de una
falla real, se corrieron ambos experimentos 5 veces seguidas cada uno,
con un timeout casi 3 veces mayor (8000ms vs 3000ms):

- Experimento B (cero `0x13`): **5/5 exitosas**, mismo resultado
  (`declaredPendingCount=5`) en las cinco corridas.
- Experimento A (dos `0x13`, sin repetir parámetros): **5/5 exitosas**,
  mismo resultado (`declaredPendingCount=5`) en las cinco corridas.

10 de 10 corridas exitosas, con conteo estable entre corridas (evidencia
adicional de que ninguna de las dos variantes reducidas borra ni altera
las fichadas pendientes). Esto confirma que el Intento 1 (único fallo
observado en todo el experimento) fue un timeout circunstancial y no un
comportamiento real del reloj.

**Confirmación con `0xA4` real, sin ningún `0x13` (2026-07-03,
`experiments/probar-solo-handshake-con-a4.mjs`):** para cerrar el único
punto pendiente, se extendió el experimento para pedir el detalle
completo (`0xA4`), no solo el conteo (`0xB4`), reutilizando
`queryPendingFichadas()`/`parseFichadaRecord()` tal cual los usa
`src/protocol/client.js` en producción — mismo encuadre, mismo parser, sin
reimplementar nada. Corrido 3 veces seguidas:

```
[OK  ] 0x80 handshake
[OK  ] 0xB4 conteo de pendientes — declaredPendingCount=5
[OK  ] 0xA4 detalle — recibidos 5 registros (esperados 5)
[OK  ] 0x81 cierre

  #1: legajo=2 metodo=rostro hora=null recordTypeConstant=00000001
  #2: legajo=59 metodo=rostro hora=null recordTypeConstant=00000001
  #3: legajo=1 metodo=huella hora=null recordTypeConstant=00000001
  #4: legajo=41 metodo=rostro hora=null recordTypeConstant=00000001
  #5: legajo=1 metodo=huella hora=null recordTypeConstant=00000001
```

3/3 corridas exitosas, con los mismos 5 registros decodificados de forma
idéntica a como los decodifica el flujo de producción normal (mismos
legajos ya conocidos de sesiones anteriores con la secuencia completa de
tres `0x13`). El detalle completo (`0xA4`) funciona igual de bien sin
ningún `0x13`.

**Conclusión final:** con 13/13 corridas exitosas en total (5 + 5 + 3,
cubriendo `0xB4` solo, secuencia parcial, y `0xA4` real completo), la
evidencia es sólida: **los tres `0x13` no parecen ser necesarios para
ninguna de las operaciones que usa este script.** El software oficial
Pro-Soft los hace, pero el reloj no los exige para `0xB4`/`0xA4`.

**Decisión final (2026-07-03):** se simplificó `src/protocol/client.js`.
`runQuerySession` ahora acepta un parámetro `fullHandshake` (default
`false`): por defecto ejecuta solo el handshake `0x80` antes de `0xB4`/
`0xA4` (secuencia reducida, confirmada 13/13); si `fullHandshake: true`
(expuesto en el CLI como `--full-handshake`, ver `contracts/cli-contract.md`),
ejecuta la secuencia completa de tres `0x13` tal como la usa el software
oficial. Los builders `buildParamsCommand`/`buildIdentificationCommand`
NO se eliminaron — quedan disponibles y se siguen ejerciendo vía este
flag, para poder recuperar el comportamiento original sin tocar código si
un reloj distinto, un cambio de firmware, u otro parámetro del entorno
llegara a requerirlo. Ambos modos se confirmaron de punta a punta contra
el equipo real después de implementar el cambio (`node src/cli/consultar-fichadas.js
--host 192.168.1.82` y con `--full-handshake`, ambos exitosos).
`tests/integration/client-session.integration.test.js` cubre los dos
modos (servidor mock reducido y completo).

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
- [x] (§5.8→§5.9, 2026-07-03) Exportar un CSV de control con horas exactas para el lote de 28 fichadas del 2026-07-03 — resuelto vía confirmación directa del usuario contra la app oficial (bloques horarios, no segundos exactos por fila) más el cruce de legajos reales; ver `research/hipotesis_fichadas_2026-07-03.csv`.
- [ ] (§5.8, 2026-07-03) Descargar una tercera sesión en un tercer día calendario (sin borrado `0xA8` de por medio si es posible) para determinar si campo[2] es un contador de día, un contador de lote/generación post-borrado, u otra cosa.
- [x] (§5.9, 2026-07-03) Corregir el encuadre en `src/protocol/client.js`/`records.js`: dejar de descartar el header de 4 bytes (es el legajo del primer registro) y re-cortar cada fichada como `[campo4 anterior] + [campo0,1,2,3 propios]`; el campo[4] del último registro de la respuesta queda colgando (fichada aún no descargada) y ya no se asigna al último registro. Implementado y cubierto por tests.
- [ ] (§5.9, 2026-07-03) Agregar el lote de 28 fichadas como fixture de contrato (`tests/contract/fixtures/`), ya con el encuadre corregido.
- [x] (§5.10, 2026-07-03) Conseguir horarios reales para las horas todavía no confirmadas, especialmente el caso límite hora=12 — confirmado con fichada real (12:55:48), corrigió el límite del flag AM/PM de "hora<12" a "hora<=12".
- [ ] (§5.10, 2026-07-03) Conseguir horarios reales para las horas que faltan (0,1,2,5,8,9,10,15,17-23), en particular hora=0 (medianoche), que podría no seguir el mismo patrón que 1-12.
- [x] (§5.10, 2026-07-03) Implementar la resolución parcial de hora (flag AM/PM + hourMod8) en `decodeTimestampHypothesis`.
- [ ] (§5.10, 2026-07-03) Decidir si se relaja también el gate de minuto (`minuteByte & 0b11`), dado que rechaza minutos correctos en los 28 registros del lote de §5.8/5.9 (hallazgo nuevo, ver arriba).
- [ ] (§5.9, 2026-07-03) Confirmar con una tercera sesión (idealmente con más de un registro pendiente) que el re-encuadre de campo[4] es consistente y no depende del método de verificación ni de si hay borrado de por medio.
