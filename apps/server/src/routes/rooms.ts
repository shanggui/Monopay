import {
  assetsRequestSchema,
  bankCollectRequestSchema,
  bankPayRequestSchema,
  bankruptRequestSchema,
  payRequestSchema,
  refundRequestSchema,
  reverseRequestSchema,
  salaryRequestSchema,
  type PaymentResult,
  type TransactionFilter,
} from '@monopay/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  bankCollect,
  bankPay,
  confirmSettlement,
  endGame,
  getTransactionPage,
  playerPay,
  refund,
  resumeGame,
  reverse,
  salary,
  setBankrupt,
  startGame,
  updateAssets,
} from '../rooms/ledger'
import { authenticateRoom, createRoom, dissolveRoom, getSnapshot, joinRoom } from '../rooms/service'
import { broadcastToRoom } from '../ws/hub'

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim() || undefined
}

export function registerRoomRoutes(app: FastifyInstance): void {
  app.post(
    '/api/rooms',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const data = createRoom(request.body)
      return reply.code(201).send({
        ok: true,
        data,
        serverTime: Date.now(),
      })
    },
  )

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/join',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
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
    },
  )

  app.get<{ Params: { code: string } }>('/api/rooms/:code/snapshot', async (request) => {
    const auth = authenticateRoom(request.params.code, bearerToken(request))
    return {
      ok: true,
      data: getSnapshot(auth),
      serverTime: Date.now(),
    }
  })

  app.get<{
    Params: { code: string }
    Querystring: { limit?: string; filter?: string; beforeSeq?: string }
  }>('/api/rooms/:code/transactions', async (request) => {
    const auth = authenticateRoom(request.params.code, bearerToken(request))
    const requestedLimit = Number(request.query.limit ?? 50)
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50
    const filter: TransactionFilter = ['sent', 'received', 'bank'].includes(
      request.query.filter ?? '',
    )
      ? (request.query.filter as TransactionFilter)
      : 'all'
    const beforeSeq = Number(request.query.beforeSeq)
    return {
      ok: true,
      data: getTransactionPage(
        auth,
        filter,
        Number.isInteger(beforeSeq) && beforeSeq > 0 ? beforeSeq : undefined,
        limit,
      ),
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/start', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    startGame(auth)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, {
      type: 'room_updated',
      data: { status: 'playing', seq: snapshot.lastSeq },
    })
    return {
      ok: true,
      data: snapshot,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/actions/pay',
    { config: { rateLimit: { max: 1200, timeWindow: '1 minute' } } },
    async (request) => {
      const token = bearerToken(request)
      const auth = authenticateRoom(request.params.code, token)
      const payload = payRequestSchema.parse(request.body)
      const transaction = playerPay(auth, payload)
      const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
      broadcastToRoom(auth.room.code, { type: 'transaction', data: { transaction } })
      return {
        ok: true,
        data: { transaction, snapshot } satisfies PaymentResult,
        serverTime: Date.now(),
      }
    },
  )

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/bank-pay', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    const payload = bankPayRequestSchema.parse(request.body)
    const transaction = bankPay(auth, payload)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, { type: 'transaction', data: { transaction } })
    return {
      ok: true,
      data: { transaction, snapshot } satisfies PaymentResult,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/actions/bank-collect',
    async (request) => {
      const token = bearerToken(request)
      const auth = authenticateRoom(request.params.code, token)
      const payload = bankCollectRequestSchema.parse(request.body)
      const transaction = bankCollect(auth, payload)
      const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
      broadcastToRoom(auth.room.code, { type: 'transaction', data: { transaction } })
      return {
        ok: true,
        data: { transaction, snapshot } satisfies PaymentResult,
        serverTime: Date.now(),
      }
    },
  )

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/salary', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    const payload = salaryRequestSchema.parse(request.body)
    const transaction = salary(auth, payload)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, { type: 'transaction', data: { transaction } })
    return {
      ok: true,
      data: { transaction, snapshot } satisfies PaymentResult,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/refund', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    const payload = refundRequestSchema.parse(request.body)
    const transaction = refund(auth, payload.transactionId, payload)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, { type: 'transaction', data: { transaction } })
    return {
      ok: true,
      data: { transaction, snapshot } satisfies PaymentResult,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/reverse', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    const payload = reverseRequestSchema.parse(request.body)
    const transaction = reverse(auth, payload.transactionId, payload)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, { type: 'transaction', data: { transaction } })
    return {
      ok: true,
      data: { transaction, snapshot } satisfies PaymentResult,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/bankrupt', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    const payload = bankruptRequestSchema.parse(request.body)
    setBankrupt(auth, payload)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    const player = snapshot.players.find((item) => item.id === payload.playerId) ?? snapshot.host
    broadcastToRoom(auth.room.code, { type: 'player_updated', data: { player } })
    return {
      ok: true,
      data: snapshot,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/end', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    endGame(auth)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, {
      type: 'room_updated',
      data: { status: 'settling', seq: snapshot.lastSeq },
    })
    return {
      ok: true,
      data: snapshot,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/resume', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    resumeGame(auth)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, {
      type: 'room_updated',
      data: { status: 'playing', seq: snapshot.lastSeq },
    })
    return {
      ok: true,
      data: snapshot,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/assets', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    const payload = assetsRequestSchema.parse(request.body)
    updateAssets(auth, payload)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, {
      type: 'room_updated',
      data: { status: 'settling', seq: snapshot.lastSeq },
    })
    return {
      ok: true,
      data: snapshot,
      serverTime: Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>('/api/rooms/:code/actions/confirm', async (request) => {
    const token = bearerToken(request)
    const auth = authenticateRoom(request.params.code, token)
    const rankings = confirmSettlement(auth)
    const snapshot = getSnapshot(authenticateRoom(request.params.code, token))
    broadcastToRoom(auth.room.code, { type: 'settlement', data: { rankings } })
    broadcastToRoom(auth.room.code, {
      type: 'room_updated',
      data: { status: 'settled', seq: snapshot.lastSeq },
    })
    return {
      ok: true,
      data: { rankings, snapshot },
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
