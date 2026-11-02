<script setup lang="ts">
import { Check, Palette, Volume2, VolumeX } from '@lucide/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { isMuted, setMuted } from '../lib/feedback'
import { applyTheme, loadTheme, themes, type ThemeId } from '../lib/theme'

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const current = ref<ThemeId>(loadTheme())
const muted = ref(isMuted())

function choose(id: ThemeId): void {
  current.value = id
  applyTheme(id)
  open.value = false
}

function toggleSound(): void {
  muted.value = !muted.value
  setMuted(muted.value)
}

function onOutside(event: PointerEvent): void {
  if (!open.value || !root.value) return
  if (!root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutside)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onOutside)
})
</script>

<template>
  <div ref="root" class="theme-control">
    <button
      class="icon-button"
      type="button"
      aria-label="外观与声音"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Palette :size="19" :stroke-width="1.8" />
    </button>

    <div v-if="open" class="theme-popover">
      <p class="card-label">APPEARANCE</p>
      <h3>外观</h3>

      <div class="theme-grid">
        <button
          v-for="theme in themes"
          :key="theme.id"
          class="theme-option"
          :class="{ 'theme-option--active': current === theme.id }"
          type="button"
          @click="choose(theme.id)"
        >
          <span
            class="theme-swatch"
            :style="{ background: theme.swatch, borderColor: theme.paper }"
          ></span>
          <span>{{ theme.label }}</span>
          <Check v-if="current === theme.id" :size="14" :stroke-width="2.2" />
        </button>
      </div>

      <button class="theme-sound" type="button" @click="toggleSound">
        <VolumeX v-if="muted" :size="17" :stroke-width="1.8" />
        <Volume2 v-else :size="17" :stroke-width="1.8" />
        {{ muted ? '音效已关闭' : '音效已开启' }}
      </button>
    </div>
  </div>
</template>
