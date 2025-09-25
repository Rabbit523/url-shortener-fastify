import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
await app.register(cors, { origin: process.env.ORIGIN || '*' });
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 1000),
  timeWindow: process.env.RATE_LIMIT_TIME_WINDOW ?? '1 minute',
  allowList: ['127.0.0.1'],
});

// Health
app.get('/health', async () => ({ ok: true }));

// Create link
const createBody = z.object({
  url: z.string().url(),
  slug: z.string().min(3).max(32).optional(),
  ttl: z.number().int().positive().optional(),
});
app.post('/links', async (req, reply) => {
  const { url, slug, ttl } = createBody.parse(req.body);
  const s =
    slug ??
    (await import('nanoid')).customAlphabet(
      '0123456789abcdefghijklmnopqrstuvwxyz',
      7
    )();
  try {
    const link = await prisma.link.create({
      data: { url, slug: s, ttl: ttl ?? null },
    });
    // warm cache
    const key = `link:${s}`;
    const payload = JSON.stringify({ url, ttl: ttl ?? null });

    if (typeof link.ttl === 'number') {
      await redis.set(key, payload, 'EX', link.ttl);
    } else {
      await redis.set(key, payload);
    }

    return reply.code(201).send({ slug: s, url });
  } catch (e: any) {
    if (e.code === 'P2002')
      return reply.code(409).send({ error: 'slug_exists' });
    throw e;
  }
});

// Get stats
app.get<{ Params: { slug: string } }>(
  '/links/:slug/stats',
  async (req, reply) => {
    const { slug } = req.params;
    const link = await prisma.link.findUnique({ where: { slug } });
    if (!link) return reply.code(404).send({ error: 'not_found' });
    const last24h = await prisma.clickEvent.count({
      where: {
        linkId: link.id,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    return { slug, url: link.url, clicks: link.clicks, last24h };
  }
);

// Redirect hot path
app.get<{ Params: { slug: string } }>('/:slug', async (req, reply) => {
  const { slug } = req.params;
  const cacheKey = `link:${slug}`;

  // Redis hot path
  const cached = await redis.get(cacheKey);
  if (cached) {
    const { url } = JSON.parse(cached) as { url: string };
    // Fire and forget analytics
    recordClick(
      slug,
      req.ip,
      req.headers['user-agent'],
      req.headers['referer']
    );
    return reply.code(301).redirect(url);
  }

  // DB miss
  const link = await prisma.link.findUnique({ where: { slug } });
  if (!link) return reply.code(404).send('Not found');

  const payload = JSON.stringify({ url: link.url, ttl: link.ttl ?? null });
  if (typeof link.ttl === 'number') {
    await redis.set(cacheKey, payload, 'EX', link.ttl); // ioredis form
  } else {
    await redis.set(cacheKey, payload);
  }

  recordClick(slug, req.ip, req.headers['user-agent'], req.headers['referer']);
  return reply.code(301).redirect(slug);
});

async function recordClick(
  slug: string,
  ip?: string,
  ua?: string,
  referer?: string
) {
  // lightweight queue-less approach; upgrade to BullMQ if needed
  const link = await prisma.link.findUnique({ where: { slug } });
  if (!link) return;

  await prisma.$transaction(
    async (tx) => {
      await tx.link.update({
        where: { id: link.id },
        data: { clicks: { increment: 1 } },
      });
      await tx.clickEvent.create({
        data: {
          linkId: link.id,
          ip: ip ?? null,
          ua: ua ?? null,
          referer: referer ?? null,
        },
      });
    },
    { timeout: 5000 } // valid here
  );
}

const port = Number(process.env.PORT ?? 3000);
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`listening on ${port}`));
