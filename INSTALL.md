# Instalacion y despliegue

Esta guia cubre desarrollo local y despliegue en Dokploy usando los Dockerfiles separados de `backend/` y `frontend/`.

## Requisitos

- Node.js `>=18.20.8`.
- npm.
- PostgreSQL.
- Docker si vas a desplegar con Dokploy.

## Desarrollo local

1. Copia variables de entorno:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Ajusta `backend/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
API_PORT=4000
WEB_APP_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=change-this-admin-password
AUTH_SECRET=generate-a-long-random-auth-secret-of-at-least-32-chars
AUTH_COOKIE_NAME=pdfme_server_session
AUTH_COOKIE_MAX_AGE_SECONDS=43200
API_KEY_SECRET=generate-a-long-random-api-key-secret-of-at-least-32-chars
```

3. Ajusta `frontend/.env`:

```env
VITE_APP_NAME=PDF Server
VITE_BACKEND_API_URL=http://localhost:4000
```

4. Prepara backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

5. Levanta frontend en otra terminal:

```bash
cd frontend
npm install
npm run dev
```

URLs locales:

| Servicio | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:4000/api` |
| Health check | `http://localhost:4000/api/health` |

## Despliegue en Dokploy

El despliegue recomendado usa tres recursos separados:

| Recurso | Tipo | Origen |
| --- | --- | --- |
| PostgreSQL | Database | Servicio PostgreSQL administrado por Dokploy. |
| Backend | Application | `backend/Dockerfile`. |
| Frontend | Application | `frontend/Dockerfile`. |

### 1. PostgreSQL

Crea una base PostgreSQL en Dokploy y conserva su connection string. El backend la usara en `DATABASE_URL`.

### 2. Backend

Crea una aplicacion para el backend con estos valores:

| Campo | Valor |
| --- | --- |
| Build context | `backend` |
| Dockerfile | `backend/Dockerfile` |
| Puerto interno | `4000` |
| Health check | `/api/health` |

Variables del backend:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
API_PORT=4000
WEB_APP_URL=https://tu-dominio.com
CORS_ALLOWED_ORIGINS=https://tu-dominio.com
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=change-this-admin-password
AUTH_SECRET=generate-a-long-random-auth-secret-of-at-least-32-chars
AUTH_COOKIE_NAME=pdfme_server_session
AUTH_COOKIE_MAX_AGE_SECONDS=43200
API_KEY_SECRET=generate-a-long-random-api-key-secret-of-at-least-32-chars
```

Antes del primer arranque productivo aplica el schema y el seed contra la base de datos de produccion. Ejecutalo desde tu maquina o desde un job que tenga las dependencias de desarrollo del backend instaladas:

```bash
cd backend
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE" npm run prisma:push
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE" \
INITIAL_ADMIN_EMAIL="admin@example.com" \
INITIAL_ADMIN_PASSWORD="change-this-admin-password" \
npm run prisma:seed
```

El contenedor final del backend esta optimizado para runtime, por eso no depende de ejecutar Prisma CLI en cada arranque.

### 3. Frontend

Crea una aplicacion para el frontend con estos valores:

| Campo | Valor |
| --- | --- |
| Build context | `frontend` |
| Dockerfile | `frontend/Dockerfile` |
| Puerto interno | `80` |
| Health check | `/healthz` |

Build args del frontend:

```env
VITE_APP_NAME=PDF Server
VITE_BACKEND_API_URL=
```

Durante el build de Dokploy, el frontend aplica el injector de pdfme automáticamente:

```txt
frontend/scripts/patch-pdfme-ui.mjs
```

El Dockerfile copia `scripts/` antes de `npm ci` para que `postinstall` pueda parchear `@pdfme/ui`. Además, `npm run build:docker` vuelve a ejecutar `npm run patch:pdfme-ui` antes de `vite build`. Esto asegura que los fixes de copiar/pegar, bloqueo por selección, filas del sidebar y controles de páginas estén presentes también en producción.

Variables runtime del frontend:

```env
BACKEND_UPSTREAM=https://backend-tu-app.dokploy.internal
```

Configura `BACKEND_UPSTREAM` manualmente en Dokploy. Usa la URL interna que Dokploy asigne al backend. Si no tienes URL interna disponible, usa la URL publica del backend sin `/api` al final. No uses `http://backend:4000` cuando backend y frontend estan desplegados como aplicaciones separadas, porque ese hostname solo existe dentro de un mismo Docker Compose.

`VITE_BACKEND_API_URL` es una variable de build. Para un solo dominio dejala vacia, porque el frontend llamara a `/api/...` en el mismo dominio y Nginx lo enviara a `BACKEND_UPSTREAM`. Si apuntas directo al backend en desarrollo, usa solo el origen: `http://localhost:4000`, no `http://localhost:4000/api`.

### 4. Rutas bajo un solo dominio

Para usar un solo dominio, publica el frontend como entrada principal. El Nginx del frontend sirve la app y redirige `/api/` hacia `BACKEND_UPSTREAM`.

Configuracion esperada:

| Ruta publica | Destino |
| --- | --- |
| `/` | Frontend React. |
| `/documentation/*` | Documentacion dentro del frontend. |
| `/api/*` | Backend Express via proxy Nginx. |

## Verificacion

Despues del despliegue revisa:

```txt
https://tu-dominio.com/healthz
https://tu-dominio.com/api/health
https://tu-dominio.com/documentation/getting-started
```

Si `/api/health` falla desde el dominio pero funciona en el backend, revisa `BACKEND_UPSTREAM` en el frontend.
