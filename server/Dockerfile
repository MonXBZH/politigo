# PolitiGo API: plain Node, no npm dependency, running as the unprivileged "node" user.
FROM node:25-alpine
ENV NODE_ENV=production NODE_NO_WARNINGS=1 TZ=Europe/Paris PORT=3000 DB_PATH=/data/politigo.db
WORKDIR /app
COPY web/rules.mjs server/server.mjs ./
# The volume inherits this ownership the first time it is created.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node","server.mjs"]
