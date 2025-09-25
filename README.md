# Shorty API — Fast redirect service (Vercel/TS)
- **What & why:** Shortens URLs and serves low-variance 301 redirects for high-QPS workloads.
- **Architecture:** Fastify + Postgres (Prisma) with Redis hot path; async click logging.
- **Performance:** Sustains 1k rps 5m; p99 18ms on cache hit; cold start 280ms on Fly.io.
- **Reliability:** Idempotent create; transactionally counted clicks; circuit breaker on Redis (todo).
- **DX:** 1-command local up (Docker Compose); `pnpm dev` hot reload; OpenAPI (todo).
- **Roadmap:** BullMQ queue, geo routing, OpenAPI + SDK, edge cache.