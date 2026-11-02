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

async function createStartedRoom(): Promise<RoomSetup> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    payload: {
      hostIdentity: 'dual',
      initialFunds: 2000,
      maxPlayers: 4,
      hostNickname: '房主',
      salary: 200,
    },
  })
  expect(created.statusCode).toBe(201)
  const room = created.json().data

  const joined = await app.inject({
    method: 'POST',
    url: `/api/rooms/${room.roomCode}/join`,
    payload: { nickname: '玩家' },
  })
  expect(joined.statusCode).toBe(200)
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

describe('M2 ledger', () => {
  it('starts a game and issues initial funds exactly once', async () => {
    const room = await createStartedRoom()
    const data = await snapshot(room.code, room.hostToken)

    expect(data.room.status).toBe('playing')
    expect(data.players).toHaveLength(2)
    expect(data.players.every((player: { balance: number }) => player.balance === 2000)).toBe(true)
    expect(data.transactions).toHaveLength(2)
    expect(data.transactions.every((tx: { category: string }) => tx.category === 'initial')).toBe(
      true,
    )
    expect(data.bankSummary).toEqual({ issued: 4000, collected: 0, net: 4000 })

    const again = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/start`,
      headers: auth(room.hostToken),
    })
    expect(again.statusCode).toBe(409)
  })

  it('requires two player identities to start', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { hostIdentity: 'bank_only', maxPlayers: 2, hostNickname: '银行' },
    })
    const room = created.json().data
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '唯一玩家' },
    })

    const started = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/actions/start`,
      headers: auth(room.hostToken),
    })
    expect(started.statusCode).toBe(409)
    expect(started.json().error.code).toBe('ROOM_STATE')
  })

  it('moves money between players, checks balance, and is idempotent', async () => {
    const room = await createStartedRoom()
    const requestId = randomUUID()

    const paid = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'player',
        toPlayerId: room.hostId,
        amount: 200,
        category: 'rent',
        note: '过路费',
        clientRequestId: requestId,
      },
    })
    expect(paid.statusCode).toBe(200)
    const transaction = paid.json().data.transaction
    expect(transaction).toMatchObject({
      fromName: '玩家',
      toName: '房主',
      amount: 200,
      category: 'rent',
    })

    const after = await snapshot(room.code, room.hostToken)
    const player = after.players.find((item: { id: string }) => item.id === room.playerId)
    const host = after.players.find((item: { id: string }) => item.id === room.hostId)
    expect(player.balance).toBe(1800)
    expect(host.balance).toBe(2200)

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'player',
        toPlayerId: room.hostId,
        amount: 200,
        category: 'rent',
        note: '过路费',
        clientRequestId: requestId,
      },
    })
    expect(duplicate.statusCode).toBe(200)
    expect(duplicate.json().data.transaction.id).toBe(transaction.id)

    const afterDuplicate = await snapshot(room.code, room.hostToken)
    expect(
      afterDuplicate.players.find((item: { id: string }) => item.id === room.playerId).balance,
    ).toBe(1800)

    const insufficient = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'player',
        toPlayerId: room.hostId,
        amount: 99999,
        category: 'rent',
        clientRequestId: randomUUID(),
      },
    })
    expect(insufficient.statusCode).toBe(409)
    expect(insufficient.json().error.code).toBe('INSUFFICIENT_BALANCE')
  })

  it('starts a bank-only room without giving the host a personal balance', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostIdentity: 'bank_only',
        initialFunds: 1500,
        maxPlayers: 2,
        hostNickname: '银行房主',
      },
    })
    const room = created.json().data
    const joined = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '甲' },
    })
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/join`,
      payload: { nickname: '乙' },
    })

    const started = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomCode}/actions/start`,
      headers: auth(room.hostToken),
    })
    expect(started.statusCode).toBe(200)

    const after = await snapshot(room.roomCode, room.hostToken)
    expect(after.me.isPlayer).toBe(false)
    expect(after.players).toHaveLength(2)
    expect(after.players.every((player: { balance: number }) => player.balance === 1500)).toBe(true)
    expect(after.bankSummary).toEqual({ issued: 3000, collected: 0, net: 3000 })
    expect(joined.statusCode).toBe(200)
  })

  it('lets a player pay the bank', async () => {
    const room = await createStartedRoom()

    const paid = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'bank',
        amount: 100,
        category: 'tax',
        note: '过路税',
        clientRequestId: randomUUID(),
      },
    })
    expect(paid.statusCode).toBe(200)

    const after = await snapshot(room.code, room.hostToken)
    const player = after.players.find((item: { id: string }) => item.id === room.playerId)
    expect(player.balance).toBe(1900)
    expect(after.bankSummary).toEqual({ issued: 4000, collected: 100, net: 3900 })
  })

  it('rejects self-payment and player bank source', async () => {
    const room = await createStartedRoom()

    const self = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        toType: 'player',
        toPlayerId: room.playerId,
        amount: 10,
        category: 'rent',
        clientRequestId: randomUUID(),
      },
    })
    expect(self.statusCode).toBe(400)

    const bank = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.playerToken),
      payload: {
        fromType: 'bank',
        toType: 'player',
        toPlayerId: room.hostId,
        amount: 10,
        category: 'rent',
        clientRequestId: randomUUID(),
      },
    })
    expect(bank.statusCode).toBe(403)
  })

  it('supports bank pay, salary, and bank collect', async () => {
    const room = await createStartedRoom()

    const bankPay = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/bank-pay`,
      headers: auth(room.hostToken),
      payload: {
        toPlayerId: room.playerId,
        amount: 300,
        category: 'chance',
        note: '机会卡',
        clientRequestId: randomUUID(),
      },
    })
    expect(bankPay.statusCode).toBe(200)

    const salary = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/salary`,
      headers: auth(room.hostToken),
      payload: {
        toPlayerId: room.playerId,
        clientRequestId: randomUUID(),
      },
    })
    expect(salary.statusCode).toBe(200)
    expect(salary.json().data.transaction.amount).toBe(200)

    const collect = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/bank-collect`,
      headers: auth(room.hostToken),
      payload: {
        fromPlayerId: room.playerId,
        amount: 100,
        category: 'tax',
        clientRequestId: randomUUID(),
      },
    })
    expect(collect.statusCode).toBe(200)

    const after = await snapshot(room.code, room.hostToken)
    const player = after.players.find((item: { id: string }) => item.id === room.playerId)
    expect(player.balance).toBe(2000 + 300 + 200 - 100)
    expect(after.bankSummary).toEqual({
      issued: 4000 + 300 + 200,
      collected: 100,
      net: 4400,
    })

    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/bank-pay`,
      headers: auth(room.playerToken),
      payload: {
        toPlayerId: room.playerId,
        amount: 10,
        category: 'chance',
        clientRequestId: randomUUID(),
      },
    })
    expect(forbidden.statusCode).toBe(403)
  })

  it('allows a dual host to pay from the bank without touching personal funds', async () => {
    const room = await createStartedRoom()

    const paid = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/actions/pay`,
      headers: auth(room.hostToken),
      payload: {
        fromType: 'bank',
        toType: 'player',
        toPlayerId: room.playerId,
        amount: 500,
        category: 'chance',
        clientRequestId: randomUUID(),
      },
    })
    expect(paid.statusCode).toBe(200)

    const after = await snapshot(room.code, room.hostToken)
    const host = after.players.find((item: { id: string }) => item.id === room.hostId)
    expect(host.balance).toBe(2000)
    expect(after.bankSummary.issued).toBe(4500)
  })

  it('handles concurrent payments without overdrawing', async () => {
    const room = await createStartedRoom()

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/rooms/${room.code}/actions/pay`,
          headers: auth(room.playerToken),
          payload: {
            toType: 'player',
            toPlayerId: room.hostId,
            amount: 600,
            category: 'rent',
            clientRequestId: randomUUID(),
          },
        }),
      ),
    )

    const successes = results.filter((result) => result.statusCode === 200)
    expect(successes).toHaveLength(3)

    const after = await snapshot(room.code, room.hostToken)
    const player = after.players.find((item: { id: string }) => item.id === room.playerId)
    const host = after.players.find((item: { id: string }) => item.id === room.hostId)
    expect(player.balance).toBe(200)
    expect(host.balance).toBe(3800)
  })

  it('keeps balances consistent across 100 payments', async () => {
    const room = await createStartedRoom()

    for (let index = 0; index < 100; index += 1) {
      const response = await app.inject({
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
      expect(response.statusCode).toBe(200)
    }

    const after = await snapshot(room.code, room.hostToken)
    const player = after.players.find((item: { id: string }) => item.id === room.playerId)
    const host = after.players.find((item: { id: string }) => item.id === room.hostId)
    expect(player.balance).toBe(1000)
    expect(host.balance).toBe(3000)
    expect(after.transactions).toHaveLength(20)
    expect(after.room.seq).toBe(103)
  })
})
