# CLAUDE.md

## Deployment Architecture
- **App**: Next.js on Railway (Hobby plan, 8GB RAM/replica max)
- **Backend/DB**: Convex (real-time, serverless)
- **Storage**: Cloudflare R2 (S3-compatible)
- **PDF Processing**: @opendataloader/pdf (spawns Java subprocess, needs ~4GB heap)

## Pre-Flight Checklist: Infrastructure Changes

Before designing any change that involves memory, CPU, concurrency, or environment config:

1. **Resources** — What are the actual RAM/CPU limits of the deployment target?
2. **Concurrency** — If N requests arrive simultaneously, what's the total resource usage?
3. **Environment parity** — Does the fix work in local dev, Docker, AND production?
4. **Implicit limits** — If changing sync→async, what was the old pattern implicitly rate-limiting?

## Conventions
- Config that must work everywhere: set in code (`process.env.X`), not just Dockerfile
- Background processing: serialize with a queue to prevent concurrent resource exhaustion
- Prefer robust solutions (React context, explicit queues) over clever ones (CSS hidden, fire-and-forget without limits)
