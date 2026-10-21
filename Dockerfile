# syntax=docker/dockerfile:1
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim AS runtime
ARG GH_VERSION=2.62.0
ARG GH_SHA256_AMD64=41c8b0698ad3003cb5c44bde672a1ffd5f818595abd80162fbf8cc999418446a
ARG GH_SHA256_ARM64=a165413209aab98bfb1db9629b97bc9c59778d38bb7378a33a0363cf822e7965
ARG CLAUDE_CODE_VERSION=2.1.306
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl \
    && arch="$(dpkg --print-architecture)" \
    && if [ "$arch" = "arm64" ]; then sha="$GH_SHA256_ARM64"; else sha="$GH_SHA256_AMD64"; fi \
    && curl -fsSL -o /tmp/gh.tgz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${arch}.tar.gz" \
    && echo "${sha}  /tmp/gh.tgz" | sha256sum -c - \
    && tar -xzf /tmp/gh.tgz -C /tmp \
    && install -m 0755 "/tmp/gh_${GH_VERSION}_linux_${arch}/bin/gh" /usr/local/bin/gh \
    && rm -rf /tmp/gh* /var/lib/apt/lists/* \
    && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    && npm cache clean --force \
    && apt-get purge -y curl && apt-get autoremove -y
RUN groupadd -g 10001 scanner && useradd -u 10001 -g 10001 -m -s /usr/sbin/nologin scanner \
    && mkdir -p /data /shared && chown 10001:10001 /data /shared
WORKDIR /app
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --from=build --chown=10001:10001 /app/prompts ./prompts
COPY --from=build --chown=10001:10001 /app/content ./content
ENV NODE_ENV=production \
    SCANNER_DATA_DIR=/data \
    DISABLE_TELEMETRY=1 \
    DISABLE_ERROR_REPORTING=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    GH_TELEMETRY=0 \
    GH_NO_UPDATE_NOTIFIER=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NO_UPDATE_NOTIFIER=1 \
    DO_NOT_TRACK=1
USER 10001
EXPOSE 8417
CMD ["node", "dist/index.js"]
