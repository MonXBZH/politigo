# PolitiGo admin interface (optional): plain Node, no npm dependency, running as the unprivileged "node" user.
# It only talks to the API's admin socket(s), shared through a named volume mounted at /run/politigo.
# Pinned by digest (Dependabot proposes updates): a re-pushed tag cannot change what gets built.
FROM node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94
# Node's package managers are never used here (no npm dependency): removed, less code an intruder could run.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn*  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production NODE_NO_WARNINGS=1 TZ=Europe/Paris PORT=8090 POLITIGO_ADMIN_SOCKET=/run/politigo/admin.sock ADMIN_DATA=/data-admin
WORKDIR /app
COPY admin/server.mjs ./
COPY admin/ui/ ./ui/
# The volumes inherit this ownership the first time they are created (socket directory, generated password hash).
RUN mkdir -p /run/politigo /data-admin && chown node:node /run/politigo /data-admin && chmod 0700 /data-admin
USER node
VOLUME /data-admin
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=6s --retries=3 CMD node -e "fetch('http://127.0.0.1:8090/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node","server.mjs"]
