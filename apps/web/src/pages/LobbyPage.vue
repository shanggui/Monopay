<script setup lang="ts">
import type { PlayerView, RoomSnapshot, WsServerEvent } from '@monopay/shared'
import {
  CircleCheck,
  Copy,
  Crown,
  Landmark,
  LoaderCircle,
  LogOut,
  QrCode,
  Users,
} from '@lucide/vue'
import QRCode from 'qrcode'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { dissolveRoom, getSnapshot } from '../services/api'
import { connectRoomSocket, type RoomSocket, type SocketStatus } from '../services/ws'
import { useSessionStore } from '../stores/session'

interface PlayerRow extends PlayerView {
  role: string
}

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const loading = ref(true)
const error = ref('')
const copied = ref(false)
const qrDataUrl = ref('')
const socketStatus = ref<SocketStatus>('offline')
let socket: RoomSocket | undefined

const code = computed(() => String(route.params.code ?? ''))
const room = computed(() => session.snapshot?.room ?? null)
const host = computed(() => session.snapshot?.host ?? null)
const isHost = computed(() => session.snapshot?.me.isHost ?? false)
const isDissolved = computed(() => room.value?.status === 'dissolved')
const roomUrl = computed(() => session.roomUrl ?? `${window.location.origin}/r/${code.value}`)

const playerRows = computed<PlayerRow[]>(() => {
  const snapshot = session.snapshot
  if (!snapshot) return []

  const rows: PlayerRow[] = snapshot.players.map((player) => ({
    ...player,
    role: player.isHost ? '房主' : '玩家',
  }))

  if (!snapshot.host.isPlayer) {
    rows.unshift({ ...snapshot.host, role: '银行' })
  }

  return rows
})

const socketLabel = computed(() => {
  if (socketStatus.value === 'online') return '实时连接'
  if (socketStatus.value === 'connecting') return '连接中'
  return '离线'
})

const statusLabel = computed(() => {
  switch (room.value?.status) {
    case 'playing':
      return '对局中'
    case 'settling':
      return '结算中'
    case 'settled':
      return '已结算'
    case 'dissolved':
      return '已解散'
    default:
      return '等待入座'
  }
})

function initials(player: PlayerView): string {
  return player.nickname.slice(0, 1)
}

async function refresh(): Promise<RoomSnapshot> {
  const token = session.token
  if (!token) {
    throw new Error('本机没有这桌的凭证')
  }
  const snapshot = await getSnapshot(code.value, token)
  session.setSnapshot(snapshot)
  return snapshot
}

async function renderQr(): Promise<void> {
  try {
    qrDataUrl.value = await QRCode.toDataURL(roomUrl.value, {
      width: 260,
      margin: 1,
      color: { dark: '#1A2433', light: '#FFFFFF' },
    })
  } catch {
    qrDataUrl.value = ''
  }
}

function handleSocketEvent(event: WsServerEvent): void {
  if (event.type === 'player_joined' || event.type === 'room_updated') {
    void refresh().catch(() => undefined)
  }
}

async function init(): Promise<void> {
  session.loadForRoom(code.value)

  if (!session.token) {
    await router.replace({ name: 'join-room', params: { code: code.value } })
    return
  }

  try {
    await refresh()
    await renderQr()
    socket = connectRoomSocket(code.value, session.token, handleSocketEvent, (status) => {
      socketStatus.value = status
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法进入房间'
  } finally {
    loading.value = false
  }
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(roomUrl.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1_600)
  } catch {
    error.value = '复制失败，请手动选择房号'
  }
}

async function dissolve(): Promise<void> {
  if (!isHost.value) return
  if (!window.confirm('解散后房间只读，确定解散吗？')) return

  try {
    const token = session.token
    if (!token) return
    await dissolveRoom(code.value, token)
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '解散失败'
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
      <AppHeader back label="房间大厅">
        <template #right>
          <span class="socket-state" :class="`socket-state--${socketStatus}`">
            <i></i>
            {{ socketLabel }}
          </span>
        </template>
      </AppHeader>

      <main v-if="loading" class="center-state">
        <LoaderCircle class="spinning" :size="26" :stroke-width="1.8" />
        <p>正在进入房间…</p>
      </main>

      <main v-else-if="error && !room" class="center-state center-state--error">
        <p>{{ error }}</p>
        <RouterLink class="text-link" to="/join">换一个房间</RouterLink>
      </main>

      <main v-else-if="room" class="lobby">
        <section class="lobby__hero">
          <div class="lobby__identity">
            <p class="eyebrow">TABLE / {{ room.code }}</p>
            <h1>{{ room.code }}</h1>
            <p class="lede">
              {{ statusLabel }} ·
              {{ room.hostIdentity === 'dual' ? '双身份房主' : '银行-only 房主' }}
            </p>

            <div class="lobby__badges">
              <span class="room-badge" :class="{ 'room-badge--muted': isDissolved }">
                <i></i>{{ statusLabel }}
              </span>
              <span class="room-badge room-badge--paper">
                <Users :size="14" :stroke-width="1.8" />
                {{ session.snapshot?.players.length ?? 0 }} / {{ room.config.maxPlayers }}
              </span>
              <span class="room-badge room-badge--paper">
                <Landmark :size="14" :stroke-width="1.8" />
                初始 {{ room.config.initialFunds.toLocaleString('zh-CN') }} M
              </span>
            </div>

            <button class="copy-link" type="button" @click="copyLink">
              <Copy :size="15" :stroke-width="1.8" />
              {{ copied ? '链接已复制' : '复制加入链接' }}
            </button>
          </div>

          <div v-if="isHost" class="qr-card">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="房间二维码" />
            <div v-else class="qr-card__placeholder"><QrCode :size="42" :stroke-width="1.4" /></div>
            <span>扫码加入</span>
          </div>
        </section>

        <section class="lobby__grid">
          <div class="paper-card seating-card">
            <div class="section-head">
              <div>
                <p class="card-label">SEATING</p>
                <h2>玩家</h2>
              </div>
              <span>{{ session.snapshot?.players.length ?? 0 }} 人</span>
            </div>

            <ul v-if="playerRows.length" class="player-list">
              <li v-for="player in playerRows" :key="player.id" class="player-row">
                <span class="player-avatar">{{ player.avatar || initials(player) }}</span>
                <span class="player-row__text">
                  <strong>{{ player.nickname }}</strong>
                  <small>{{ player.role }}</small>
                </span>
                <span v-if="player.isHost" class="player-crown">
                  <Crown :size="15" :stroke-width="1.8" />
                </span>
                <span v-else class="player-waiting">已入座</span>
              </li>
            </ul>

            <div v-else class="empty-seat">
              <Users :size="24" :stroke-width="1.5" />
              <p>还没有玩家入座</p>
              <span>把房号或二维码发给大家</span>
            </div>
          </div>

          <aside class="paper-card room-side">
            <div class="section-head">
              <div>
                <p class="card-label">ROOM NOTES</p>
                <h2>房间信息</h2>
              </div>
            </div>

            <dl class="room-facts">
              <div>
                <dt>房主</dt>
                <dd>{{ host?.nickname ?? '—' }}</dd>
              </div>
              <div>
                <dt>房主身份</dt>
                <dd>{{ room.hostIdentity === 'dual' ? '双身份' : '银行-only' }}</dd>
              </div>
              <div>
                <dt>工资</dt>
                <dd>{{ room.config.salary.toLocaleString('zh-CN') }} M</dd>
              </div>
              <div>
                <dt>大额确认</dt>
                <dd>{{ room.config.largeConfirmAmount.toLocaleString('zh-CN') }} M</dd>
              </div>
            </dl>

            <template v-if="isHost">
              <button class="primary-button" type="button" disabled>
                <CircleCheck :size="18" :stroke-width="1.8" />
                开始游戏 · M2 开放
              </button>
              <button class="ghost-button" type="button" @click="dissolve">
                <LogOut :size="16" :stroke-width="1.8" />
                解散房间
              </button>
            </template>
            <p v-else class="waiting-note">等待房主开始游戏。开局后不能加入新玩家。</p>

            <p v-if="error" class="form-error">{{ error }}</p>
          </aside>
        </section>
      </main>
    </div>
  </div>
</template>
