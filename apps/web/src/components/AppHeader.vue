<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'
import { useRouter } from 'vue-router'
import BrandMark from './BrandMark.vue'
import ThemePicker from './ThemePicker.vue'

withDefaults(
  defineProps<{
    back?: boolean
    label?: string
  }>(),
  { back: false, label: '桌游账房' },
)

const router = useRouter()
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <button
        v-if="back"
        class="icon-button"
        type="button"
        aria-label="返回"
        @click="router.back()"
      >
        <ChevronLeft :size="20" :stroke-width="1.9" />
      </button>
      <BrandMark :compact="back" />
      <div class="app-header__brand">
        <p>Monopay</p>
        <span>{{ label }}</span>
      </div>
    </div>

    <div class="app-header__right">
      <slot name="right" />
      <ThemePicker />
    </div>
  </header>
</template>
