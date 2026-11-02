import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import type { HealthData, ReadyData } from '@monopay/shared'
import { serviceName } from '@monopay/shared'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ZodError } from 'zod'
import { checkDatabase, closeDatabase, initializeMeta, runMigrations } from './db'
import { env } from './env'
import { AppError } from './lib/errors'
import { registerRoomRoutes } from './routes/rooms'
import { expireStaleRooms, purgeExpiredRooms } from './rooms/service'
import { registerWebSocket } from './ws'

export interface AppMetaData {
  name: string
  version: string
  initializedAt: string
}

export async function buildApp(): Promise<FastifyInstance> {
  runMigrations()
  const initializedAt = initializeMeta()
  expireStaleRooms()
  purgeExpiredRooms()

  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.token',
                'req.body.hostToken',
                'req.body.playerToken',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
          },
    trustProxy: env.TRUST_PROXY,
  })

  const expiryTimer = setInterval(
    () => {
      try {
        expireStaleRooms()
        purgeExpiredRooms()
      } catch (error) {
        app.log.error(error, 'room expiry job failed')
      }
    },
    60 * 60 * 1_000,
  )
  expiryTimer.unref()

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })

  await app.register(rateLimit, {
    global: false,
  })

  app.get('/healthz', async () => {
    const data: HealthData = {
      service: serviceName,
      version: env.APP_VERSION,
    }
    return { ok: true, data, serverTime: Date.now() }
  })

  app.get('/readyz', async (_request, reply) => {
    try {
      checkDatabase()
      const data: ReadyData = {
        database: 'ok',
        initializedAt,
      }
      return { ok: true, data, serverTime: Date.now() }
    } catch (error) {
      app.log.error(error, 'database readiness check failed')
      return reply.code(503).send({
        ok: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: '数据库暂不可用' },
        serverTime: Date.now(),
      })
    }
  })

  app.get('/api/meta', async () => {
    const data: AppMetaData = {
      name: serviceName,
      version: env.APP_VERSION,
      initializedAt,
    }
    return { ok: true, data, serverTime: Date.now() }
  })

  await registerWebSocket(app)
  registerRoomRoutes(app)

  if (existsSync(join(env.WEB_DIST, 'index.html'))) {
    app.register(fastifyStatic, {
      root: env.WEB_DIST,
    })
  }

  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? ''

    if (
      url.startsWith('/api') ||
      url.startsWith('/healthz') ||
      url.startsWith('/readyz') ||
      url.startsWith('/ws') ||
      !existsSync(join(env.WEB_DIST, 'index.html'))
    ) {
      return reply.code(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: '请求的资源不存在' },
        serverTime: Date.now(),
      })
    }

    return reply.sendFile('index.html')
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        ok: false,
        error: { code: error.code, message: error.message },
        serverTime: Date.now(),
      })
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_ARGUMENT',
          message: '请求参数不正确',
          details: error.flatten(),
        },
        serverTime: Date.now(),
      })
    }

    request.log.error(error)
    const statusCode = error.statusCode ?? 500
    return reply.code(statusCode).send({
      ok: false,
      error: {
        code: error.code ?? 'INTERNAL',
        message: statusCode >= 500 ? '服务器内部错误' : error.message,
      },
      serverTime: Date.now(),
    })
  })

  app.addHook('onClose', async () => {
    clearInterval(expiryTimer)
    closeDatabase()
  })

  return app
}
