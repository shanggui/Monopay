import { onMounted, onUnmounted } from 'vue'

export function useVisibilityRefresh(callback: () => void): void {
  function handler(): void {
    if (document.visibilityState === 'visible') callback()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handler)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handler)
  })
}
