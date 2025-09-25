# url-shortener-fastify

Purpose & constraints (redirects @ massive QPS; low variance latency).

Data/caching strategy (Redis hot path, Postgres source of truth).

Perf: 1k rps for 5m; p99 18ms; cold start 280ms.

Reliability: idempotent create; backpressure; circuit breaker on Redis.

Security: signed admin endpoints; input validation (zod); rate limits.

Next steps: async link checks, geo routing, edge cache.