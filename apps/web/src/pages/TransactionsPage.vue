<script setup lang="ts">
import type { TransactionFilter, TransactionPage, TransactionView } from '@monopay/shared'
import { LoaderCircle, ReceiptText, X } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import TransactionRow from '../components/TransactionRow.vue'
import { categoryLabels, formatMoney, formatTime } from '../lib/format'
import { getSnapshot, getTransactions, refund, reverse } from '../services/api'
import { connectRoomSocket, type RoomSocket, type SocketStatus } from '../services/ws'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const filters: Array<{ value: TransactionFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'sent', label: '我付出' },
  { value: 'received', label: '我收到' },
  { value: 'bank', label: '银行' },
]

const filter = ref<TransactionFilter>('all')
const page = ref<TransactionPage>({ items: [], hasMore: false, nextCursor: null })
const loading = ref(true)
const loadingMore = ref(false)
const actionLoading = ref(false)
const error = ref('')
const detail = ref<TransactionView | null>(null)
const socketStatus = ref<SocketStatus>('offline')
let socket: RoomSocket | undefined

const code = computed(() => String(route.params.code ?? ''))
const snapshot = computed(() => session.snapshot)
const me = computed(() => snapshot.value?.me ?? null)
const room = computed(() => snapshot.value?.room ?? null)

function canRefund(transaction: TransactionView): boolean {
  if (!me.value || transaction.status !== 'success') return false
  if (['initial', 'refund', 'reversal'].includes(transaction.category)) return false
  if (transaction.toType === 'bank') return me.value.isHost
  return transaction.toPlayerId === me.value.id
}

function canReverse(transaction: TransactionView): boolean {
  if (!me.value?.isHost || transaction.status !== 'success') return false
  return !['initial', 'refund', 'reversal'].includes(transaction.category)
}

async function load(reset = false): Promise<void> {
  const token = session.token
  if (!token) return

  if (reset) {
    page.value = { items: [], hasMore: false, nextCursor: null }
  }

  const data = await getTransactions(
    code.value,
    token,
    filter.value,
    reset ? undefined : (page.value.nextCursor ?? undefined),
  )

  page.value = reset
    ? data
    : {
        items: [...page.value.items, ...data.items],
        hasMore: data.hasMore,
        nextCursor: data.nextCursor,
      }
}

async function refreshAll(): Promise<void> {
  const token = session.token
  if (!token) return
  const data = await getSnapshot(code.value, token)
  session.setSnapshot(data)
  await load(true)
}

function handleSocketEvent(): void {
  void refreshAll().catch(() => undefined)
}

async function selectFilter(next: TransactionFilter): Promise<void> {
  if (filter.value === next) return
  filter.value = next
  loading.value = true
  try {
    await load(true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '读取流水失败'
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (!page.value.hasMore || loadingMore.value) return
  loadingMore.value = true
  try {
    await load(false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载更多失败'
  } finally {
    loadingMore.value = false
  }
}

async function doRefund(): Promise<void> {
  if (!detail.value || !session.token) return
  if (!window.confirm(`确定全额退款 ${formatMoney(detail.value.amount)} M？`)) return
  actionLoading.value = true
  error.value = ''

  try {
    await refund(
      code.value,
      {
        transactionId: detail.value.id,
        clientRequestId: crypto.randomUUID(),
      },
      session.token,
    )
    detail.value = null
    await refreshAll()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '退款失败'
  } finally {
    actionLoading.value = false
  }
}

async function doReverse(): Promise<void> {
  if (!detail.value || !session.token) return
  const reason = window.prompt('冲正原因（必填）')
  if (!reason?.trim()) return
  actionLoading.value = true
  error.value = ''

  try {
    await reverse(
      code.value,
      {
        transactionId: detail.value.id,
        reason: reason.trim(),
        clientRequestId: crypto.randomUUID(),
      },
      session.token,
    )
    detail.value = null
    await refreshAll()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '冲正失败'
  } finally {
    actionLoading.value = false
  }
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
    await load(true)
    socket = connectRoomSocket(code.value, session.token, handleSocketEvent, (status) => {
      socketStatus.value = status
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取流水'
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
      <AppHeader back label="流水">
        <template #right>
          <span class="socket-state" :class="`socket-state--${socketStatus}`">
            <i></i>
            {{ socketStatus === 'online' ? '实时连接' : '离线' }}
          </span>
        </template>
      </AppHeader>

      <main class="tx-page">
        <div class="tx-page__head">
          <p class="eyebrow">LEDGER / {{ room?.code ?? code }}</p>
          <h1>流水</h1>
          <p class="lede">每笔付款都可以追溯。退款由收款方发起，冲正由房主操作。</p>
        </div>

        <div class="tx-tabs" role="tablist" aria-label="流水筛选">
          <button
            v-for="item in filters"
            :key="item.value"
            type="button"
            role="tab"
            :aria-selected="filter === item.value"
            class="tx-tab"
            :class="{ 'tx-tab--active': filter === item.value }"
            @click="selectFilter(item.value)"
          >
            {{ item.label }}
          </button>
        </div>

        <div v-if="loading" class="center-state">
          <LoaderCircle class="spinning" :size="24" :stroke-width="1.8" />
          <p>正在读取流水…</p>
        </div>

        <div v-else-if="page.items.length" class="paper-card tx-page__list">
          <button
            v-for="transaction in page.items"
            :key="transaction.id"
            class="tx-row-button"
            type="button"
            @click="detail = transaction"
          >
            <TransactionRow :transaction="transaction" :me-id="me?.id ?? ''" />
          </button>

          <button
            v-if="page.hasMore"
            class="ghost-button tx-load-more"
            type="button"
            :disabled="loadingMore"
            @click="loadMore"
          >
            <LoaderCircle v-if="loadingMore" class="spinning" :size="16" :stroke-width="2" />
            {{ loadingMore ? '加载中' : '加载更多' }}
          </button>
        </div>

        <div v-else class="paper-card empty-feed tx-empty">
          <ReceiptText :size="24" :stroke-width="1.5" />
          <p>没有符合条件的流水</p>
          <span>换个筛选，或先完成一笔付款。</span>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>
      </main>
    </div>

    <div v-if="detail" class="detail-overlay" @click.self="detail = null">
      <div class="detail-card">
        <button class="detail-close" type="button" aria-label="关闭" @click="detail = null">
          <X :size="18" :stroke-width="2" />
        </button>

        <p class="card-label">TRANSACTION / #{{ detail.seq }}</p>
        <h2>{{ categoryLabels[detail.category] }}</h2>

        <div class="detail-route">
          <strong>{{ detail.fromName }}</strong>
          <span>→</span>
          <strong>{{ detail.toName }}</strong>
        </div>

        <strong class="detail-amount">{{ formatMoney(detail.amount) }} M</strong>

        <dl class="detail-facts">
          <div>
            <dt>时间</dt>
            <dd>{{ formatTime(detail.createdAt) }}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>
              {{
                detail.status === 'success'
                  ? '已入账'
                  : detail.status === 'refunded'
                    ? '已退款'
                    : '已冲正'
              }}
            </dd>
          </div>
          <div v-if="detail.note">
            <dt>备注</dt>
            <dd>{{ detail.note }}</dd>
          </div>
          <div v-if="detail.refundOf">
            <dt>关联</dt>
            <dd>退款自 #{{ detail.refundOf.slice(0, 8) }}</dd>
          </div>
          <div v-if="detail.reversalOf">
            <dt>关联</dt>
            <dd>冲正自 #{{ detail.reversalOf.slice(0, 8) }}</dd>
          </div>
        </dl>

        <div class="detail-actions">
          <button
            v-if="canRefund(detail)"
            class="primary-button"
            type="button"
            :disabled="actionLoading"
            @click="doRefund"
          >
            全额退款
          </button>
          <button
            v-if="canReverse(detail)"
            class="secondary-button"
            type="button"
            :disabled="actionLoading"
            @click="doReverse"
          >
            冲正
          </button>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
