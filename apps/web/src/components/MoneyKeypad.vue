<script setup lang="ts">
import { Delete } from '@lucide/vue'
import { ref, watch } from 'vue'
import { playFeedback } from '../lib/feedback'

const props = withDefaults(
  defineProps<{
    modelValue: number
    max?: number
  }>(),
  { max: 1_000_000_000 },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const raw = ref(props.modelValue > 0 ? String(props.modelValue) : '')

watch(
  () => props.modelValue,
  (value) => {
    const next = value > 0 ? String(value) : ''
    if (Number(raw.value || '0') !== value) raw.value = next
  },
)

function update(next: string): void {
  const normalized = next.replace(/^0+(?=\d)/, '').slice(0, 9)
  raw.value = normalized
  emit('update:modelValue', normalized ? Math.min(Number(normalized), props.max) : 0)
}

function press(key: string): void {
  playFeedback('tap')
  if (key === 'back') {
    update(raw.value.slice(0, -1))
    return
  }
  if (key === '00') {
    update(raw.value ? `${raw.value}00` : '0')
    return
  }
  update(`${raw.value}${key}`)
}

function clear(): void {
  playFeedback('tap')
  update('')
}
</script>

<template>
  <div class="money-keypad" role="group" aria-label="金额键盘">
    <div class="money-keypad__head">
      <span>输入金额</span>
      <button type="button" @click="clear">清零</button>
    </div>

    <div class="money-keypad__grid">
      <button
        v-for="key in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
        :key="key"
        type="button"
        @click="press(key)"
      >
        {{ key }}
      </button>
      <button type="button" @click="press('00')">00</button>
      <button type="button" @click="press('0')">0</button>
      <button type="button" aria-label="退格" @click="press('back')">
        <Delete :size="20" :stroke-width="1.8" />
      </button>
    </div>
  </div>
</template>
