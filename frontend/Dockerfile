# syntax=docker/dockerfile:1.7

FROM node:18.20.8-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --loglevel=error

ARG VITE_APP_NAME="PDF Server"
ARG VITE_BACKEND_API_URL=""

ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_BACKEND_API_URL=${VITE_BACKEND_API_URL}

COPY . .
RUN npm run build:docker

FROM nginx:1.27-alpine AS runtime

ENV BACKEND_UPSTREAM=http://127.0.0.1:4000

COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
