<script setup lang="ts">
import type { TransactionView } from '@monopay/shared'
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from '@lucide/vue'
import { computed } from 'vue'
import { categoryLabels, formatMoney, formatTime, isIncoming, isOutgoing } from '../lib/format'

const props = defineProps<{
  transaction: TransactionView
  meId: string
}>()

const incoming = computed(() => isIncoming(props.transaction, props.meId))
const outgoing = computed(() => isOutgoing(props.transaction, props.meId))
const amountClass = computed(() => {
  if (incoming.value) return 'tx-amount--in'
  if (outgoing.value) return 'tx-amount--out'
  return ''
})
const sign = computed(() => {
  if (incoming.value) return '+'
  if (outgoing.value) return '−'
  return ''
})
const statusLabel = computed(() => {
  if (props.transaction.status === 'refunded') return '已退款'
  if (props.transaction.status === 'reversed') return '已冲正'
  return '已入账'
})
</script>

<template>
  <div class="tx-row">
    <span class="tx-icon" :class="{ 'tx-icon--in': incoming, 'tx-icon--out': outgoing }">
      <ArrowDownLeft v-if="incoming" :size="16" :stroke-width="1.8" />
      <ArrowUpRight v-else-if="outgoing" :size="16" :stroke-width="1.8" />
      <ReceiptText v-else :size="16" :stroke-width="1.8" />
    </span>

    <div class="tx-main">
      <p>
        <strong>{{ transaction.fromName }}</strong>
        <span>→</span>
        <strong>{{ transaction.toName }}</strong>
      </p>
      <small>
        {{ categoryLabels[transaction.category] }} · {{ formatTime(transaction.createdAt) }}
        <template v-if="transaction.note"> · {{ transaction.note }}</template>
      </small>
    </div>

    <div class="tx-side">
      <strong :class="['tx-amount', amountClass]">
        {{ sign }}{{ formatMoney(transaction.amount) }} M
      </strong>
      <small>{{ statusLabel }}</small>
    </div>
  </div>
</template>
