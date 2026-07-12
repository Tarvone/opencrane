# Build stage
FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
# All workspace libs (shared libs + libs/domain/*/main) come in wholesale so the image never
# needs editing when a domain package is added; the root .dockerignore keeps
# node_modules/dist out of the context.
COPY libs libs
COPY apps/clustertenant-operator/scripts apps/clustertenant-operator/scripts
# @opencrane/contracts generates typed clients from BOTH OpenAPI specs (silo + fleet), so the
# fleet spec must be present too even though this is the silo image.
COPY apps/clustertenant-operator/openapi.json apps/clustertenant-operator/openapi.json
COPY apps/fleet-operator/openapi.json apps/fleet-operator/openapi.json
COPY apps/clustertenant-operator/package.json apps/clustertenant-operator/tsconfig.json apps/clustertenant-operator/
COPY apps/clustertenant-operator/prisma apps/clustertenant-operator/prisma
# "pkg..." selects the app plus its full workspace dependency closure.
RUN pnpm install --frozen-lockfile --filter "@opencrane/clustertenant-operator..."

COPY apps/clustertenant-operator/src apps/clustertenant-operator/src
# Build the dependency closure first ("pkg^..." = dependencies only, topological order —
# domain libs DO depend on each other), then the app itself.
RUN pnpm --filter "@opencrane/clustertenant-operator^..." build
RUN pnpm --filter @opencrane/clustertenant-operator build
# Stage generated Prisma client to a fixed path for the runtime stage
RUN find /app -path '*/node_modules/.prisma/client' -type d | head -1 | \
    xargs -I{} cp -r {} /generated-prisma

# Runtime stage
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
# Bring every built workspace lib (package.json + dist) across in one copy.
COPY --from=build /app/libs libs
COPY --from=build /app/apps/clustertenant-operator/package.json apps/clustertenant-operator/
COPY --from=build /app/apps/clustertenant-operator/prisma apps/clustertenant-operator/prisma
RUN pnpm install --frozen-lockfile --filter "@opencrane/clustertenant-operator..." --prod
COPY --from=build /generated-prisma /tmp/generated-prisma
# Retrieve the generated Prisma client for the runtime stage
RUN target=$(find /app -path '*/node_modules/.prisma/client' -type d | head -1) && \
    rm -rf "$target" && \
    cp -r /tmp/generated-prisma "$target" && \
    rm -rf /tmp/generated-prisma

COPY --from=build /app/apps/clustertenant-operator/dist apps/clustertenant-operator/dist

USER node

EXPOSE 8080

CMD ["node", "apps/clustertenant-operator/dist/index.js"]
