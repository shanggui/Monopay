import type { RoomSnapshot } from '@monopay/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const LAST_ROOM_KEY = 'monopay.lastRoom'
const LAST_URL_KEY = 'monopay.lastRoomUrl'

function hostKey(code: string): string {
  return `monopay.room.${code}.hostToken`
}

function playerKey(code: string): string {
  return `monopay.room.${code}.playerToken`
}

export const useSessionStore = defineStore('session', () => {
  const roomCode = ref<string | null>(null)
  const hostToken = ref<string | null>(null)
  const playerToken = ref<string | null>(null)
  const snapshot = ref<RoomSnapshot | null>(null)
  const roomUrl = ref<string | null>(localStorage.getItem(LAST_URL_KEY))
  const lastRoomCode = ref<string | null>(localStorage.getItem(LAST_ROOM_KEY))
  const loading = ref(false)
  const error = ref('')

  const token = computed(() => hostToken.value ?? playerToken.value)
  const isHost = computed(() => snapshot.value?.me.isHost ?? false)
  const isBankOnlyHost = computed(() =>
    Boolean(snapshot.value?.me.isHost && !snapshot.value.me.isPlayer),
  )

  function loadForRoom(code: string): void {
    roomCode.value = code
    hostToken.value = localStorage.getItem(hostKey(code))
    playerToken.value = localStorage.getItem(playerKey(code))
  }

  function rememberRoom(code: string, url?: string): void {
    lastRoomCode.value = code
    localStorage.setItem(LAST_ROOM_KEY, code)
    if (url) {
      roomUrl.value = url
      localStorage.setItem(LAST_URL_KEY, url)
    }
  }

  function setHost(code: string, rawToken: string, url: string): void {
    loadForRoom(code)
    hostToken.value = rawToken
    playerToken.value = null
    localStorage.setItem(hostKey(code), rawToken)
    localStorage.removeItem(playerKey(code))
    rememberRoom(code, url)
  }

  function setPlayer(code: string, rawToken: string): void {
    playerToken.value = rawToken
    localStorage.setItem(playerKey(code), rawToken)
    rememberRoom(code, `${window.location.origin}/r/${code}`)
  }

  function setSnapshot(value: RoomSnapshot): void {
    snapshot.value = value
  }

  function clearError(): void {
    error.value = ''
  }

  function clear(): void {
    roomCode.value = null
    hostToken.value = null
    playerToken.value = null
    snapshot.value = null
    loading.value = false
    error.value = ''
  }

  return {
    roomCode,
    hostToken,
    playerToken,
    snapshot,
    roomUrl,
    lastRoomCode,
    loading,
    error,
    token,
    isHost,
    isBankOnlyHost,
    loadForRoom,
    rememberRoom,
    setHost,
    setPlayer,
    setSnapshot,
    clearError,
    clear,
  }
})
