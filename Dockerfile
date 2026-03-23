# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
RUN npm run build

# Stage 3: Production image with Java
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# opendataloader-pdf needs its JAR files from node_modules
COPY --from=builder /app/node_modules/@opendataloader ./node_modules/@opendataloader

EXPOSE 3000
CMD ["node", "server.js"]
