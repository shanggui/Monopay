import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticateRoom, createRoom, dissolveRoom, getSnapshot, joinRoom } from '../rooms/service'
import { broadcastToRoom } from '../ws/hub'

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim() || undefined
}

export function registerRoomRoutes(app: FastifyInstance): void {
  app.post('/api/rooms', async (request, reply) => {
    const data = createRoom(request.body)
    return reply.code(201).send({
      ok: true,
      data,
      serverTime: Date.now(),
    })
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/join', async (request) => {
    const rawToken = bearerToken(request)
    const data = joinRoom(request.params.code, request.body, rawToken)

    const tokenForView = data.playerToken ?? rawToken
    if (tokenForView) {
      try {
        const auth = authenticateRoom(request.params.code, tokenForView)
        const snapshot = getSnapshot(auth)
        broadcastToRoom(auth.room.code, {
          type: 'player_joined',
          data: { player: snapshot.me },
        })
      } catch (error) {
        request.log.warn({ error }, 'failed to broadcast player_joined')
      }
    }

    return {
      ok: true,
      data,
      serverTime: Date.now(),
    }
  })

  app.get<{ Params: { code: string } }>('/api/rooms/:code/snapshot', async (request) => {
    const auth = authenticateRoom(request.params.code, bearerToken(request))
    return {
      ok: true,
      data: getSnapshot(auth),
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/dissolve', async (request) => {
    const data = dissolveRoom(request.params.code, bearerToken(request))
    broadcastToRoom(data.code, {
      type: 'room_updated',
      data: { status: 'dissolved', seq: data.seq },
    })
    return {
      ok: true,
      data,
      serverTime: Date.now(),
    }
  })
}
