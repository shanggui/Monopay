<script setup lang="ts">
import type { PlayerView, WsServerEvent } from '@monopay/shared'
import { ArrowLeftRight, Landmark, ReceiptText, ShieldCheck } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import TransactionRow from '../components/TransactionRow.vue'
import { formatMoney } from '../lib/format'
import { getSnapshot } from '../services/api'
import { connectRoomSocket, type RoomSocket, type SocketStatus } from '../services/ws'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const loading = ref(true)
const error = ref('')
const socketStatus = ref<SocketStatus>('offline')
let socket: RoomSocket | undefined

const code = computed(() => String(route.params.code ?? ''))
const snapshot = computed(() => session.snapshot)
const me = computed(() => snapshot.value?.me ?? null)
const room = computed(() => snapshot.value?.room ?? null)
const players = computed<PlayerView[]>(() => snapshot.value?.players ?? [])
const transactions = computed(() => snapshot.value?.transactions ?? [])
const canSwitchBank = computed(() =>
  Boolean(snapshot.value?.me.isHost && snapshot.value.me.isPlayer),
)

const socketLabel = computed(() => {
  if (socketStatus.value === 'online') return '实时连接'
  if (socketStatus.value === 'connecting') return '连接中'
  return '离线'
})

async function refresh(): Promise<void> {
  const token = session.token
  if (!token) throw new Error('本机没有这桌的凭证')
  const data = await getSnapshot(code.value, token)
  session.setSnapshot(data)
}

function handleSocketEvent(event: WsServerEvent): void {
  if (
    event.type === 'transaction' ||
    event.type === 'room_updated' ||
    event.type === 'player_joined'
  ) {
    void refresh().catch(() => undefined)
  }
}

function goPay(toType: 'player' | 'bank', toPlayerId?: string): void {
  void router.push({
    name: 'pay',
    params: { code: code.value },
    query: {
      to: toType,
      ...(toPlayerId ? { playerId: toPlayerId } : {}),
    },
  })
}

async function init(): Promise<void> {
  session.loadForRoom(code.value)
  if (!session.token) {
    await router.replace({ name: 'join-room', params: { code: code.value } })
    return
  }

  try {
    const data = await getSnapshot(code.value, session.token)
    session.setSnapshot(data)

    if (data.me.isHost && !data.me.isPlayer) {
      await router.replace({ name: 'bank', params: { code: code.value } })
      return
    }

    socket = connectRoomSocket(code.value, session.token, handleSocketEvent, (status) => {
      socketStatus.value = status
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取账本'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void init()
})

onUnmounted(() => {
  socket?.close()
})
</script>

<template>
  <div class="page page--app">
    <div class="page__dots" aria-hidden="true"></div>

    <div class="shell">
      <AppHeader back label="我的账本">
        <template #right>
          <span class="socket-state" :class="`socket-state--${socketStatus}`">
            <i></i>
            {{ socketLabel }}
          </span>
        </template>
      </AppHeader>

      <main v-if="loading" class="center-state">
        <p>正在读取账本…</p>
      </main>

      <main v-else-if="error && !snapshot" class="center-state center-state--error">
        <p>{{ error }}</p>
        <RouterLink class="text-link" :to="`/room/${code}`">返回大厅</RouterLink>
      </main>

      <main v-else-if="snapshot && me && room" class="ledger">
        <section class="ledger__hero">
          <div class="ledger__title">
            <p class="eyebrow">
              TABLE / {{ room.code }} · {{ room.status === 'playing' ? '对局中' : '只读' }}
            </p>
            <h1>我的账本</h1>
            <p class="lede">
              {{ me.nickname }} · {{ me.isHost ? '房主' : '玩家' }} · 余额不足时不能转出
            </p>
          </div>

          <div class="balance-card">
            <div class="balance-card__head">
              <span>可用余额</span>
              <em>BANK</em>
            </div>
            <strong class="balance-value"> {{ formatMoney(me.balance) }}<small>M</small> </strong>
            <p>本局游戏币 · 不兑换现金</p>
          </div>
        </section>

        <div class="ledger-actions">
          <button class="primary-button" type="button" @click="goPay('player')">
            <ArrowLeftRight :size="18" :stroke-width="1.9" />
            付款
          </button>
          <button class="secondary-button" type="button" @click="goPay('bank')">
            <Landmark :size="18" :stroke-width="1.8" />
            缴税/罚款
          </button>
          <button
            v-if="canSwitchBank"
            class="secondary-button"
            type="button"
            @click="router.push(`/room/${code}/bank`)"
          >
            <ShieldCheck :size="18" :stroke-width="1.8" />
            银行台
          </button>
        </div>

        <section class="ledger-grid">
          <div class="paper-card balance-list-card">
            <div class="section-head">
              <div>
                <p class="card-label">PLAYERS</p>
                <h2>玩家余额</h2>
              </div>
              <span>{{ players.length }} 人</span>
            </div>

            <div class="balance-list">
              <div v-for="player in players" :key="player.id" class="balance-row">
                <span class="player-avatar">{{
                  player.avatar || player.nickname.slice(0, 1)
                }}</span>
                <div class="balance-row__name">
                  <strong>{{ player.nickname }}</strong>
                  <small
                    >{{ player.isHost ? '房主' : '玩家'
                    }}{{ player.id === me.id ? ' · 我' : '' }}</small
                  >
                </div>
                <strong class="balance-row__amount">
                  {{ formatMoney(player.balance) }} <small>M</small>
                </strong>
                <button
                  v-if="player.id !== me.id"
                  class="mini-button"
                  type="button"
                  @click="goPay('player', player.id)"
                >
                  付款
                </button>
              </div>

              <div class="balance-row balance-row--bank">
                <span class="player-avatar"><Landmark :size="18" :stroke-width="1.8" /></span>
                <div class="balance-row__name">
                  <strong>银行</strong>
                  <small>房主操作 · 余额无限</small>
                </div>
                <button class="mini-button" type="button" @click="goPay('bank')">付款</button>
              </div>
            </div>
          </div>

          <aside class="paper-card ledger-feed">
            <div class="section-head">
              <div>
                <p class="card-label">RECENT</p>
                <h2>最近流水</h2>
              </div>
              <ReceiptText :size="18" :stroke-width="1.8" />
            </div>

            <div v-if="transactions.length" class="tx-list">
              <TransactionRow
                v-for="transaction in transactions.slice(0, 8)"
                :key="transaction.id"
                :transaction="transaction"
                :me-id="me.id"
              />
            </div>
            <div v-else class="empty-feed">
              <ReceiptText :size="22" :stroke-width="1.5" />
              <p>还没有流水</p>
              <span>开局后，每笔付款会出现在这里。</span>
            </div>
          </aside>
        </section>

        <p v-if="error" class="form-error">{{ error }}</p>
      </main>
    </div>
  </div>
</template>
