# Autenticación

La API externa usa autenticación por header. Cada sistema consumidor debe tener su propia API key para facilitar auditoría, rotación y revocación sin afectar a otros clientes.

## Header requerido

```http
x-api-key: pk_live_xxxxxxxxxxxxxxxxx
```

El header debe enviarse en todos los endpoints `/api/v1/*`.

## Cómo obtener una API key

La clave se crea desde la aplicación de administración. El usuario debe tener permiso para gestionar credenciales externas.

| Paso | Acción | Requisito |
| --- | --- | --- |
| 1 | Iniciar sesión en `http://localhost:5173` o en el dominio publicado. | Usuario activo. |
| 2 | Entrar a `Claves API`. | Permiso `api_keys.manage`. |
| 3 | Crear una clave para el sistema consumidor. | Nombre descriptivo por sistema o ambiente. |
| 4 | Copiar la `rawKey` mostrada al crearla. | Se muestra una sola vez. |
| 5 | Guardarla en el backend consumidor como secreto. | Variable de entorno o secret manager. |

Ejemplo de nombres recomendados:

| Sistema consumidor | Nombre sugerido |
| --- | --- |
| Portal de eventos en desarrollo | `eventos-dev` |
| Portal de eventos en producción | `eventos-prod` |
| Worker de constancias | `constancias-worker-prod` |

## Almacenamiento seguro

| Entorno | Recomendación |
| --- | --- |
| Backend Node.js | Variable de entorno o gestor de secretos. |
| Worker/Job | Secret del proveedor de ejecución. |
| CI/CD | Secret cifrado del pipeline. |
| Frontend público | No almacenar API keys externas. |
| Logs | Registrar solo prefijo o alias, nunca la clave completa. |

## Rotación de claves

1. Crea una clave nueva para el mismo sistema consumidor.
2. Actualiza el secreto en el sistema externo.
3. Despliega o reinicia el servicio consumidor.
4. Verifica `GET /api/v1/templates` con la clave nueva.
5. Deshabilita o revoca la clave anterior.

## Estados de una clave

| Estado | Puede autenticar | Uso recomendado |
| --- | --- | --- |
| Activa | Sí | Operación normal. |
| Deshabilitada | No | Pausa temporal o investigación. |
| Revocada | No | Exposición confirmada o baja definitiva. |
| Expirada | No | Control automático por fecha. |

## Restricción por origen

Si la clave tiene `allowedOrigins`, PDF Server valida el header `Origin` del request. Esta restricción ayuda en escenarios controlados, pero no reemplaza el almacenamiento seguro de la clave.

| Caso | Resultado esperado |
| --- | --- |
| Origen permitido | Request continúa. |
| Origen no permitido | `401` con `API key invalida.` |
| Sin `Origin` y clave restringida | Puede ser rechazado según configuración. |

## Acceso a la documentación

Las rutas `/documentation/*` son públicas y no requieren sesión ni API key. Puedes compartir directamente la URL de cualquier sección, por ejemplo `/documentation/api`.

Este acceso público solo incluye el contenido estático de la documentación. Las plantillas reales, claves API, usuarios, auditoría y documentos generados mantienen su autenticación correspondiente.

## Ejemplo con variables de entorno

```ts
const PDFME_API_URL = process.env.PDFME_API_URL ?? 'http://localhost:4000/api';
const PDFME_API_KEY = process.env.PDFME_API_KEY ?? '';

export function pdfmeHeaders() {
  return {
    'content-type': 'application/json',
    'x-api-key': PDFME_API_KEY,
  };
}
```

## Diagnóstico de `401`

| Verificación | Detalle |
| --- | --- |
| Header correcto | Debe llamarse `x-api-key`. |
| Clave completa | Usa la `rawKey`, no el prefijo visible. |
| Estado activo | La clave no debe estar deshabilitada o revocada. |
| Fecha vigente | La clave no debe estar expirada. |
| Origen permitido | El `Origin` debe coincidir con la configuración. |
