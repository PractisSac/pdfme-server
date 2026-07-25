# Plantillas y contenido

Esta página explica cómo construir el contenido de una plantilla: qué formato de texto elegir, cómo declarar variables, cómo crear enlaces y cómo exponer QR, imágenes, códigos o fechas para que luego puedan cambiarse por API.

## Regla fundamental

> La API entrega valores. La plantilla define su presentación.

La plantilla decide la posición, fuente, formato y tipo de componente. El consumidor solo completa las claves declaradas en `input`.

| La API envía | La plantilla determina |
| --- | --- |
| `"nombre_participante": "ANA TORRES"` | Dónde aparece, fuente, tamaño y color. |
| `"codigo_constancia": "WEB-2026-001"` | Si se imprime como texto o se usa dentro de un enlace. |
| `"qr_constancia": "https://eventos.miempresa.com/validar/WEB-2026-001"` | Tamaño, posición y apariencia del QR. |
| `"logo": "https://assets.miempresa.com/logo-eventos.png"` | Tamaño y posición de la imagen. |

No diseñes el documento desde el payload. El payload no debe contener HTML, estructuras inventadas ni instrucciones visuales.

## Modelo de una plantilla

Una plantilla combina tres niveles distintos. Mantenerlos separados evita errores al integrar:

| Nivel | Ejemplo | Función |
| --- | --- | --- |
| Contenedor | `d1_nombre_participante` | Identifica un elemento dentro del editor. Debe ser único. |
| Variable de texto | `{nombre_participante}` | Declara un valor reemplazable dentro de un texto. Puede repetirse en varias hojas. |
| Objeto cambiable | `#qr_constancia#1` | Declara un elemento completo que puede recibir contenido desde la API. |

El nombre del contenedor organiza internamente a pdfme. Para una integración normal importan las variables entre llaves y los objetos cuyo nombre comienza con `#`.

## Contenido fijo, variable y composición

Una expresión de plantilla puede mezclar partes fijas con variables:

| Parte | Ejemplo | Quién la proporciona |
| --- | --- | --- |
| Contenido fijo | `https://eventos.miempresa.com/constancias/` | La plantilla. |
| Variable | `{codigo_constancia}` | La API mediante `input.codigo_constancia`. |
| Composición | `https://eventos.miempresa.com/constancias/{codigo_constancia}` | La plantilla durante el render. |

Ejemplo completo:

```text
Plantilla: [{codigo_constancia}](https://eventos.miempresa.com/constancias/{codigo_constancia})
Input:     "codigo_constancia": "WEB-2026-001"
Resultado: texto WEB-2026-001 con destino https://eventos.miempresa.com/constancias/WEB-2026-001
```

Revisa primero la expresión de la plantilla. Después envía únicamente el dato que esa expresión necesita.

## Texto simple o Markdown

Los campos `multiVariableText` permiten elegir el formato del contenido.

| Modo | Valor técnico | Usarlo cuando |
| --- | --- | --- |
| Simple | `plain` | Todo el texto comparte fuente, peso, color y estilo. |
| Markdown | `inline-markdown` | Una misma caja necesita negrita, cursiva, tachado, código o enlaces. |

El modo cambia cómo se interpreta el contenido de la caja. No cambia la sintaxis de las variables: `{nombre_participante}` funciona en ambos modos.

## Modo simple

En modo simple, el contenido se imprime literalmente y conserva saltos de línea.

```text
Se deja constancia que {nombre_participante}
participó en el webinar {nombre_evento}.
```

| Capacidad | Comportamiento |
| --- | --- |
| Variables | Sí, con `{clave}`. |
| Saltos de línea | Sí. |
| Alineación y espaciado | Se configuran en el panel del editor. |
| Negrita parcial | No. Se aplica a toda la caja. |
| Enlaces clicables | No. |
| Símbolos `*`, `~` o `` ` `` | Se imprimen como texto normal. |

Usa este modo para nombres, documentos, fechas, títulos y cualquier campo con un solo estilo visual.

## Modo Markdown

Activa **Markdown** cuando necesites estilos dentro de una misma caja. PDF Server admite Markdown en línea, no documentos Markdown completos.

| Resultado | Sintaxis |
| --- | --- |
| Negrita | `**texto**` |
| Cursiva | `*texto*` |
| Negrita y cursiva | `***texto***` |
| Tachado | `~~texto~~` |
| Código | `` `texto` `` |
| Enlace | `[texto](https://eventos.miempresa.com)` |

Ejemplo:

```text
Por participar en el **{nombre_evento}** con una duración de **{horas} horas**.
```

La API debe enviar valores normales:

```json
{
  "nombre_evento": "Webinar de gestión de eventos",
  "horas": "64"
}
```

El estilo está definido en la plantilla; el consumidor no necesita agregar los asteriscos.

## Fuentes para Markdown

Cada estilo puede usar una variante de fuente distinta:

| Variante | Propiedad | Ejemplo |
| --- | --- | --- |
| Base | `fontName` | `Poppins 400` |
| Negrita | `fontVariants.bold` | `Poppins 700` |
| Cursiva | `fontVariants.italic` | `Poppins 400 Italic` |
| Negrita cursiva | `fontVariants.boldItalic` | `Poppins 700 Italic` |
| Código | `fontVariants.code` | `Roboto Mono 400` |

Si una variante no está cargada, `fontVariantFallback: synthetic` intenta simular el estilo. Para un resultado consistente, carga y selecciona las variantes reales usadas por la plantilla.

## Caracteres literales en Markdown

Anteponles `\` cuando quieras imprimir caracteres de control sin aplicar formato.

```text
\**Este texto conserva los asteriscos\**
```

Se pueden escapar `\`, `*`, `~`, `` ` ``, `[`, `]`, `(` y `)`.

## Variables de texto

Una variable usa un nombre entre llaves:

```text
{nombre_participante}
```

También puedes combinar varias dentro de la misma caja:

```text
{tipo_documento}: {nro_documento}
```

| Regla | Ejemplo correcto |
| --- | --- |
| Usa letras, números y guion bajo. | `{fecha_emision}` |
| Mantén una convención estable. | `{nombre_participante}` |
| Evita espacios y signos. | No usar `{nombre completo}`. |
| Reutiliza la misma clave para el mismo dato. | `{nombre_participante}` en todas las hojas. |

Si una variable aparece en cinco páginas, se declara igual en todas. El nombre del contenedor puede cambiar, pero la variable permanece igual.

## Variables dentro de Markdown

Las variables pueden ocupar todo el fragmento o solo una parte:

```text
**{nombre_participante}**
```

```text
Evento: ***{nombre_evento}***
```

```text
Código: `{codigo_constancia}`
```

Los valores recibidos para una variable se insertan como texto literal. Si el valor contiene `**`, `~`, `` ` `` o corchetes, esos caracteres no crean un estilo nuevo. La negrita, la cursiva y los enlaces deben definirse en el contenido de la plantilla.

## Enlaces fijos

En modo Markdown, usa la sintaxis estándar:

```text
[Consultar constancia](https://eventos.miempresa.com)
```

El PDF mostrará el texto y conservará el destino clicable. Para un color concreto, configura `fontColor` en la caja.

## Enlace construido con una variable

Puedes mostrar un código y usarlo también dentro de la URL:

```text
[{codigo_constancia}](https://eventos.miempresa.com/constancias/{codigo_constancia})
```

Payload correcto:

```json
{
  "codigo_constancia": "WEB-2026-001"
}
```

El PDF muestra `WEB-2026-001` y abre:

```text
https://eventos.miempresa.com/constancias/WEB-2026-001
```

Cuando toda la caja es un único enlace y conserva el color negro predeterminado, PDF Server aplica azul `#1677ff`. pdfme agrega el subrayado y la anotación clicable. Si el enlace está mezclado con más texto, define el color deseado en el editor o utiliza una caja independiente.

No envíes la URL completa si la plantilla ya contiene el dominio y la ruta:

```json
{
  "codigo_constancia": "https://eventos.miempresa.com/constancias/WEB-2026-001"
}
```

Ese valor se trataría como el código y produciría texto o un destino incorrecto. Tampoco envíes arreglos serializados, HTML o una expresión Markdown completa dentro de la variable.

## Enlace recibido completo

También puedes usar una variable cuyo valor ya sea la URL completa:

```text
[Abrir constancia]({url_constancia})
```

La integración enviará, por ejemplo, `https://eventos.miempresa.com/constancias/WEB-2026-001` en `url_constancia`.

## Objetos estáticos y cambiables

Una imagen, QR o fecha sin prefijo `#` conserva el contenido definido en la plantilla. Para permitir que la API reemplace el objeto completo, inicia su nombre con `#`.

| Tipo | Nombre en el editor | Clave externa |
| --- | --- | --- |
| Imagen | `#logo` | `logo` |
| QR | `#qr_constancia` | `qr_constancia` |
| Código 128 | `#codigo_constancia` | `codigo_constancia` |
| Fecha | `#fecha_emision` | `fecha_emision` |
| Fecha y hora | `#fecha_hora_emision` | `fecha_hora_emision` |
| Hora | `#hora_emision` | `hora_emision` |

Tipos cambiables detectados: `image`, `qrcode`, `code128`, `date`, `dateTime` y `time`.

El prefijo `#` solo se usa en el editor. En el JSON externo se envía la clave sin `#`.

## Repetir un objeto en varias páginas

pdfme requiere nombres de contenedor únicos. Agrega un sufijo reconocido para reutilizar una sola clave externa:

| Página | Nombre del contenedor | Clave resultante |
| --- | --- | --- |
| 1 | `#qr_constancia#1` | `qr_constancia` |
| 2 | `#qr_constancia#2` | `qr_constancia` |
| 3 | `#qr_constancia__p3` | `qr_constancia` |
| 4 | `#qr_constancia__page4` | `qr_constancia` |
| 5 | `#qr_constancia_page5` | `qr_constancia` |

Sufijos admitidos: `#<n>`, `__p<n>`, `__page<n>`, `_p<n>` y `_page<n>`, donde `<n>` es el número usado para diferenciar el contenedor.

## Imágenes dinámicas

Para imágenes, la forma más estable es enviar un Data URI:

```text
data:image/png;base64,iVBORw0KGgo...
```

Una URL remota exige que el backend pueda acceder al recurso durante el render. Usa HTTPS, evita enlaces temporales demasiado cortos y prueba el acceso desde el entorno donde corre PDF Server.

## QR y códigos de barras

El contenido del QR puede ser una URL, un identificador o cualquier texto válido:

```text
https://eventos.miempresa.com/validar/WEB-2026-001
```

El nombre `#qr_constancia` declara que el contenido es reemplazable. No agregues `{}` alrededor del valor de un objeto QR.

Un enlace de texto y un QR son componentes diferentes:

| Clave | Tipo | Valor esperado |
| --- | --- | --- |
| `codigo_constancia` | Variable en Markdown | `WEB-2026-001` |
| `qr_constancia` | Objeto `qrcode` | `https://eventos.miempresa.com/validar/WEB-2026-001` |

PDF Server no deriva automáticamente `qr_constancia` desde `codigo_constancia`. Si la plantilla utiliza ambos, la integración debe enviar ambas claves.

## Fechas y horas

Los objetos `date`, `dateTime` y `time` son elementos completos. Usa nombres con `#` si su valor debe llegar desde la API. Mantén un formato único por integración y verifica el resultado en la vista previa antes de publicar la versión.

| Tipo | Valor recomendado |
| --- | --- |
| `date` | `2026-07-22` |
| `dateTime` | `2026-07-22T15:30:00-05:00` |
| `time` | `15:30` |

Si necesitas una fecha redactada como `22 de julio de 2026`, normalmente conviene usar una variable de texto simple y enviarla ya formateada.

## Contenido fijo y valores predeterminados

| Contenido | Ejemplo | Comportamiento |
| --- | --- | --- |
| Fijo | `Constancia de participación` | Nunca cambia por una integración normal. |
| Variable | `{nombre_participante}` | Debe recibirse en `input`. |
| Predeterminado | Valor guardado en `content` | Se usa en el editor y puede servir como muestra. |
| Objeto cambiable | `#qr_constancia` | Se reemplaza si llega su clave externa. |

Las variables detectadas se consideran requeridas para render. Un valor predeterminado ayuda al diseño, pero no elimina esa validación en la API.

## Bloqueo y orden de capas

Bloquear un elemento evita seleccionarlo o moverlo accidentalmente en el editor. El bloqueo, la posición y el orden de capas no cambian su clave externa ni impiden que el backend lo renderice.

Usa bloqueo para fondos, marcos, firmas fijas y elementos terminados. Mantén desbloqueados solo los campos que todavía requieren ajustes visuales.

## Páginas, versiones y estado

| Concepto | Efecto |
| --- | --- |
| Página | Cada página conserva sus propios contenedores y bloqueos. |
| Versión actual | Es la versión que usa el render. |
| `DRAFT` | Puede renderizarse para pruebas si tiene versión actual válida. |
| `ACTIVE` | Estado recomendado para producción. |
| `ARCHIVED` | No está disponible para render externo. |

Duplicar páginas o plantillas no obliga a cambiar variables si el contrato externo debe seguir siendo el mismo.

## Revisar el contrato detectado

En el editor abre **Acciones > Variables y objetos**. La tabla muestra:

| Columna | Significado |
| --- | --- |
| Tipo | Variable de texto u objeto cambiable. |
| Clave | Propiedad que deberá existir dentro de `input`. |
| Hojas | Páginas donde se utiliza. |
| Cantidad | Número de elementos que comparten la clave. |

Usa **Copiar JSON** como base para una prueba. La API también expone este contrato mediante `GET /api/v1/templates/:code/inputs`.

## Lista de verificación

Antes de publicar una plantilla:

1. Confirma que cada contenedor tenga un nombre único.
2. Reutiliza exactamente la misma variable cuando un dato se repita.
3. Usa modo simple si toda la caja tiene un solo estilo.
4. Usa Markdown únicamente en cajas que necesiten formato parcial o enlaces.
5. Configura variantes reales de fuente para negrita y cursiva.
6. Nombra con `#` solo los objetos que deban cambiar por API.
7. Usa sufijos reconocidos para repetir objetos en varias páginas.
8. Revisa **Variables y objetos** y prueba el JSON generado.
9. Verifica todas las páginas en vista previa.
10. Publica como `ACTIVE` antes de conectarla a producción.
