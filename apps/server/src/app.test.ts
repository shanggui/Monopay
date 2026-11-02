import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('M0 service endpoints', () => {
  it('reports liveness', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      ok: true,
      data: { service: 'Monopay 桌游账房', version: '0.0.0' },
    })
  })

  it('reports database readiness', async () => {
    const response = await app.inject({ method: 'GET', url: '/readyz' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      ok: true,
      data: { database: 'ok' },
    })
  })

  it('exposes meta data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/meta' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      ok: true,
      data: { name: 'Monopay 桌游账房' },
    })
  })

  it('returns a json 404 for unknown api routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })
})
