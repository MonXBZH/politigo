# PolitiGo API: plain Node, no npm dependency, running as the unprivileged "node" user.
FROM node:24-alpine
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
