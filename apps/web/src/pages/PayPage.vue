<script setup lang="ts">
import type { PayRequest, PlayerView, TransactionCategory } from '@monopay/shared'
import { ArrowRight, Check, Landmark, LoaderCircle } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import MoneyKeypad from '../components/MoneyKeypad.vue'
import { feedback } from '../lib/feedback'
import { categoryLabels, formatMoney, playerCategories } from '../lib/format'
import { getSnapshot, pay } from '../services/api'
import { useSessionStore } from '../stores/session'

type ToType = 'player' | 'bank'
type Source = 'player' | 'bank'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const loading = ref(true)
const submitting = ref(false)
const online = ref(navigator.onLine)
const error = ref('')
const success = ref(false)
const toType = ref<ToType>('player')
const toPlayerId = ref('')
const amount = ref(100)
const category = ref<TransactionCategory>('rent')
const note = ref('')
const source = ref<Source>('player')

const code = computed(() => String(route.params.code ?? ''))
const snapshot = computed(() => session.snapshot)
const me = computed(() => snapshot.value?.me ?? null)
const players = computed(() => snapshot.value?.players ?? [])
const recipients = computed(() => players.value.filter((player) => player.id !== me.value?.id))
const canUseBank = computed(() => Boolean(me.value?.isHost && me.value.isPlayer))
const isBankSource = computed(() => source.value === 'bank' && canUseBank.value)
const availableCategories = computed<TransactionCategory[]>(() => {
  if (toType.value === 'bank') return ['tax', 'fine', 'purchase', 'chance', 'mortgage', 'other']
  if (isBankSource.value) return ['chance', 'mortgage', 'other']
  return playerCategories
})
const selectedPlayer = computed<PlayerView | null>(
  () => recipients.value.find((player) => player.id === toPlayerId.value) ?? null,
)
const targetLabel = computed(() =>
  toType.value === 'bank' ? '银行' : (selectedPlayer.value?.nickname ?? '选择玩家'),
)
const sourceLabel = computed(() => (isBankSource.value ? '银行' : '我的钱'))
const beforeBalance = computed(() => (isBankSource.value ? null : (me.value?.balance ?? 0)))
const afterBalance = computed(() => {
  if (beforeBalance.value === null) return null
  return beforeBalance.value - amount.value
})
const quickAmounts = [10, 50, 100, 200, 500]
const canSubmit = computed(
  () =>
    amount.value > 0 &&
    (toType.value === 'bank' || Boolean(selectedPlayer.value)) &&
    !(toType.value === 'bank' && isBankSource.value) &&
    (afterBalance.value === null || afterBalance.value >= 0) &&
    online.value &&
    !submitting.value,
)

function chooseRecipient(type: ToType, playerId = ''): void {
  toType.value = type
  toPlayerId.value = playerId
  if (type === 'bank' && isBankSource.value) {
    source.value = 'player'
  }
  if (!availableCategories.value.includes(category.value)) {
    category.value = availableCategories.value[0] ?? 'other'
  }
}

function chooseCategory(value: TransactionCategory): void {
  category.value = value
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

    const queryTo = route.query.to === 'bank' ? 'bank' : 'player'
    const queryPlayerId = String(route.query.playerId ?? '')
    if (queryTo === 'bank') {
      chooseRecipient('bank')
    } else if (queryPlayerId && recipients.value.some((player) => player.id === queryPlayerId)) {
      chooseRecipient('player', queryPlayerId)
    } else {
      chooseRecipient('player', recipients.value[0]?.id ?? '')
    }

    const stored = Number(localStorage.getItem('monopay.lastAmount'))
    if (Number.isInteger(stored) && stored > 0) {
      amount.value = stored
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取房间'
  } finally {
    loading.value = false
  }
}

watch([toType, source], () => {
  if (!availableCategories.value.includes(category.value)) {
    category.value = availableCategories.value[0] ?? 'other'
  }
})

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  if (isBankSource.value && toType.value === 'bank') {
    error.value = '银行不能给自己付款'
    return
  }

  const threshold = snapshot.value?.room.config.largeConfirmAmount ?? 0
  if (threshold > 0 && amount.value > threshold && category.value !== 'salary') {
    const confirmed = window.confirm(
      `这笔付款是 ${formatMoney(amount.value)} M，超过大额确认阈值 ${formatMoney(threshold)} M，确定继续吗？`,
    )
    if (!confirmed) return
  }

  error.value = ''
  submitting.value = true

  try {
    const token = session.token
    if (!token) return

    const payload: PayRequest = {
      toType: toType.value,
      ...(toType.value === 'player' ? { toPlayerId: toPlayerId.value } : {}),
      amount: amount.value,
      category: category.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
      ...(isBankSource.value ? { fromType: 'bank' } : {}),
      clientRequestId: crypto.randomUUID(),
    }

    const result = await pay(code.value, payload, token)
    session.setSnapshot(result.snapshot)
    localStorage.setItem('monopay.lastAmount', String(amount.value))
    success.value = true
    window.setTimeout(() => {
      void router.push(`/room/${code.value}/ledger`)
    }, 850)
  } catch (cause) {
    feedback('error')
    error.value = cause instanceof Error ? cause.message : '付款失败'
  } finally {
    submitting.value = false
  }
}

function syncOnline(): void {
  online.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', syncOnline)
  window.addEventListener('offline', syncOnline)
  void init()
})

onUnmounted(() => {
  window.removeEventListener('online', syncOnline)
  window.removeEventListener('offline', syncOnline)
})
</script>

<template>
  <div class="page page--app">
    <div class="page__dots" aria-hidden="true"></div>

    <div class="shell">
      <AppHeader back label="付款" />

      <main v-if="loading" class="center-state">
        <p>正在读取余额…</p>
      </main>

      <main v-else-if="snapshot && me" class="pay-page">
        <div class="pay-page__head">
          <p class="eyebrow">PAY / {{ snapshot.room.code }}</p>
          <h1>付给谁？</h1>
          <p class="lede">先选收款人，再输入金额。付款即时到账。</p>
        </div>

        <form class="pay-layout" @submit.prevent="submit">
          <div class="paper-card pay-form">
            <div class="form-field">
              <span>收款人</span>
              <div class="recipient-grid">
                <button
                  v-for="player in recipients"
                  :key="player.id"
                  class="recipient-card"
                  :class="{
                    'recipient-card--active': toType === 'player' && toPlayerId === player.id,
                  }"
                  type="button"
                  @click="chooseRecipient('player', player.id)"
                >
                  <span class="player-avatar">{{
                    player.avatar || player.nickname.slice(0, 1)
                  }}</span>
                  <span>
                    <strong>{{ player.nickname }}</strong>
                    <small>{{ formatMoney(player.balance) }} M</small>
                  </span>
                  <Check
                    v-if="toType === 'player' && toPlayerId === player.id"
                    :size="16"
                    :stroke-width="2"
                  />
                </button>

                <button
                  class="recipient-card recipient-card--bank"
                  :class="{ 'recipient-card--active': toType === 'bank' }"
                  type="button"
                  @click="chooseRecipient('bank')"
                >
                  <span class="player-avatar"><Landmark :size="19" :stroke-width="1.8" /></span>
                  <span>
                    <strong>银行</strong>
                    <small>税费 / 罚款 / 购买</small>
                  </span>
                  <Check v-if="toType === 'bank'" :size="16" :stroke-width="2" />
                </button>
              </div>
            </div>

            <div class="form-field">
              <span>金额</span>
              <div class="amount-display">
                <strong>{{ formatMoney(amount) }}</strong>
                <small>M</small>
              </div>
              <div class="quick-row">
                <button
                  v-for="quick in quickAmounts"
                  :key="quick"
                  type="button"
                  @click="amount = quick"
                >
                  {{ quick }}
                </button>
              </div>
              <MoneyKeypad v-model="amount" />
            </div>

            <div class="form-field">
              <span>类别</span>
              <div class="category-row">
                <button
                  v-for="item in availableCategories"
                  :key="item"
                  class="category-chip"
                  :class="{ 'category-chip--active': category === item }"
                  type="button"
                  @click="chooseCategory(item)"
                >
                  {{ categoryLabels[item] }}
                </button>
              </div>
            </div>

            <label class="form-field">
              <span>备注 <small>可选，最多 50 字</small></span>
              <input v-model="note" maxlength="50" placeholder="例如：过路费 / 机会卡" />
            </label>

            <div v-if="canUseBank" class="form-field">
              <span>资金来源</span>
              <div class="source-toggle">
                <button
                  type="button"
                  :class="{ 'source-toggle__button--active': source === 'player' }"
                  @click="source = 'player'"
                >
                  我的钱
                  <small>{{ formatMoney(me.balance) }} M</small>
                </button>
                <button
                  type="button"
                  :class="{ 'source-toggle__button--active': source === 'bank' }"
                  :disabled="toType === 'bank'"
                  @click="source = 'bank'"
                >
                  银行
                  <small>无限</small>
                </button>
              </div>
            </div>

            <p v-if="!online" class="form-error">当前网络离线，暂不能付款。恢复网络后再试。</p>
            <p v-if="error" class="form-error">{{ error }}</p>

            <button class="primary-button" type="submit" :disabled="!canSubmit">
              <LoaderCircle v-if="submitting" class="spinning" :size="18" :stroke-width="2" />
              <ArrowRight v-else :size="18" :stroke-width="1.9" />
              {{ submitting ? '正在付款' : '确认付款' }}
            </button>
          </div>

          <aside class="paper-card pay-summary">
            <p class="card-label">SUMMARY</p>
            <h2>这笔付款</h2>
            <dl>
              <div>
                <dt>从</dt>
                <dd>{{ sourceLabel }}</dd>
              </div>
              <div>
                <dt>给</dt>
                <dd>{{ targetLabel }}</dd>
              </div>
              <div>
                <dt>金额</dt>
                <dd class="pay-summary__amount">{{ formatMoney(amount) }} M</dd>
              </div>
              <div v-if="beforeBalance !== null">
                <dt>付款后</dt>
                <dd :class="{ 'money-negative': (afterBalance ?? 0) < 0 }">
                  {{ formatMoney(afterBalance ?? 0) }} M
                </dd>
              </div>
            </dl>
            <p v-if="beforeBalance !== null && (afterBalance ?? 0) < 0" class="form-error">
              余额不足，请先收款/抵押/变卖。
            </p>
            <p v-else class="pay-summary__note">
              {{ isBankSource ? '银行付款不占用个人余额。' : '付款后余额不能为负。' }}
            </p>
          </aside>
        </form>

        <div v-if="success" class="success-overlay" role="status">
          <div class="success-card">
            <span class="success-check"><Check :size="28" :stroke-width="2.2" /></span>
            <h2>已付款</h2>
            <p>{{ formatMoney(amount) }} M 已到账</p>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
