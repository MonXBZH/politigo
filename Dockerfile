# Unprivileged variant: nginx runs as uid 101 and listens on 8080, never as root.
# Pinned by digest (Dependabot proposes updates): a re-pushed tag cannot change what gets built.
FROM nginxinc/nginx-unprivileged:1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 web/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
