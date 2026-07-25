# Visión general

PDF Server genera documentos a partir de una plantilla visual y un conjunto de valores enviados por un sistema externo. Para realizar una integración correcta, primero hay que separar los datos de su presentación.

## Regla fundamental

> La API entrega valores. La plantilla decide cómo se representan.

```text
Sistema externo          PDF Server              Resultado
templateCode + input  -> plantilla + valores  -> PDF binario
```

El objeto `input` no indica si un valor debe aparecer como texto, enlace, QR o imagen. Esa decisión ya está configurada en cada componente de la plantilla.

| Responsabilidad | Quién la controla |
| --- | --- |
| Valor del nombre, código, fecha o URL | Sistema que consume la API. |
| Posición, fuente, color y tamaño | Plantilla. |
| Texto simple o Markdown | Plantilla. |
| Representación como QR, imagen o fecha | Tipo de componente de la plantilla. |
| Generación del PDF | PDF Server. |
| Guardar en Drive, enviar por correo o registrar en otra base | Sistema consumidor. |

## Conceptos básicos

| Concepto | Ejemplo | Significado |
| --- | --- | --- |
| Plantilla | `Constancia de webinar` | Diseño visual y reglas de presentación. |
| `templateCode` | `constancia_webinar` | Código público que identifica la plantilla. |
| Variable | `{nombre_participante}` | Espacio de texto que recibe un valor. |
| Componente | Texto, QR, imagen o fecha | Define cómo se interpreta y dibuja un valor. |
| `input` | `{ "nombre_participante": "Ana Torres" }` | Valores enviados por la integración. |

El nombre interno de un contenedor pdfme no es lo mismo que una variable. Los contenedores deben ser únicos; una variable puede repetirse en diferentes cajas y páginas.

## Las tres capas de un dato

Este ejemplo muestra un código como texto clicable.

### 1. Contenido de la plantilla

La plantilla fija el texto, el formato Markdown y la parte estable de la URL:

```text
[{codigo_constancia}](https://eventos.miempresa.com/constancias/{codigo_constancia})
```

### 2. Valor enviado por la API

La integración envía únicamente el dato requerido por la expresión:

```json
{
  "codigo_constancia": "WEB-2026-001"
}
```

### 3. Resultado generado

```text
Texto visible: WEB-2026-001
Destino: https://eventos.miempresa.com/constancias/WEB-2026-001
```

No envíes la URL completa dentro de `codigo_constancia`, porque la plantilla ya la construye. Tampoco envíes Markdown, HTML, arreglos serializados ni instrucciones visuales.

## El tipo de componente define el valor

Dos entradas pueden partir del mismo dato de negocio y aun así requerir valores diferentes:

| Clave | Componente en la plantilla | Valor que espera |
| --- | --- | --- |
| `codigo_constancia` | Variable dentro de un enlace Markdown | Solo el código: `WEB-2026-001`. |
| `qr_constancia` | Componente QR llamado `#qr_constancia` | Contenido final del QR: `https://eventos.miempresa.com/validar/WEB-2026-001`. |

PDF Server no convierte automáticamente `codigo_constancia` en la URL de `qr_constancia`. Si la plantilla declara ambas claves, el consumidor debe enviar ambas con el formato que corresponde a cada componente.

## Entradas habituales

| Clave de ejemplo | Tipo en la plantilla | Valor enviado por la API |
| --- | --- | --- |
| `nombre_participante` | Texto simple o variable Markdown | `"ANA TORRES"` |
| `fecha_emision_texto` | Texto | `"22 de julio de 2026"` |
| `horas` | Texto | `"16"` |
| `codigo_constancia` | Texto dentro de enlace Markdown | `"WEB-2026-001"` |
| `qr_constancia` | QR | `"https://eventos.miempresa.com/validar/WEB-2026-001"` |
| `logo` | Imagen | Data URI o URL HTTPS accesible por el backend. |
| `fecha_emision` | Componente de fecha | `"2026-07-22"` |

Consulta siempre las entradas de la plantilla. El nombre de una clave por sí solo no permite deducir su formato.

## Ejemplo completo

Supongamos que la plantilla `constancia_webinar` contiene:

| Elemento | Configuración en la plantilla |
| --- | --- |
| Nombre | `{nombre_participante}` en texto simple. |
| Fecha | `{fecha_emision_texto}` en texto simple. |
| Evento | `{nombre_evento}` en texto simple o Markdown. |
| Enlace | `[{codigo_constancia}](https://eventos.miempresa.com/constancias/{codigo_constancia})` en Markdown. |
| QR | Componente `qrcode` llamado `#qr_constancia`. |
| Logo | Componente `image` llamado `#logo`. |

El sistema consumidor envía:

```json
{
  "templateCode": "constancia_webinar",
  "input": {
    "nombre_participante": "ANA TORRES",
    "nombre_evento": "Webinar de gestión de eventos",
    "fecha_emision_texto": "22 de julio de 2026",
    "codigo_constancia": "WEB-2026-001",
    "qr_constancia": "https://eventos.miempresa.com/validar/WEB-2026-001",
    "logo": "https://assets.miempresa.com/logo-eventos.png"
  }
}
```

Resultado esperado:

| Entrada | Uso final |
| --- | --- |
| `nombre_participante` | Se imprime como texto. |
| `nombre_evento` | Se imprime como nombre del webinar o evento. |
| `fecha_emision_texto` | Se imprime exactamente como fue enviada. |
| `codigo_constancia` | Se muestra como `WEB-2026-001` y forma el destino del enlace. |
| `qr_constancia` | Se codifica dentro del QR. |
| `logo` | Se carga y dibuja como imagen. |

## Piezas de la integración

| Pieza | De dónde sale | Para qué sirve |
| --- | --- | --- |
| API key | Sección **Claves API** | Autoriza las llamadas externas. |
| `templateCode` | Catálogo de plantillas | Identifica la plantilla que se renderizará. |
| Entradas detectadas | **Variables y objetos** o endpoint `/inputs` | Indica las claves y componentes esperados. |
| `input` | Backend consumidor | Proporciona los valores. |
| PDF | `POST /api/v1/render` | Devuelve el documento como `application/pdf`. |

## Flujo recomendado

| Paso | Acción | Resultado |
| --- | --- | --- |
| 1 | Revisar cómo está construida la plantilla. | Entiendes qué representa cada clave. |
| 2 | Crear una API key. | Obtienes una `rawKey` para el backend consumidor. |
| 3 | Consultar `GET /api/v1/templates`. | Obtienes el `templateCode`. |
| 4 | Consultar `GET /api/v1/templates/:code/inputs`. | Obtienes variables y objetos cambiables. |
| 5 | Construir `input` según el tipo de cada componente. | Cada clave contiene el valor correcto. |
| 6 | Llamar `POST /api/v1/render`. | Recibes un PDF binario. |
| 7 | Procesar el PDF en tu sistema. | Guardar, enviar o registrar según tu flujo. |

## URLs de ejemplo

| Entorno | Frontend | Backend API |
| --- | --- | --- |
| Local | `http://localhost:5173` | `http://localhost:4000/api` |
| Producción | `https://pdf.example.com` | `https://pdf.example.com/api` |

En local:

```bash
curl -sS "http://localhost:4000/api/v1/templates" \
  -H "x-api-key: $PDFME_API_KEY"
```

En producción:

```bash
curl -sS "https://pdf.example.com/api/v1/templates" \
  -H "x-api-key: $PDFME_API_KEY"
```

## Límite de responsabilidad

PDF Server termina su trabajo al devolver el PDF:

```text
templateCode + input
        ↓
    PDF Server
        ↓
HTTP 200 + application/pdf + body binario
```

El consumidor decide qué ocurre después:

- Nombre final del archivo.
- Subida a Google Drive u otro almacenamiento.
- Envío por correo.
- Registro en una base de datos externa.
- Reintentos hacia servicios externos.

PDF Server no devuelve estructuras internas de tu aplicación. Si necesitas una URL, un ID externo o un estado de proceso, tu sistema debe crearlo después de recibir y almacenar el PDF.

## Reglas que evitan errores

| Regla | Motivo |
| --- | --- |
| Lee primero la plantilla o consulta `/inputs`. | La clave no revela por sí sola el formato esperado. |
| Envía valores, no instrucciones visuales. | La presentación pertenece a la plantilla. |
| No envíes una URL completa si la plantilla ya la compone. | Evita destinos duplicados o codificados incorrectamente. |
| Para un QR envía el contenido final que debe codificarse. | El componente QR no construye URLs por sí solo. |
| Usa `code` como `templateCode`. | Es el identificador público estable. |
| Llama la API desde un backend. | La API key no debe exponerse al navegador. |
| Procesa el render exitoso como binario. | La respuesta no es JSON ni base64. |

> El contrato externo es `templateCode` más las entradas detectadas en su versión actual. Si cambia una variable, un objeto o su significado, también debe actualizarse la integración.
