<script setup lang="ts">
import { WifiOff } from '@lucide/vue'
import { onMounted, onUnmounted, ref } from 'vue'

const online = ref(navigator.onLine)

function sync(): void {
  online.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', sync)
  window.addEventListener('offline', sync)
})

onUnmounted(() => {
  window.removeEventListener('online', sync)
  window.removeEventListener('offline', sync)
})
</script>

<template>
  <Transition name="toast">
    <div v-if="!online" class="offline-banner" role="status">
      <WifiOff :size="15" :stroke-width="1.8" />
      网络已断开，付款暂停；恢复后自动继续。
    </div>
  </Transition>
</template>
