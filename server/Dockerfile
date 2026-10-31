# PolitiGo API: plain Node, no npm dependency, running as the unprivileged "node" user.
# Pinned by digest (Dependabot proposes updates): a re-pushed tag cannot change what gets built.
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
# Node's package managers are never used here (no npm dependency): removed, less code an intruder could run.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn*  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production NODE_NO_WARNINGS=1 TZ=Europe/Paris PORT=3000 DB_PATH=/data/politigo.db
WORKDIR /app
COPY web/rules.mjs server/server.mjs server/admin.mjs server/push.mjs server/chat.mjs ./
# The volumes inherit this ownership the first time they are created (/run/politigo: the admin socket, shared with
# the optional admin container).
RUN mkdir -p /data /run/politigo && chown node:node /data /run/politigo
USER node
# Set by the image workflow from git describe ("v1.2.1"); a local build is "dev". Late, so it never busts the cache above.
ARG VERSION=dev
ENV POLITIGO_VERSION=$VERSION
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node","server.mjs"]
