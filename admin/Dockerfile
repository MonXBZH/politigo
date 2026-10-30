# PolitiGo admin interface (optional): plain Node, no npm dependency, running as the unprivileged "node" user.
# It only talks to the API's admin socket(s), shared through a named volume mounted at /run/politigo.
FROM node:24-alpine
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
