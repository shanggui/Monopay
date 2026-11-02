import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000'

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} -> ${response.status}: ${data.error?.message}`,
    )
  }
  return data.data
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * p)]
}

const created = await api('/api/rooms', {
  method: 'POST',
  body: { hostIdentity: 'dual', initialFunds: 2000, maxPlayers: 2, hostNickname: '压测房主' },
})
const joined = await api(`/api/rooms/${created.roomCode}/join`, {
  method: 'POST',
  body: { nickname: '压测玩家' },
})
await api(`/api/rooms/${created.roomCode}/actions/start`, {
  method: 'POST',
  token: created.hostToken,
  body: {},
})

const latencies = []
for (let index = 0; index < 1000; index += 1) {
  const started = performance.now()
  await api(`/api/rooms/${created.roomCode}/actions/pay`, {
    method: 'POST',
    token: created.hostToken,
    body: {
      toType: 'player',
      toPlayerId: joined.playerId,
      amount: 1,
      category: 'rent',
      clientRequestId: randomUUID(),
    },
  })
  latencies.push(performance.now() - started)
}

const after = await api(`/api/rooms/${created.roomCode}/snapshot`, {
  token: created.hostToken,
})
const host = after.players.find((item) => item.id === created.playerId)
const player = after.players.find((item) => item.id === joined.playerId)

let sentCount = 0
let cursor
do {
  const page = await api(
    `/api/rooms/${created.roomCode}/transactions?filter=sent&limit=100${
      cursor ? `&beforeSeq=${cursor}` : ''
    }`,
    { token: created.hostToken },
  )
  sentCount += page.items.length
  cursor = page.nextCursor ?? undefined
} while (cursor)

const concurrentRoom = await api('/api/rooms', {
  method: 'POST',
  body: { hostIdentity: 'bank_only', initialFunds: 2000, maxPlayers: 6, hostNickname: '并发房主' },
})
const players = []
for (let index = 0; index < 6; index += 1) {
  const playerData = await api(`/api/rooms/${concurrentRoom.roomCode}/join`, {
    method: 'POST',
    body: { nickname: `并发${index + 1}` },
  })
  players.push(playerData)
}
await api(`/api/rooms/${concurrentRoom.roomCode}/actions/start`, {
  method: 'POST',
  token: concurrentRoom.hostToken,
  body: {},
})

const concurrent = await Promise.all(
  players.map((item) =>
    api(`/api/rooms/${concurrentRoom.roomCode}/actions/pay`, {
      method: 'POST',
      token: item.playerToken,
      body: {
        toType: 'bank',
        amount: 500,
        category: 'tax',
        clientRequestId: randomUUID(),
      },
    }).then(
      () => true,
      () => false,
    ),
  ),
)
const concurrentAfter = await api(`/api/rooms/${concurrentRoom.roomCode}/snapshot`, {
  token: concurrentRoom.hostToken,
})

const result = {
  ok:
    host.balance === 1000 &&
    player.balance === 3000 &&
    sentCount === 1000 &&
    concurrent.every(Boolean) &&
    concurrentAfter.players.every((item) => item.balance === 1500),
  room: created.roomCode,
  hostBalance: host.balance,
  playerBalance: player.balance,
  sentCount,
  latencyMs: {
    p50: Math.round(percentile(latencies, 0.5) * 10) / 10,
    p95: Math.round(percentile(latencies, 0.95) * 10) / 10,
    max: Math.round(Math.max(...latencies) * 10) / 10,
  },
  concurrent: {
    succeeded: concurrent.filter(Boolean).length,
    total: concurrent.length,
    balances: concurrentAfter.players.map((item) => item.balance),
  },
}

mkdirSync('data', { recursive: true })
writeFileSync('data/m5-load.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exit(1)
