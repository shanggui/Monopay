import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import type { HealthData, ReadyData } from '@monopay/shared'
import { serviceName } from '@monopay/shared'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { checkDatabase, closeDatabase, initializeMeta, runMigrations } from './db'
import { env } from './env'

export interface AppMetaData {
  name: string
  version: string
  initializedAt: string
}

export function buildApp(): FastifyInstance {
  runMigrations()
  const initializedAt = initializeMeta()

  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
    trustProxy: env.TRUST_PROXY,
  })

  app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
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

  if (existsSync(join(env.WEB_DIST, 'index.html'))) {
    app.register(fastifyStatic, {
      root: env.WEB_DIST,
      wildcard: false,
    })
  }

  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? ''

    if (
      url.startsWith('/api') ||
      url.startsWith('/healthz') ||
      url.startsWith('/readyz') ||
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
    closeDatabase()
  })

  return app
}
