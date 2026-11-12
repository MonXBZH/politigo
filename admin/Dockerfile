# PolitiGo admin interface (optional): plain Node, no npm dependency, running as the unprivileged "node" user.
# It talks to the API's admin socket(s), shared through a named volume mounted at /run/politigo, and to the extra
# games (parties) that connect to its link port over TLS (admin/link.mjs).
# Pinned by digest (Dependabot proposes updates): a re-pushed tag cannot change what gets built.
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
# Node's package managers are never used here (no npm dependency): removed, less code an intruder could run.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn*  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production NODE_NO_WARNINGS=1 TZ=Europe/Paris PORT=8090 POLITIGO_ADMIN_SOCKET=/run/politigo/admin.sock ADMIN_DATA=/data-admin
WORKDIR /app
COPY admin/server.mjs admin/backups.mjs admin/verify.mjs admin/link.mjs ./
COPY admin/ui/ ./ui/
# The volumes inherit this ownership the first time they are created (socket directory, generated password hash).
# /data-admin/link: the link's key and certificate (POLITIGO_ADMIN_LINK=on), and the backups the network parties stream.
RUN mkdir -p /run/politigo /data-admin/link && chown node:node /run/politigo /data-admin /data-admin/link && chmod 0700 /data-admin /data-admin/link
USER node
VOLUME /data-admin
# 8091: the link the network parties connect to (TLS), open only with POLITIGO_ADMIN_LINK=on.
EXPOSE 8090 8091
HEALTHCHECK --interval=30s --timeout=6s --retries=3 CMD node -e "fetch('http://127.0.0.1:8090/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node","server.mjs"]
