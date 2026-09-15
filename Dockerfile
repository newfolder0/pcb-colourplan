# Multi-stage build: compile the static bundle, then serve it with Caddy
# (automatic HTTPS). Design data never touches a server; the only server-side
# piece is the optional telemetry collector (see docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Telemetry + consent wall toggle. Default empty = OFF: no wall, no /collect
# calls - the fully-local self-hosted instance. The hosted build passes
# --build-arg VITE_TELEMETRY_ENDPOINT=/collect (its deploy compose sets it).
ARG VITE_TELEMETRY_ENDPOINT=
ENV VITE_TELEMETRY_ENDPOINT=$VITE_TELEMETRY_ENDPOINT
# Operator identity shown in the disclaimer / privacy notice (optional). Empty by
# default so the open-source image ships with no operator contact details; the
# hosted build supplies them via .env -> docker-compose build args.
ARG VITE_CONTACT_EMAIL=
ENV VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
ARG VITE_DATA_CONTROLLER=
ENV VITE_DATA_CONTROLLER=$VITE_DATA_CONTROLLER
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
