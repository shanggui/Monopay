import type { WsServerEvent } from '@monopay/shared'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

interface CreatedRoom {
  roomCode: string
  hostToken: string
  playerId: string
  url: string
}

async function createRoom(overrides: Record<string, unknown> = {}): Promise<CreatedRoom> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    payload: {
      hostIdentity: 'dual',
      initialFunds: 2000,
      maxPlayers: 4,
      hostNickname: '房主',
      ...overrides,
    },
  })

  expect(response.statusCode).toBe(201)
  return response.json().data as CreatedRoom
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` }
}

function nextWsEvent(socket: WebSocket): Promise<WsServerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket event timed out')), 2_000)
    socket.once('message', (raw) => {
      clearTimeout(timeout)
      resolve(JSON.parse(raw.toString()) as WsServerEvent)
    })
    socket.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

describe('room lifecycle', () => {
  it('creates a dual-role room with the host in the player list', async () => {
    const room = await createRoom()

    expect(room.roomCode).toMatch(/^\d{6}$/)
    expect(room.hostToken).toHaveLength(43)

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.roomCode}/snapshot`,
      headers: auth(room.hostToken),
    })

    expect(snapshot.statusCode).toBe(200)
    const data = snapshot.json().data
    expect(data.room.status).toBe('waiting')
    expect(data.room.hostIdentity).toBe('dual')
    expect(data.host.isHost).toBe(true)
    expect(data.me.isPlayer).toBe(true)
    expect(data.players).toHaveLength(1)
  })

  it('creates a bank-only room without a player slot', async () => {
    const room = await createRoom({ hostIdentity: 'bank_only', maxPlayers: 2 })

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.roomCode}/snapshot`,
      headers: auth(room.hostToken),
    })

    const data = snapshot.json().data
    expect(data.host.isPlayer).toBe(false)
    expect(data.players).toHaveLength(0)
  })

  it('joins, reconnects, and rejects a full room', async () => {
    const room = await createRoom({ hostIdentity: 'bank_only', maxPlayers: 2 })

    const first = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '甲' },
    })
    expect(first.statusCode).toBe(200)
    const firstPlayer = first.json().data

    const reconnect = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '甲' },
      headers: auth(firstPlayer.playerToken),
    })
    expect(reconnect.statusCode).toBe(200)
    expect(reconnect.json().data).toMatchObject({
      playerId: firstPlayer.playerId,
      reconnected: true,
    })

    const second = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '乙' },
    })
    expect(second.statusCode).toBe(200)

    const third = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '丙' },
    })
    expect(third.statusCode).toBe(409)
    expect(third.json()).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    })
  })

  it('supports six players in a bank-only room and rejects the seventh', async () => {
    const room = await createRoom({ hostIdentity: 'bank_only', maxPlayers: 6 })

    for (let index = 1; index <= 6; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/rooms/${room.roomCode}/join`,
        payload: { nickname: `玩家${index}` },
      })
      expect(response.statusCode).toBe(200)
    }

    const seventh = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '第七人' },
    })
    expect(seventh.statusCode).toBe(409)
    expect(seventh.json().error.code).toBe('ROOM_FULL')

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.roomCode}/snapshot`,
      headers: auth(room.hostToken),
    })
    expect(snapshot.json().data.players).toHaveLength(6)
  })

  it('only lets the host dissolve, and then the room is read-only', async () => {
    const room = await createRoom({ hostIdentity: 'bank_only' })
    const joined = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '玩家' },
    })
    const playerToken = joined.json().data.playerToken

    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/actions/dissolve`,
      headers: auth(playerToken),
    })
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json().error.code).toBe('FORBIDDEN')

    const dissolved = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/actions/dissolve`,
      headers: auth(room.hostToken),
    })
    expect(dissolved.statusCode).toBe(200)

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.roomCode}/snapshot`,
      headers: auth(room.hostToken),
    })
    expect(snapshot.json().data.room.status).toBe('dissolved')
  })

  it('authenticates WebSocket clients and broadcasts player joins', async () => {
    const room = await createRoom({ hostIdentity: 'dual' })
    const socket = await app.injectWS('/ws')

    const readyPromise = nextWsEvent(socket)
    socket.send(
      JSON.stringify({
        type: 'auth',
        roomCode: room.roomCode,
        token: room.hostToken,
      }),
    )

    const ready = await readyPromise
    expect(ready.type).toBe('ready')
    if (ready.type === 'ready') {
      expect(ready.data).toMatchObject({
        roomCode: room.roomCode,
        playerId: room.playerId,
        isHost: true,
      })
    }

    const joinedPromise = nextWsEvent(socket)
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: 'WS 玩家' },
    })

    const joined = await joinedPromise
    expect(joined.type).toBe('player_joined')
    if (joined.type === 'player_joined') {
      expect(joined.data.player.nickname).toBe('WS 玩家')
    }

    socket.close()
  })

  it('rejects missing or invalid credentials', async () => {
    const room = await createRoom()

    const missing = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.roomCode}/snapshot`,
    })
    expect(missing.statusCode).toBe(401)

    const invalid = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.roomCode}/snapshot`,
      headers: auth('not-a-real-token'),
    })
    expect(invalid.statusCode).toBe(401)
  })
})
