# Multi-stage build: compile the static bundle, then serve it with Caddy
# (automatic HTTPS). Design data never touches a server; the only server-side
# piece is the optional telemetry collector (see docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Telemetry + consent wall toggle. Default '/collect' = the hosted build.
# Build with --build-arg VITE_TELEMETRY_ENDPOINT="" for a telemetry-free,
# wall-free, fully-local self-hosted instance.
ARG VITE_TELEMETRY_ENDPOINT=/collect
ENV VITE_TELEMETRY_ENDPOINT=$VITE_TELEMETRY_ENDPOINT
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
