# API e integración

Esta página describe cómo un sistema externo consulta plantillas, descubre su contrato de entradas y genera documentos. Incluye la correspondencia entre cada capacidad configurada en el editor y el valor que debe enviarse en `input`.

## Antes de integrar

> La API entrega valores. La plantilla define si esos valores aparecen como texto, Markdown, enlace, QR, imagen, fecha u otro componente.

`input` no es una descripción visual del documento. Cada propiedad debe contener únicamente el valor que espera el componente asociado.

```text
API:       "codigo_constancia": "WEB-2026-001"
Plantilla: [{codigo_constancia}](https://eventos.miempresa.com/constancias/{codigo_constancia})
Resultado: texto WEB-2026-001 con un enlace clicable
```

No envíes una URL completa, Markdown o un objeto especial en `codigo_constancia` si la plantilla ya construye el enlace. Para saber qué enviar, revisa la plantilla y consulta `/api/v1/templates/:code/inputs`.

## Base URL

Todos los endpoints externos usan el prefijo `/api/v1`.

| Entorno | Base de la API | Endpoint de render |
| --- | --- | --- |
| Backend local directo | `http://localhost:4000/api` | `http://localhost:4000/api/v1/render` |
| Aplicación bajo un dominio | `https://pdf.example.com/api` | `https://pdf.example.com/api/v1/render` |
| Producción de ejemplo | `https://pdf.example.com/api` | `https://pdf.example.com/api/v1/render` |

La base debe contener `/api` una sola vez. Si configuras `https://pdf.example.com/api`, no construyas rutas como `/api/api/v1/render`.

## Autenticación

Todos los endpoints `/api/v1/*` requieren:

```http
x-api-key: YOUR_API_KEY
```

La API key se crea en **Claves API** por un usuario con permiso `api_keys.manage`. Guarda la `rawKey` en el backend consumidor o en un gestor de secretos; no la expongas en el navegador.

## Endpoints externos disponibles

| Método | Ruta | Resultado |
| --- | --- | --- |
| `GET` | `/api/v1/templates` | Catálogo de plantillas disponibles. |
| `GET` | `/api/v1/templates/:code/inputs` | Variables y objetos detectados en la versión actual. |
| `POST` | `/api/v1/render` | PDF binario generado con `templateCode` e `input`. |

Estos endpoints usan `x-api-key` y están pensados para aplicaciones externas que solo necesitan consultar contratos y generar PDFs.

## Endpoints internos del panel

Los endpoints internos usan cookie de sesión HTTP-only creada por `/api/auth/login`. No aceptan `x-api-key`; se consumen desde la app administrativa y aplican permisos por rol.

| Área | Método | Ruta | Permiso | Uso |
| --- | --- | --- | --- | --- |
| Sesión | `POST` | `/api/auth/login` | Público | Inicia sesión y crea cookie. |
| Sesión | `POST` | `/api/auth/logout` | Sesión | Cierra sesión. |
| Sesión | `GET` | `/api/auth/me` | Sesión | Devuelve el usuario autenticado. |
| Plantillas | `GET` | `/api/templates` | `templates.view` | Lista plantillas internas con filtros `search` y `tag`. |
| Plantillas | `GET` | `/api/templates/by-code/:code` | `templates.view` | Carga una plantilla completa para editar o previsualizar. |
| Plantillas | `POST` | `/api/templates` | `templates.create` | Crea una plantilla inicial. |
| Plantillas | `POST` | `/api/templates/:id/duplicate` | `templates.create` | Clona plantilla, versión actual, hojas, diseño y etiquetas. |
| Plantillas | `PATCH` | `/api/templates/:id` | `templates.edit` | Actualiza nombre, código y etiquetas. |
| Plantillas | `PATCH` | `/api/templates/:id/page-settings` | `templates.edit` | Guarda formato, orientación, tamaño y `designerJson`. |
| Plantillas | `PATCH` | `/api/templates/:id/schema-locks` | `templates.edit` | Persiste bloqueos de elementos en base de datos. |
| Versiones | `POST` | `/api/templates/:id/versions` | `templates.edit` | Crea una nueva versión desde el diseño actual. |
| Versiones | `PATCH` | `/api/templates/:id/versions/:versionId/current` | `templates.edit` | Marca una versión como actual. |
| Versiones | `DELETE` | `/api/templates/:id/versions/:versionId` | `templates.edit` | Borra una versión y renumera las restantes. |
| Plantillas | `DELETE` | `/api/templates/:id` | `templates.delete` | Elimina una plantilla completa. |
| Etiquetas | `GET` | `/api/tags` | `templates.edit` | Lista etiquetas disponibles. |
| Etiquetas | `POST` | `/api/tags` | `templates.edit` | Crea una etiqueta. |
| Etiquetas | `PATCH` | `/api/tags/:id` | `templates.edit` | Renombra una etiqueta. |
| Etiquetas | `DELETE` | `/api/tags/:id` | `templates.edit` | Elimina una etiqueta. |
| API keys | `GET` | `/api/api-credentials` | `api_keys.manage` | Lista claves API. |
| API keys | `POST` | `/api/api-credentials` | `api_keys.manage` | Crea clave y devuelve `rawKey` una sola vez. |
| API keys | `PATCH` | `/api/api-credentials/:id/disable` | `api_keys.manage` | Deshabilita una clave activa. |
| API keys | `PATCH` | `/api/api-credentials/:id/activate` | `api_keys.manage` | Reactiva una clave no expirada. |
| API keys | `PATCH` | `/api/api-credentials/:id/revoke` | `api_keys.manage` | Revoca/deshabilita una clave. |
| API keys | `DELETE` | `/api/api-credentials/:id` | `api_keys.manage` | Elimina una clave. |
| Usuarios | `GET` | `/api/users` | `users.manage` | Lista usuarios y roles. |
| Usuarios | `POST` | `/api/users` | `users.manage` | Crea usuario. |
| Usuarios | `PATCH` | `/api/users/:id` | `users.manage` | Actualiza usuario, rol, estado o contraseña. |
| Usuarios | `DELETE` | `/api/users/:id` | `users.manage` | Elimina usuario con verificación de contraseña. |
| Permisos | `GET` | `/api/permissions` | `users.manage` | Devuelve matriz de permisos. |
| Permisos | `PATCH` | `/api/roles/:id/permissions` | `users.manage` | Actualiza permisos de un rol. |
| Auditoría | `GET` | `/api/audit-logs` | `audit.view` | Lista eventos de auditoría. |
| Salud | `GET` | `/api/health` | Público | Healthcheck del backend. |

## Flujo recomendado

1. Consulta el catálogo y selecciona el `code` público.
2. Consulta `/inputs` para conocer las claves esperadas.
3. Construye `input` con variables y objetos cambiables.
4. Ejecuta `/render` y procesa la respuesta como PDF binario.
5. Registra los headers de versión si necesitas auditoría.

## Filtros internos de plantillas

El panel usa `/api/templates` para listar plantillas administrables. A diferencia de `/api/v1/templates`, esta ruta usa sesión de usuario y puede recibir filtros.

```http
GET /api/templates?search=webinar&tag=constancias
Cookie: pdfme_session=...
```

| Query | Comportamiento |
| --- | --- |
| `search` | Busca por `name` o `code`, sin distinguir mayúsculas/minúsculas. |
| `tag` | Filtra plantillas que tengan una etiqueta con ese nombre exacto. |

Respuesta:

```json
{
  "data": [
    {
      "id": "cmrpcj5y2000lhzhjmk1w81dp",
      "name": "Constancia Webinar Evento",
      "code": "constancia_webinar",
      "versionNumber": 3,
      "pageCount": 5,
      "tags": ["constancias", "webinar"]
    }
  ]
}
```

El buscador y el filtro por etiqueta del panel consumen esta ruta; no filtran únicamente en memoria local.

## Propiedades internas de plantilla

El panel actualiza nombre, código y etiquetas con `PATCH /api/templates/:id`.

```json
{
  "name": "Constancia Webinar Evento",
  "code": "constancia_webinar",
  "tagNames": ["constancias", "webinar"]
}
```

Reglas:

| Campo | Regla |
| --- | --- |
| `name` | Mínimo 2 caracteres. |
| `code` | Mínimo 3 caracteres, solo `a-z`, números y `_`. |
| `tagNames` | Arreglo de nombres de etiquetas. Si una etiqueta no existe, el servicio la crea/asocia durante la actualización de detalles. |

El botón **Propiedades** de la lista de plantillas abre este mismo flujo para editar datos y etiquetas sin entrar primero al editor.

## Guardado interno del editor

El editor guarda el diseño completo con `PATCH /api/templates/:id/page-settings`.

```json
{
  "pageFormat": "A4",
  "pageOrientation": "LANDSCAPE",
  "pageWidthMm": 297,
  "pageHeightMm": 210,
  "designerJson": {
    "schemas": [
      [
        {
          "name": "d1_nombre_participante",
          "type": "multiVariableText",
          "content": "{nombre_participante}",
          "__isLocked": true
        }
      ]
    ],
    "basePdf": {
      "width": 297,
      "height": 210,
      "padding": [0, 0, 0, 0]
    }
  }
}
```

Este endpoint guarda cambios pendientes de diseño: mover elementos, agregar o eliminar hojas, reordenar hojas, formato, orientación y contenido visual.

## Bloqueos de elementos

El bloqueo de elementos se persiste de forma específica con `PATCH /api/templates/:id/schema-locks`.

```json
{
  "lockedSchemaNames": [
    "0::fondo_constancia",
    "1::firma_director",
    "2::qr_constancia"
  ]
}
```

Formato de cada lock key:

| Parte | Ejemplo | Significado |
| --- | --- | --- |
| Índice de hoja | `0` | Hoja interna base cero. La hoja visible 1 es índice 0. |
| Separador | `::` | Separador fijo. |
| Nombre de schema | `qr_constancia` | `schema.name` del elemento dentro de pdfme. |

Comportamiento:

- El backend actualiza `__isLocked` dentro del `designerJson` de la versión actual.
- El bloqueo queda guardado en base de datos, no solo en estado local del navegador.
- Un elemento bloqueado no debe entrar en selección múltiple por arrastre en el editor.
- El bloqueo no cambia el contrato externo: variables y objetos siguen renderizando por API.

## Versiones internas

Las versiones viven dentro de una plantilla y una sola versión queda marcada como actual.

| Acción | Endpoint | Resultado |
| --- | --- | --- |
| Crear versión | `POST /api/templates/:id/versions` | Crea una copia versionada del diseño actual. |
| Cambiar actual | `PATCH /api/templates/:id/versions/:versionId/current` | Marca esa versión como usada por editor y render. |
| Borrar versión | `DELETE /api/templates/:id/versions/:versionId` | Borra una versión si no es la única. |

Reglas al borrar:

- No se puede borrar la única versión de una plantilla.
- Si se borra la versión actual, la versión restante más reciente pasa a ser actual.
- Después de borrar, las versiones se renumeran consecutivamente desde `1`.
- Ejemplo: si existen `v1`, `v2`, `v3` y se elimina `v1`, las restantes pasan a `v1`, `v2`.
- Ejemplo: si existen `v1`, `v2`, `v3` y se elimina `v2`, las restantes pasan a `v1`, `v2`.

## Acciones internas de páginas

Las acciones visuales de página del editor modifican el `designerJson` en memoria y quedan pendientes hasta presionar **Guardar**, excepto los bloqueos que se persisten por su endpoint específico.

| Acción UI | Persistencia |
| --- | --- |
| Insertar página arriba | Pendiente hasta `Guardar`. |
| Insertar página abajo | Pendiente hasta `Guardar`. |
| Eliminar página actual | Pendiente hasta `Guardar`; no se muestra si solo queda una hoja. |
| Mover hoja activa arriba | Pendiente hasta `Guardar`; no se muestra en la primera hoja ni con una sola hoja. |
| Mover hoja activa abajo | Pendiente hasta `Guardar`; no se muestra en la última hoja ni con una sola hoja. |
| Bloquear/desbloquear elemento | Se guarda inmediatamente en base de datos con `/schema-locks`. |

El orden final de las hojas que consume `/render` es el orden guardado en `designerJson` y persistido mediante `/page-settings`.

## Listar plantillas

```http
GET /api/v1/templates
x-api-key: API_KEY
```

```bash
curl -sS "https://pdf.example.com/api/v1/templates" \
  -H "x-api-key: $PDFME_API_KEY"
```

Respuesta `200`:

```json
{
  "data": [
    {
      "id": "cmrpcj5y2000lhzhjmk1w81dp",
      "name": "Constancia Webinar Evento",
      "code": "constancia_webinar",
      "status": "ACTIVE",
      "versionNumber": 3,
      "pageFormat": "A4",
      "pageOrientation": "LANDSCAPE",
      "pageWidthMm": 297,
      "pageHeightMm": 210,
      "tags": ["constancias", "webinar"]
    }
  ]
}
```

| Campo | Uso externo |
| --- | --- |
| `code` | Enviarlo como `templateCode`. |
| `name` | Mostrar al usuario o usarlo como referencia legible. |
| `status` | Preferir `ACTIVE` en producción. |
| `versionNumber` | Registrar la versión disponible. |
| `pageFormat` y `pageOrientation` | Validar el documento esperado. |
| `id` | Solo soporte interno; no usarlo como contrato. |

## TemplateCode

`templateCode` es exactamente el campo público `code`. No es el `id`, el nombre visible ni un slug calculado por el consumidor.

```json
{
  "id": "cmrpcj5y2000lhzhjmk1w81dp",
  "name": "Constancia Webinar Evento",
  "code": "constancia_webinar"
}
```

Request correcto:

```json
{
  "templateCode": "constancia_webinar",
  "input": {}
}
```

## Inspeccionar entradas

```http
GET /api/v1/templates/:code/inputs
x-api-key: API_KEY
```

```bash
curl -sS "https://pdf.example.com/api/v1/templates/constancia_webinar/inputs" \
  -H "x-api-key: $PDFME_API_KEY"
```

Respuesta:

```json
{
  "template": {
    "code": "constancia_webinar",
    "name": "Constancia Webinar Evento",
    "versionNumber": 3,
    "pageCount": 5
  },
  "inputs": {
    "variables": [
      {
        "key": "nombre_participante",
        "schemaNames": ["d1_nombre_participante", "c1_nombre_participante"],
        "pages": [1, 2, 3, 4, 5]
      }
    ],
    "objects": [
      {
        "key": "qr_constancia",
        "type": "qrcode",
        "schemaNames": ["#qr_constancia#1", "#qr_constancia#2"],
        "pages": [1, 2]
      }
    ]
  },
  "conventions": {
    "dynamicObjectPrefix": "#",
    "reusableSuffixes": ["#1", "#2", "__p2", "__p3", "__page2", "_p2", "_page2"],
    "supportedDynamicObjectTypes": ["image", "qrcode", "code128", "date", "dateTime", "time"]
  }
}
```

Para construir `input`, usa únicamente cada `key`. `schemaNames` ayuda a ubicar elementos dentro del editor, pero no es necesario para una integración normal.

Usa `pages` para saber en qué números de hoja aparece cada variable u objeto.

## Tipos de entrada

La clave debe coincidir exactamente con la variable u objeto detectado. El valor requerido depende del componente de la plantilla.

| Clave | Tipo en la plantilla | Valor que envía la API | Ejemplo |
| --- | --- | --- | --- |
| `nombre_participante` | Texto simple o variable Markdown | Texto sin instrucciones visuales. | `"ANA TORRES"` |
| `nro_documento` | Texto | Texto o número convertido a texto. | `"12345678"` |
| `fecha_emision_texto` | Texto | Fecha ya redactada. | `"22 de julio de 2026"` |
| `horas` | Texto | Número convertido a texto. | `"16"` |
| `nombre_evento` | Texto simple o variable Markdown | Nombre del evento o webinar. | `"Webinar de gestión de eventos"` |
| `codigo_constancia` | Variable dentro de enlace Markdown | Solo el código requerido por la expresión. | `"WEB-2026-001"` |
| `url_constancia` | Variable usada como destino completo | URL completa. | `"https://eventos.miempresa.com/constancias/WEB-2026-001"` |
| `qr_constancia` | Objeto `qrcode` | Contenido final que debe codificar el QR. | `"https://eventos.miempresa.com/validar/WEB-2026-001"` |
| `logo` | Objeto `image` | Data URI o URL HTTPS accesible por el backend. | `"data:image/png;base64,..."` |
| `codigo_constancia` | Objeto `code128` | Texto que debe codificar la barra. | `"WEB-2026-001"` |
| `fecha_emision` | Objeto `date` | Fecha en el formato acordado. | `"2026-07-22"` |

### Mismo dato, contratos diferentes

Este payload es válido cuando la plantilla muestra un código enlazado y también contiene un QR:

```json
{
  "codigo_constancia": "WEB-2026-001",
  "qr_constancia": "https://eventos.miempresa.com/validar/WEB-2026-001"
}
```

`codigo_constancia` completa una variable dentro de una expresión Markdown. `qr_constancia` alimenta un componente QR y por eso recibe el contenido final que será codificado. PDF Server no construye uno a partir del otro.

## Texto simple por API

Plantilla:

```text
Se deja constancia que {nombre_participante}, identificado con {tipo_documento}: {nro_documento}
```

Input:

```json
{
  "nombre_participante": "Ana Torres Ramos",
  "tipo_documento": "Documento",
  "nro_documento": "12345678"
}
```

Una misma variable se envía una sola vez. PDF Server aplica el valor a todas las cajas y páginas que la utilicen.

## Markdown controlado por la plantilla

Plantilla en modo `inline-markdown`:

```text
Participó en el **{nombre_evento}** con ***{horas} horas***.
```

Input:

```json
{
  "nombre_evento": "Webinar de gestión de eventos",
  "horas": "64"
}
```

Este es el uso recomendado: el diseño controla los estilos y la API solo entrega datos.

## Valores con caracteres Markdown

Los valores de variables se insertan como texto literal, incluso cuando la caja usa Markdown:

```json
{
  "descripcion": "Texto con **asteriscos**"
}
```

Los asteriscos enviados como parte del valor se imprimen; no convierten ese fragmento en negrita. Esto evita que un nombre o dato externo altere el diseño. Define los estilos alrededor de la variable en la plantilla, por ejemplo `**{descripcion}**`.

## Enlace dinámico

Plantilla:

```text
[{codigo_constancia}](https://eventos.miempresa.com/constancias/{codigo_constancia})
```

Input:

```json
{
  "codigo_constancia": "WEB-2026-001"
}
```

Resultado:

| Texto visible | Destino clicable |
| --- | --- |
| `WEB-2026-001` | `https://eventos.miempresa.com/constancias/WEB-2026-001` |

Cuando una variable está incrustada dentro de una URL mayor, PDF Server codifica el segmento para evitar caracteres inválidos. Si la URL completa llega en una sola variable, usa `[Abrir]({url_ficha})`.

### Errores frecuentes con enlaces

Si la plantilla ya contiene `https://eventos.miempresa.com/constancias/`, esto es incorrecto:

```json
{
  "codigo_constancia": "https://eventos.miempresa.com/constancias/WEB-2026-001"
}
```

La URL completa se usaría como si fuera el código y el destino quedaría duplicado o codificado dentro de la ruta.

También es incorrecto enviar una estructura inventada:

```json
{
  "codigo_constancia": "[[\"WEB-2026-001\",\"https://eventos.miempresa.com/constancias/WEB-2026-001\"]]"
}
```

Los valores de variables se tratan como texto literal. La API no interpreta arreglos serializados, HTML ni Markdown enviado dentro del valor.

## QR repetido en varias páginas

Plantilla:

```text
Página 1: #qr_constancia#1
Página 2: #qr_constancia#2
Página 3: #qr_constancia__p3
```

Input único:

```json
{
  "qr_constancia": "https://eventos.miempresa.com/validar/WEB-2026-001"
}
```

El mismo contenido se aplica a todos los objetos cuyo nombre se normaliza a `qr_constancia`.

## Imagen dinámica

Input recomendado:

```json
{
  "logo": "data:image/png;base64,iVBORw0KGgoAAA..."
}
```

También puede usarse una URL accesible para el backend, pero el render dependerá de la red y disponibilidad del servidor remoto. Para documentos críticos, prefiere Data URI.

## Fechas y horas

```json
{
  "fecha_emision": "2026-07-22",
  "fecha_hora_emision": "2026-07-22T15:30:00-05:00",
  "hora_emision": "15:30",
  "fecha_emision_texto": "22 de julio de 2026"
}
```

Los tres primeros valores alimentan objetos `date`, `dateTime` y `time`. El último alimenta una variable de texto y es la opción adecuada cuando el sistema consumidor controla la redacción final.

## Valores faltantes y adicionales

| Caso | Comportamiento |
| --- | --- |
| Falta una variable detectada | `400` con `missingVariables`. |
| Variable con `null` | Se considera faltante. |
| Variable con cadena vacía | Se considera faltante. |
| Falta un objeto `#...` | El objeto conserva su contenido predeterminado o queda según la plantilla. |
| Se envía una clave que no coincide con variable, objeto ni contenedor | No modifica la plantilla. |
| Se repite una clave en varias páginas | El mismo valor se aplica en todas. |

Todas las variables `{...}` detectadas se validan como requeridas. Consulta `/inputs` antes de renderizar y no envíes valores vacíos.

La validación usa el comportamiento real del servidor:

- Una variable ausente, `null` o `""` produce `400`.
- Una variable adicional no usada se ignora.
- Un objeto dinámico ausente no forma parte de `missingVariables`.
- Una misma clave se aplica en todos los elementos y páginas donde fue declarada.

## Reemplazo directo por nombre interno

Por compatibilidad, el backend puede recibir una propiedad que coincida exactamente con el nombre de un contenedor. No se recomienda como contrato externo porque esos nombres son internos, deben ser únicos y pueden cambiar al duplicar o reorganizar la plantilla.

Usa variables `{clave}` para textos y nombres `#clave` para objetos. Así `/inputs` puede descubrir el contrato y una sola clave puede reutilizarse en varias páginas.

## Renderizar un PDF

```http
POST /api/v1/render
x-api-key: API_KEY
Content-Type: application/json
Accept: application/pdf
```

Request completo:

```json
{
  "templateCode": "constancia_webinar",
  "input": {
    "nombre_participante": "Ana Torres Ramos",
    "tipo_documento": "Documento",
    "nro_documento": "12345678",
    "nombre_evento": "Webinar de gestión de eventos",
    "horas": "64",
    "codigo_constancia": "WEB-2026-001",
    "qr_constancia": "https://eventos.miempresa.com/validar/WEB-2026-001",
    "fecha_emision_texto": "22 de julio de 2026"
  },
  "pages": [1, 2, 3, 4],
  "ignorePages": [3]
}
```

`pages` e `ignorePages` son opcionales y aceptan números de hoja. Si no envías ninguno, se renderizan todas las hojas.

| Campo | Comportamiento |
| --- | --- |
| `pages` | Limita el PDF a esas hojas. Ejemplo: `[1, 2, 4]` devuelve solo esas hojas. |
| `ignorePages` | Excluye hojas del resultado. Ejemplo: `[3, 5]` omite esas hojas. |
| Ambos juntos | Primero se aplica `pages` y luego `ignorePages`. Ejemplo: `pages: [1, 2, 3]` con `ignorePages: [2]` devuelve hojas `1` y `3`. |

Si envías una hoja inexistente, o la combinación deja el PDF sin hojas, la API responde `400`.

Las variables requeridas se validan después de aplicar esta selección. Si una variable existe solo en una hoja que no se va a devolver, no será requerida para ese render.

Respuesta exitosa:

| Propiedad | Valor |
| --- | --- |
| Estado HTTP | `200 OK` |
| `Content-Type` | `application/pdf` |
| Body | PDF binario directo |
| Base64 | No |
| JSON con URL | No |

Headers útiles:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="constancia_webinar-v3.pdf"
X-Template-Code: constancia_webinar
X-Template-Version: 3
X-Template-Selected-Pages: 1,2,3,4
X-Template-Rendered-Pages: 3
X-Template-Ignored-Pages: 3
```

## curl y Postman

```bash
curl -X POST "https://pdf.example.com/api/v1/render" \
  -H "x-api-key: $PDFME_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/pdf" \
  -d '{
    "templateCode": "constancia_webinar",
    "input": {
      "nombre_participante": "Ana Torres Ramos",
      "tipo_documento": "Documento",
      "nro_documento": "12345678",
      "nombre_evento": "Webinar de gestión de eventos",
      "codigo_constancia": "WEB-2026-001",
      "qr_constancia": "https://eventos.miempresa.com/validar/WEB-2026-001"
    }
  }' \
  --output constancia-webinar.pdf
```

En Postman selecciona **Send and Download**. La respuesta no debe visualizarse como JSON o texto.

## Node.js

```js
import fs from 'node:fs';

const apiKey = process.env.PDFME_API_KEY;

if (!apiKey) {
  throw new Error('PDFME_API_KEY no está configurada');
}

const response = await fetch('https://pdf.example.com/api/v1/render', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/pdf',
  },
  body: JSON.stringify({
    templateCode: 'constancia_webinar',
    input: {
      nombre_participante: 'Ana Torres Ramos',
      tipo_documento: 'Documento',
      nro_documento: '12345678',
      nombre_evento: 'Webinar de gestión de eventos',
      codigo_constancia: 'WEB-2026-001',
      qr_constancia: 'https://eventos.miempresa.com/validar/WEB-2026-001',
    },
  }),
});

if (!response.ok) {
  const error = await response.json().catch(() => ({}));
  throw new Error(error.message ?? `PDF Server respondió ${response.status}`);
}

const pdf = Buffer.from(await response.arrayBuffer());
fs.writeFileSync('constancia-webinar.pdf', pdf);
```

## Integración HTTP desde otra aplicación

Cualquier aplicación backend o herramienta de automatización puede consumir `/render` con el mismo flujo:

```text
Evento, formulario o proceso interno
  -> construir headers y payload
  -> POST /api/v1/render
  -> recibir buffer PDF
  -> guardar, enviar o registrar el documento
```

Ejemplo de función reutilizable:

```js
export async function renderConstanciaWebinar(source) {
  const response = await fetch(`${process.env.PDFME_API_URL}/v1/render`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.PDFME_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/pdf',
    },
    body: JSON.stringify({
      templateCode: 'constancia_webinar',
      input: {
        nombre_participante: source.nombre_participante,
        tipo_documento: source.tipo_documento,
        nro_documento: source.nro_documento,
        nombre_evento: source.nombre_evento,
        codigo_constancia: source.codigo_constancia,
        qr_constancia: source.qr_constancia,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? `PDF Server respondió ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
```

El request debe cumplir:

| Opción | Valor |
| --- | --- |
| Método | `POST`. |
| URL | `/api/v1/render`. |
| Payload | JSON con `templateCode`, `input`, `pages` opcional e `ignorePages` opcional. |
| Respuesta esperada | Buffer binario del PDF. |

Una respuesta correcta cumple:

```js
response.status === 200;
response.headers.get('content-type').includes('application/pdf');
```

No ejecutes `JSON.parse(...)` cuando el estado sea `200`: la respuesta es el archivo PDF binario. Solo los errores se procesan como JSON.

Nunca incluyas una API key real directamente en el código, capturas o repositorios. Si una clave fue publicada, revócala y genera otra.

## Responsabilidad después del render

PDF Server responde únicamente con el documento:

```text
POST /api/v1/render -> HTTP 200 -> Buffer PDF
```

Estas acciones pertenecen al sistema consumidor:

| Acción posterior | Responsable |
| --- | --- |
| Elegir el nombre definitivo | Integración. |
| Guardar en disco o nube | Integración. |
| Subir a Google Drive | Integración. |
| Enviar por correo | Integración. |
| Guardar una URL o ID externo | Integración. |

PDF Server no devuelve estructuras internas de tu aplicación. Si tu sistema necesita guardar una URL, un ID externo o un estado de proceso, debe crearlo después de recibir y almacenar el PDF.

## Google Drive

El resultado de `/render` se entrega directamente al cliente de Drive:

```text
PDF Server -> Buffer PDF -> Google Drive upload
```

```js
import { Readable } from 'node:stream';

const pdfBuffer = Buffer.from(await response.arrayBuffer());

await drive.files.create({
  requestBody: {
    name: 'constancia-webinar.pdf',
    mimeType: 'application/pdf',
  },
  media: {
    mimeType: 'application/pdf',
    body: Readable.from(pdfBuffer),
  },
});
```

## Estados de plantilla

| Estado | Render externo | Uso |
| --- | --- | --- |
| `DRAFT` | Sí, si tiene versión actual válida. | Pruebas controladas. |
| `ACTIVE` | Sí. | Producción. |
| `ARCHIVED` | No; responde como no encontrada. | Retiro de una plantilla. |

El render usa la versión marcada como actual. Registra `X-Template-Version` para conocer qué versión produjo cada archivo.

## Errores principales

| Código | Causa habitual | Acción |
| --- | --- | --- |
| `400` | Payload inválido o variables faltantes. | Validar JSON y consultar `/inputs`. |
| `401` | API key ausente, inválida, expirada o restringida. | Revisar `x-api-key` y estado de la clave. |
| `404` | `templateCode` incorrecto, archivado o sin versión actual. | Consultar el catálogo. |
| `500` | Fallo durante la generación. | Registrar el mensaje y revisar logs si persiste. |
| `502` | El proxy no alcanza al servicio. | Revisar dominio, upstream, puerto y contenedores. |

El detalle operativo y las estrategias de reintento están en **Errores y operación**.

## Contexto público para herramientas

```http
GET /api/mcp/context
```

Este recurso resume endpoints, autenticación y convenciones sin exponer API keys, usuarios, plantillas privadas ni documentos generados. Sirve como contexto de integración para asistentes y herramientas automatizadas; no reemplaza la autenticación de `/api/v1/*`.
