import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

interface RoomSetup {
  code: string
  hostToken: string
  hostId: string
  playerToken: string
  playerId: string
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` }
}

async function createRoom(hostIdentity: 'dual' | 'bank_only' = 'dual'): Promise<RoomSetup> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    payload: {
      hostIdentity,
      initialFunds: 2000,
      maxPlayers: 4,
      hostNickname: '房主',
      salary: 200,
    },
  })
  const room = created.json().data
  const joined = await app.inject({
    method: 'POST',
    url: `/api/rooms/${room.roomCode}/join`,
    payload: { nickname: '小美' },
  })
  const player = joined.json().data
  const started = await app.inject({
    method: 'POST',
    url: `/api/rooms/${room.roomCode}/actions/start`,
    headers: auth(room.hostToken),
  })
  expect(started.statusCode).toBe(200)

  return {
    code: room.roomCode,
    hostToken: room.hostToken,
    hostId: room.playerId,
    playerToken: player.playerToken,
    playerId: player.playerId,
  }
}

async function snapshot(code: string, token: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/rooms/${code}/snapshot`,
    headers: auth(token),
  })
  expect(response.statusCode).toBe(200)
  return response.json().data
}

async function pay(
  room: RoomSetup,
  token: string,
  toPlayerId: string,
  amount: number,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/rooms/${room.code}/actions/pay`,
    headers: auth(token),
    payload: {
      toType: 'player',
      toPlayerId,
      amount,
      category: 'rent',
      clientRequestId: randomUUID(),
    },
  })
  expect(response.statusCode).toBe(200)
  return response.json().data.transaction.id
}

describe('M3 corrections and settlement', () => {
  it('refunds from the payee, links the original, and blocks double refunds', async () => {
    const room = await createRoom()
    const originalId = await pay(room, room.playerToken, room.hostId, 200)

    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/refund`,
      headers: auth(room.playerToken),
      payload: { transactionId: originalId, clientRequestId: randomUUID() },
    })
    expect(forbidden.statusCode).toBe(403)

    const refunded = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/refund`,
      headers: auth(room.hostToken),
      payload: { transactionId: originalId, clientRequestId: randomUUID() },
    })
    expect(refunded.statusCode).toBe(200)
    expect(refunded.json().data.transaction).toMatchObject({
      category: 'refund',
      refundOf: originalId,
      amount: 200,
    })

    const after = await snapshot(room.code, room.hostToken)
    const player = after.players.find((item: { id: string }) => item.id === room.playerId)
    const host = after.players.find((item: { id: string }) => item.id === room.hostId)
    expect(player.balance).toBe(2000)
    expect(host.balance).toBe(2000)
    expect(after.transactions.find((item: { id: string }) => item.id === originalId).status).toBe(
      'refunded',
    )

    const again = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/refund`,
      headers: auth(room.hostToken),
      payload: { transactionId: originalId, clientRequestId: randomUUID() },
    })
    expect(again.statusCode).toBe(409)
  })

  it('refunds a player-to-bank payment from the bank side', async () => {
    const room = await createRoom()
    const paid = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'bank',
        amount: 100,
        category: 'tax',
        clientRequestId: randomUUID(),
      },
    })
    expect(paid.statusCode).toBe(200)
    const originalId = paid.json().data.transaction.id

    const refunded = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/refund`,
      headers: auth(room.hostToken),
      payload: { transactionId: originalId, clientRequestId: randomUUID() },
    })
    expect(refunded.statusCode).toBe(200)

    const after = await snapshot(room.code, room.hostToken)
    expect(after.players.find((item: { id: string }) => item.id === room.playerId).balance).toBe(
      2000,
    )
    expect(after.bankSummary).toEqual({ issued: 4000, collected: 0, net: 4000 })
  })

  it('refuses to refund initial funds', async () => {
    const room = await createRoom()
    const data = await snapshot(room.code, room.hostToken)
    const initial = data.transactions.find(
      (item: { category: string }) => item.category === 'initial',
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/refund`,
      headers: auth(room.hostToken),
      payload: { transactionId: initial.id, clientRequestId: randomUUID() },
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('NOT_REFUNDABLE')
  })

  it('reverses as host with a reason and blocks non-host / double reversal', async () => {
    const room = await createRoom()
    const originalId = await pay(room, room.playerToken, room.hostId, 200)

    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/reverse`,
      headers: auth(room.playerToken),
      payload: {
        transactionId: originalId,
        reason: '测试',
        clientRequestId: randomUUID(),
      },
    })
    expect(forbidden.statusCode).toBe(403)

    const reversed = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/reverse`,
      headers: auth(room.hostToken),
      payload: {
        transactionId: originalId,
        reason: '租金金额记错',
        clientRequestId: randomUUID(),
      },
    })
    expect(reversed.statusCode).toBe(200)
    expect(reversed.json().data.transaction).toMatchObject({
      category: 'reversal',
      reversalOf: originalId,
    })

    const after = await snapshot(room.code, room.hostToken)
    expect(after.transactions.find((item: { id: string }) => item.id === originalId).status).toBe(
      'reversed',
    )
    expect(after.players.find((item: { id: string }) => item.id === room.playerId).balance).toBe(
      2000,
    )

    const again = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/reverse`,
      headers: auth(room.hostToken),
      payload: {
        transactionId: originalId,
        reason: '再来一次',
        clientRequestId: randomUUID(),
      },
    })
    expect(again.statusCode).toBe(409)
  })

  it('marks and clears bankruptcy and blocks outgoing payments', async () => {
    const room = await createRoom()

    const marked = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/bankrupt`,
      headers: auth(room.hostToken),
      payload: { playerId: room.playerId, bankrupt: true },
    })
    expect(marked.statusCode).toBe(200)

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'player',
        toPlayerId: room.hostId,
        amount: 10,
        category: 'rent',
        clientRequestId: randomUUID(),
      },
    })
    expect(blocked.statusCode).toBe(403)

    const cleared = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/bankrupt`,
      headers: auth(room.hostToken),
      payload: { playerId: room.playerId, bankrupt: false },
    })
    expect(cleared.statusCode).toBe(200)

    const allowed = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'player',
        toPlayerId: room.hostId,
        amount: 10,
        category: 'rent',
        clientRequestId: randomUUID(),
      },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('settles assets, ranks ties, and becomes read-only', async () => {
    const room = await createRoom()
    const end = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/end`,
      headers: auth(room.hostToken),
    })
    expect(end.statusCode).toBe(200)
    expect(end.json().data.room.status).toBe('settling')

    const playerAssets = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/assets`,
      headers: auth(room.playerToken),
      payload: { propertyValue: 500, debt: 100 },
    })
    expect(playerAssets.statusCode).toBe(200)

    const hostAssets = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/assets`,
      headers: auth(room.hostToken),
      payload: { propertyValue: 500, debt: 100 },
    })
    expect(hostAssets.statusCode).toBe(200)

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/confirm`,
      headers: auth(room.hostToken),
    })
    expect(confirmed.statusCode).toBe(200)
    const rankings = confirmed.json().data.rankings
    expect(rankings).toHaveLength(2)
    expect(rankings.map((item: { rank: number }) => item.rank)).toEqual([1, 1])
    expect(rankings[0].net).toBe(2400)

    const readOnly = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'player',
        toPlayerId: room.hostId,
        amount: 10,
        category: 'rent',
        clientRequestId: randomUUID(),
      },
    })
    expect(readOnly.statusCode).toBe(409)
    expect(readOnly.json().error.code).toBe('ROOM_STATE')
  })

  it('excludes a bank-only host from the ranking', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostIdentity: 'bank_only',
        initialFunds: 2000,
        maxPlayers: 4,
        hostNickname: '银行房主',
      },
    })
    const room = created.json().data
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '甲' },
    })
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '乙' },
    })
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/actions/start`,
      headers: auth(room.hostToken),
    })
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/actions/end`,
      headers: auth(room.hostToken),
    })
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/actions/confirm`,
      headers: auth(room.hostToken),
    })

    expect(confirmed.statusCode).toBe(200)
    const rankings = confirmed.json().data.rankings
    expect(rankings).toHaveLength(2)
    expect(rankings.some((item: { playerId: string }) => item.playerId === room.playerId)).toBe(
      false,
    )
  })

  it('allows the host to return to playing before settlement', async () => {
    const room = await createRoom()
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/end`,
      headers: auth(room.hostToken),
    })
    const resumed = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/resume`,
      headers: auth(room.hostToken),
    })
    expect(resumed.statusCode).toBe(200)
    expect(resumed.json().data.room.status).toBe('playing')
  })

  it('supports transaction filters and cursor pagination', async () => {
    const room = await createRoom()
    await pay(room, room.playerToken, room.hostId, 10)
    await pay(room, room.playerToken, room.hostId, 20)

    const sent = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.code}/transactions?filter=sent&limit=1`,
      headers: auth(room.playerToken),
    })
    expect(sent.statusCode).toBe(200)
    expect(sent.json().data.items).toHaveLength(1)
    expect(sent.json().data.hasMore).toBe(true)

    const received = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.code}/transactions?filter=received`,
      headers: auth(room.hostToken),
    })
    expect(received.statusCode).toBe(200)
    expect(
      received.json().data.items.every((item: { toType: string }) => item.toType === 'player'),
    ).toBe(true)

    const bank = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.code}/transactions?filter=bank`,
      headers: auth(room.hostToken),
    })
    expect(bank.statusCode).toBe(200)
    expect(
      bank
        .json()
        .data.items.every(
          (item: { fromType: string; toType: string }) =>
            item.fromType === 'bank' || item.toType === 'bank',
        ),
    ).toBe(true)
  })
})
