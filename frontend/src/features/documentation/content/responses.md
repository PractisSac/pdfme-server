# Errores y operacion

La API usa JSON para consultas y errores. El render exitoso es la excepcion: devuelve el PDF binario directamente.

## Respuesta exitosa de render

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="constancia_webinar-v3.pdf"
X-Template-Code: constancia_webinar
X-Template-Version: 3
X-Template-Selected-Pages: 1,2,3,4
X-Template-Rendered-Pages: 3
X-Template-Ignored-Pages: 3
```

Body:

```text
(binary PDF)
```

No se devuelve base64. No se devuelve JSON con URL. El cliente debe leer el body como binario, buffer, blob o stream segun su plataforma.

## Formato de error

Los errores validados devuelven JSON. Segun la ruta, el payload puede incluir `ok: false`.

```json
{
  "ok": false,
  "message": "No se encontro la plantilla solicitada."
}
```

Cuando faltan variables de texto requeridas, tambien se devuelve `missingVariables`:

```json
{
  "ok": false,
  "message": "Faltan variables requeridas para renderizar la plantilla.",
  "missingVariables": ["nombre_participante", "nro_documento"]
}
```

## Codigos HTTP

| Codigo | Significado | Cuando ocurre | Como solucionarlo |
| --- | --- | --- | --- |
| `400` | Request invalido. | JSON mal formado, falta `templateCode`, `input` no es objeto, faltan variables requeridas, `pages`/`ignorePages` contienen hojas invalidas o la seleccion queda vacia. | Validar el payload y consultar `/api/v1/templates/:code/inputs`. |
| `401` | No autenticado. | Falta `x-api-key` o la clave es invalida, expirada o no cumple origen permitido. | Enviar la `rawKey` completa en el header correcto y revisar estado/expiracion. |
| `403` | Acceso denegado por politica externa. | Proxy, firewall, WAF o regla de infraestructura bloquea la solicitud. | Revisar reglas del dominio, Cloudflare, CORS/proxy y origen del request. |
| `404` | Recurso no encontrado. | `templateCode` inexistente, plantilla archivada o sin version actual disponible. | Usar `/api/v1/templates`, confirmar `code` y activar/versionar la plantilla. |
| `500` | Error interno. | Fallo no esperado durante render, generacion PDF, base de datos o assets. | Reintentar con backoff y revisar logs del backend si persiste. |
| `502` | Bad gateway. | El proxy o Cloudflare no pudo conectar con frontend/backend, o upstream mal configurado. | Verificar contenedor activo, puerto, healthcheck, DNS interno y configuracion de proxy. |

## `400` payload invalido

```json
{
  "message": "Payload invalido para renderizar."
}
```

Forma minima esperada:

```json
{
  "templateCode": "constancia_webinar",
  "input": {},
  "pages": [1, 2, 3, 4],
  "ignorePages": [3]
}
```

## `400` variables faltantes

```json
{
  "ok": false,
  "message": "Faltan variables requeridas para renderizar la plantilla.",
  "missingVariables": ["nombre_participante"]
}
```

Acciones:

| Paso | Accion |
| --- | --- |
| 1 | Consultar `GET /api/v1/templates/:code/inputs`. |
| 2 | Completar todas las variables de texto requeridas. |
| 3 | No enviar valores vacios si el campo debe imprimirse. |
| 4 | Reintentar el render. |

## `401` API key invalida

```json
{
  "message": "API key invalida."
}
```

Revisa:

| Punto | Que confirmar |
| --- | --- |
| Header | Debe llamarse exactamente `x-api-key`. |
| Valor | Debe ser la `rawKey` completa mostrada al crear la clave. |
| Estado | La clave debe estar activa. |
| Expiracion | `expiresAt` no debe estar vencido. |
| Origen | Si hay origenes permitidos, el request debe cumplirlos. |

## `404` plantilla no encontrada

```json
{
  "message": "No se encontro la plantilla solicitada."
}
```

Puede significar:

| Causa | Validacion |
| --- | --- |
| `templateCode` incorrecto | Comparar contra `code` en `/api/v1/templates`. |
| Se envio `id` o `name` | Enviar solo `code`. |
| Plantilla archivada | Restaurar o usar otra plantilla. |
| No hay version actual | Revisar publicacion/versionado en la app. |

## `502` en despliegues

`502` normalmente no lo genera el codigo de render. Lo produce el proxy cuando no puede llegar al servicio.

| Sintoma | Causa probable |
| --- | --- |
| `host not found in upstream "backend"` | Nginx apunta a un hostname que no existe en la red del despliegue. |
| `/api/api/auth/login` | La URL base del frontend ya incluye `/api` y el cliente agrego otro `/api`. |
| Cloudflare 502 | El host origen no responde o el proxy esta apuntando al puerto equivocado. |
| Backend responde, frontend no | Revisar nginx del frontend y variable de URL/proxy usada en build. |

## Errores internos del panel

Los endpoints internos del panel usan sesión por cookie y permisos. Si una ruta interna falla, normalmente responde JSON con `message`.

| Endpoint | Código | Causa habitual | Acción |
| --- | --- | --- | --- |
| `GET /api/templates?search=&tag=` | `401` | Sesión expirada. | Volver a iniciar sesión. |
| `GET /api/templates?search=&tag=` | `403` | El usuario no tiene `templates.view`. | Revisar rol/permisos. |
| `PATCH /api/templates/:id` | `400` | `name`, `code` o `tagNames` inválidos. | Validar datos del formulario de propiedades. |
| `PATCH /api/templates/:id` | `409` | Código duplicado o no actualizable. | Usar otro `code`. |
| `PATCH /api/templates/:id/page-settings` | `400` | Formato, orientación, tamaño o JSON inválido. | Reintentar guardado y revisar el diseño. |
| `PATCH /api/templates/:id/page-settings` | `404` | La plantilla actual no existe. | Recargar lista de plantillas. |
| `PATCH /api/templates/:id/schema-locks` | `400` | `lockedSchemaNames` no es un arreglo de strings. | Enviar keys como `0::nombre_schema`. |
| `PATCH /api/templates/:id/schema-locks` | `404` | No existe plantilla o versión actual. | Recargar la plantilla antes de bloquear. |
| `DELETE /api/templates/:id/versions/:versionId` | `400` | Se intenta borrar la única versión. | Mantener al menos una versión. |
| `DELETE /api/templates/:id/versions/:versionId` | `404` | Versión inexistente o backend sin la ruta actualizada. | Recargar versión/backend y verificar IDs. |
| `DELETE /api/templates/:id` | `404` | Plantilla inexistente. | Recargar catálogo. |

Ejemplo de error al borrar la única versión:

```json
{
  "message": "No se puede eliminar la unica version de la plantilla."
}
```

Ejemplo de error de locks:

```json
{
  "message": "Datos invalidos para guardar los bloqueos."
}
```

Después de borrar una versión correctamente, la respuesta devuelve la plantilla actualizada y las versiones restantes ya renumeradas.

## Logging recomendado

| Dato | Registrar | No registrar |
| --- | --- | --- |
| `templateCode` | Si | No aplica. |
| Codigo HTTP | Si | No aplica. |
| `message` | Si | No aplica. |
| `missingVariables` | Si | No aplica. |
| Version (`x-template-version`) | Si | No aplica. |
| Variables enviadas | Solo si no contienen datos sensibles. | Documentos, emails, telefonos o datos personales si tu politica lo prohibe. |
| API key | Solo alias o prefijo seguro. | Nunca guardar la clave completa. |
| Tiempo de respuesta | Si | No aplica. |

## Reintentos

| Error | Reintentar | Motivo |
| --- | --- | --- |
| `400` | No | El payload debe corregirse. |
| `401` | No | La autenticacion debe corregirse. |
| `403` | No automaticamente | Primero corregir politica/proxy. |
| `404` | No | El codigo o estado de plantilla debe corregirse. |
| Timeout | Si | Puede ser temporal. |
| `500` | Si, pocas veces | Puede ser transitorio. |
| `502` | Si, si el proxy ya fue corregido | Mientras el upstream este mal, todos los reintentos fallaran. |

## Salud del backend

```http
GET /api/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "pdfme-server-backend"
}
```
