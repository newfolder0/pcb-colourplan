# Dependency-free Node telemetry collector. No npm install - the server uses
# only the Node standard library, keeping the supply chain and image minimal.
FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
ENV PORT=8081 DATA_DIR=/app/data
EXPOSE 8081
# Create the data dir owned by the non-root `node` user BEFORE it becomes a
# volume mount-point, so a fresh named volume inherits node ownership and the
# collector (which runs as `node`) can write to it.
RUN mkdir -p /app/data && chown -R node:node /app
# Run as the non-root user shipped in the node image.
USER node
CMD ["node", "server.mjs"]
