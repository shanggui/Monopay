<script setup lang="ts">
import type { TransactionCategory, TransactionView } from '@monopay/shared'
import { Check, Landmark, LoaderCircle, ReceiptText, Wallet } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import TransactionRow from '../components/TransactionRow.vue'
import { categoryLabels, formatMoney } from '../lib/format'
import { bankCollect, bankPay, endGame, getSnapshot, salary, setBankrupt } from '../services/api'
import { connectRoomSocket, type RoomSocket, type SocketStatus } from '../services/ws'
import { useSessionStore } from '../stores/session'

type Mode = 'salary' | 'pay' | 'collect'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const success = ref('')
const mode = ref<Mode>('salary')
const playerId = ref('')
const amount = ref(200)
const category = ref<TransactionCategory>('chance')
const note = ref('')
const socketStatus = ref<SocketStatus>('offline')
let socket: RoomSocket | undefined

const code = computed(() => String(route.params.code ?? ''))
const snapshot = computed(() => session.snapshot)
const room = computed(() => snapshot.value?.room ?? null)
const me = computed(() => snapshot.value?.me ?? null)
const players = computed(() => snapshot.value?.players ?? [])
const bank = computed(() => snapshot.value?.bankSummary ?? { issued: 0, collected: 0, net: 0 })
const canSwitchLedger = computed(() => Boolean(me.value?.isPlayer))
const bankTransactions = computed<TransactionView[]>(() =>
  (snapshot.value?.transactions ?? []).filter(
    (transaction) => transaction.fromType === 'bank' || transaction.toType === 'bank',
  ),
)

const modeTitle = computed(() => {
  if (mode.value === 'salary') return '发工资'
  if (mode.value === 'pay') return '银行付款'
  return '银行收款'
})

const categoryOptions = computed<TransactionCategory[]>(() => {
  if (mode.value === 'pay') return ['chance', 'mortgage', 'correction', 'other']
  return ['tax', 'fine', 'purchase', 'correction', 'other']
})

const canSubmit = computed(() => Boolean(playerId.value) && amount.value > 0 && !submitting.value)

function setMode(next: Mode): void {
  mode.value = next
  error.value = ''
  success.value = ''
  if (next === 'salary') {
    amount.value = room.value?.config.salary ?? 200
  } else if (next === 'pay') {
    category.value = 'chance'
    amount.value = 200
  } else {
    category.value = 'tax'
    amount.value = 100
  }
}

async function refresh(): Promise<void> {
  const token = session.token
  if (!token) throw new Error('本机没有这桌的凭证')
  const data = await getSnapshot(code.value, token)
  session.setSnapshot(data)
}

async function finish(): Promise<void> {
  const token = session.token
  if (!token) return
  if (!window.confirm('结束游戏后进入结算中；确认结算前还可以返回对局。')) return
  try {
    const data = await endGame(code.value, token)
    session.setSnapshot(data)
    await router.push(`/room/${code.value}/settlement`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '结束游戏失败'
  }
}

async function toggleBankrupt(playerId: string, bankrupt: boolean): Promise<void> {
  const token = session.token
  if (!token) return
  try {
    const data = await setBankrupt(code.value, playerId, bankrupt, token)
    session.setSnapshot(data)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '标记破产失败'
  }
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  const token = session.token
  if (!token) return

  error.value = ''
  success.value = ''
  submitting.value = true

  try {
    const clientRequestId = crypto.randomUUID()
    let result

    if (mode.value === 'salary') {
      result = await salary(
        code.value,
        { toPlayerId: playerId.value, amount: amount.value, clientRequestId },
        token,
      )
    } else if (mode.value === 'pay') {
      result = await bankPay(
        code.value,
        {
          toPlayerId: playerId.value,
          amount: amount.value,
          category: category.value,
          ...(note.value.trim() ? { note: note.value.trim() } : {}),
          clientRequestId,
        },
        token,
      )
    } else {
      result = await bankCollect(
        code.value,
        {
          fromPlayerId: playerId.value,
          amount: amount.value,
          category: category.value,
          ...(note.value.trim() ? { note: note.value.trim() } : {}),
          clientRequestId,
        },
        token,
      )
    }

    session.setSnapshot(result.snapshot)
    success.value = `${modeTitle.value} ${formatMoney(amount.value)} M 已记账`
    note.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '银行操作失败'
  } finally {
    submitting.value = false
  }
}

function handleSocketEvent(): void {
  void refresh().catch(() => undefined)
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

    if (!data.me.isHost) {
      await router.replace({ name: 'ledger', params: { code: code.value } })
      return
    }

    playerId.value = data.players.find((player) => !player.isHost)?.id ?? data.players[0]?.id ?? ''
    amount.value = data.room.config.salary
    socket = connectRoomSocket(code.value, session.token, handleSocketEvent, (status) => {
      socketStatus.value = status
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取银行台'
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
      <AppHeader back label="银行台">
        <template #right>
          <span class="socket-state" :class="`socket-state--${socketStatus}`">
            <i></i>
            {{ socketStatus === 'online' ? '实时连接' : '离线' }}
          </span>
        </template>
      </AppHeader>

      <main v-if="loading" class="center-state">
        <p>正在打开银行台…</p>
      </main>

      <main v-else-if="snapshot && room && me" class="bank-page">
        <section class="bank-hero">
          <div>
            <p class="eyebrow">BANK DESK / {{ room.code }}</p>
            <h1>银行台</h1>
            <p class="lede">发工资、记录机会卡、收税费，或做矫正。银行余额无限。</p>
          </div>

          <div class="bank-metrics">
            <div>
              <span>累计发行</span>
              <strong>{{ formatMoney(bank.issued) }} <small>M</small></strong>
            </div>
            <div>
              <span>累计回收</span>
              <strong>{{ formatMoney(bank.collected) }} <small>M</small></strong>
            </div>
            <div>
              <span>净投放</span>
              <strong>{{ formatMoney(bank.net) }} <small>M</small></strong>
            </div>
          </div>
        </section>

        <div class="ledger-actions">
          <button
            v-if="canSwitchLedger"
            class="secondary-button"
            type="button"
            @click="router.push(`/room/${code}/ledger`)"
          >
            <Wallet :size="18" :stroke-width="1.8" />
            切换到我的账本
          </button>
          <button
            class="secondary-button"
            type="button"
            @click="router.push(`/room/${code}/transactions`)"
          >
            <ReceiptText :size="18" :stroke-width="1.8" />
            全部流水
          </button>
          <button
            v-if="room.status === 'playing'"
            class="secondary-button"
            type="button"
            @click="finish"
          >
            结束游戏
          </button>
          <button
            v-if="room.status !== 'playing'"
            class="secondary-button"
            type="button"
            @click="router.push(`/room/${code}/settlement`)"
          >
            对账
          </button>
        </div>

        <section class="bank-grid">
          <div class="paper-card balance-list-card">
            <div class="section-head">
              <div>
                <p class="card-label">BANK VIEW</p>
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
                  <small>{{ player.isHost ? '房主 / 玩家' : '玩家' }}</small>
                </div>
                <strong class="balance-row__amount">
                  {{ formatMoney(player.balance) }} <small>M</small>
                </strong>
                <button
                  class="mini-button"
                  type="button"
                  :class="{ 'mini-button--danger': player.status !== 'bankrupt' }"
                  @click="toggleBankrupt(player.id, player.status !== 'bankrupt')"
                >
                  {{ player.status === 'bankrupt' ? '取消破产' : '标记破产' }}
                </button>
              </div>
            </div>
          </div>

          <aside class="paper-card bank-action-card">
            <div class="section-head">
              <div>
                <p class="card-label">BANK ACTION</p>
                <h2>{{ modeTitle }}</h2>
              </div>
              <Landmark :size="19" :stroke-width="1.8" />
            </div>

            <div class="mode-tabs">
              <button
                type="button"
                :class="{ 'mode-tab--active': mode === 'salary' }"
                @click="setMode('salary')"
              >
                发工资
              </button>
              <button
                type="button"
                :class="{ 'mode-tab--active': mode === 'pay' }"
                @click="setMode('pay')"
              >
                银行付款
              </button>
              <button
                type="button"
                :class="{ 'mode-tab--active': mode === 'collect' }"
                @click="setMode('collect')"
              >
                银行收款
              </button>
            </div>

            <form class="bank-form" @submit.prevent="submit">
              <label class="form-field">
                <span>{{ mode === 'collect' ? '从哪个玩家收' : '付给哪个玩家' }}</span>
                <select v-model="playerId">
                  <option v-for="player in players" :key="player.id" :value="player.id">
                    {{ player.nickname }} · {{ formatMoney(player.balance) }} M
                  </option>
                </select>
              </label>

              <label class="form-field">
                <span>金额</span>
                <div class="money-input">
                  <input
                    v-model.number="amount"
                    type="number"
                    min="1"
                    max="1000000000"
                    inputmode="numeric"
                  />
                  <b>M</b>
                </div>
              </label>

              <div v-if="mode !== 'salary'" class="form-field">
                <span>类别</span>
                <div class="category-row">
                  <button
                    v-for="item in categoryOptions"
                    :key="item"
                    class="category-chip"
                    :class="{ 'category-chip--active': category === item }"
                    type="button"
                    @click="category = item"
                  >
                    {{ categoryLabels[item] }}
                  </button>
                </div>
              </div>

              <label v-if="mode !== 'salary'" class="form-field">
                <span>备注 <small>可选</small></span>
                <input v-model="note" maxlength="50" placeholder="例如：机会卡 / 矫正原因" />
              </label>

              <p v-if="error" class="form-error">{{ error }}</p>
              <p v-if="success" class="form-success">{{ success }}</p>

              <button class="primary-button" type="submit" :disabled="!canSubmit">
                <LoaderCircle v-if="submitting" class="spinning" :size="18" :stroke-width="2" />
                <Check v-else :size="18" :stroke-width="2" />
                {{ submitting ? '正在记账' : '确认记账' }}
              </button>
            </form>
          </aside>
        </section>

        <section class="paper-card bank-feed">
          <div class="section-head">
            <div>
              <p class="card-label">BANK LEDGER</p>
              <h2>最近银行流水</h2>
            </div>
            <ReceiptText :size="18" :stroke-width="1.8" />
          </div>
          <div v-if="bankTransactions.length" class="tx-list">
            <TransactionRow
              v-for="transaction in bankTransactions.slice(0, 8)"
              :key="transaction.id"
              :transaction="transaction"
              :me-id="me.id"
            />
          </div>
          <p v-else class="empty-feed">还没有银行流水。</p>
        </section>
      </main>
    </div>
  </div>
</template>
