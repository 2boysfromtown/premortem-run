FROM mcr.microsoft.com/playwright:v1.61.1-noble

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY --chown=root:root package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=root:root apps/demo-target/package.json apps/demo-target/package.json
RUN pnpm install --frozen-lockfile

COPY --chown=root:root . .
RUN pnpm build:web \
    && mkdir -p /app/.premortem \
    && chown -R pwuser:pwuser /app /home/pwuser

USER pwuser

EXPOSE 4310

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4310/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start:container"]
