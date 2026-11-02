<script setup lang="ts">
import type { AssetView, RankingEntry } from '@monopay/shared'
import { Calculator, Check, RotateCcw, Trophy } from '@lucide/vue'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { formatMoney } from '../lib/format'
import { useVisibilityRefresh } from '../lib/useVisibilityRefresh'
import { confirmSettlement, endGame, getSnapshot, resumeGame, updateAssets } from '../services/api'
import { connectRoomSocket, type RoomSocket } from '../services/ws'
import { useSessionStore } from '../stores/session'

interface AssetDraft {
  propertyValue: number
  debt: number
  note: string
}

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const success = ref('')
const drafts = reactive<Record<string, AssetDraft>>({})
let socket: RoomSocket | undefined

const code = computed(() => String(route.params.code ?? ''))
const snapshot = computed(() => session.snapshot)
const me = computed(() => snapshot.value?.me ?? null)
const room = computed(() => snapshot.value?.room ?? null)
const assets = computed<AssetView[]>(() => snapshot.value?.assets ?? [])
const rankings = computed<RankingEntry[]>(() => snapshot.value?.settlement?.rankings ?? [])
const isHost = computed(() => me.value?.isHost ?? false)
const isSettling = computed(() => room.value?.status === 'settling')
const isSettled = computed(() => room.value?.status === 'settled')
function canEditAsset(asset: AssetView): boolean {
  if (!isSettling.value || !me.value) return false
  return isHost.value || asset.playerId === me.value.id
}

function syncDrafts(): void {
  for (const asset of assets.value) {
    drafts[asset.playerId] = {
      propertyValue: asset.propertyValue,
      debt: asset.debt,
      note: asset.note ?? '',
    }
  }
}

async function refresh(): Promise<void> {
  const token = session.token
  if (!token) throw new Error('本机没有这桌的凭证')
  const data = await getSnapshot(code.value, token)
  session.setSnapshot(data)
  syncDrafts()
}

function netFor(asset: AssetView): number {
  const draft = drafts[asset.playerId]
  return asset.cash + (draft?.propertyValue ?? asset.propertyValue) - (draft?.debt ?? asset.debt)
}

async function save(asset: AssetView): Promise<void> {
  const token = session.token
  if (!token || !me.value) return
  const draft = drafts[asset.playerId]
  if (!draft) return

  let reason: string | undefined
  if (isHost.value && asset.playerId !== me.value.id) {
    const input = window.prompt('代填/修正原因（必填）')
    if (!input?.trim()) return
    reason = input.trim()
  }

  submitting.value = true
  error.value = ''
  success.value = ''

  try {
    const data = await updateAssets(
      code.value,
      {
        playerId: asset.playerId,
        propertyValue: Math.max(0, Number(draft.propertyValue) || 0),
        debt: Math.max(0, Number(draft.debt) || 0),
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
        ...(reason ? { reason } : {}),
      },
      token,
    )
    session.setSnapshot(data)
    syncDrafts()
    success.value = `${asset.nickname} 的资产已保存`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存资产失败'
  } finally {
    submitting.value = false
  }
}

async function end(): Promise<void> {
  const token = session.token
  if (!token || !isHost.value) return
  if (!window.confirm('结束游戏后进入结算中；确认结算前还可以返回对局。')) return

  submitting.value = true
  error.value = ''
  try {
    const data = await endGame(code.value, token)
    session.setSnapshot(data)
    syncDrafts()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '结束游戏失败'
  } finally {
    submitting.value = false
  }
}

async function resume(): Promise<void> {
  const token = session.token
  if (!token || !isHost.value) return
  submitting.value = true
  error.value = ''
  try {
    const data = await resumeGame(code.value, token)
    session.setSnapshot(data)
    syncDrafts()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '返回对局失败'
  } finally {
    submitting.value = false
  }
}

async function confirm(): Promise<void> {
  const token = session.token
  if (!token || !isHost.value) return
  if (!window.confirm('确认结算后房间只读，不能再付款、退款或冲正。确定吗？')) return

  submitting.value = true
  error.value = ''
  try {
    const result = await confirmSettlement(code.value, token)
    session.setSnapshot(result.snapshot)
    success.value = '结算已确认'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '确认结算失败'
  } finally {
    submitting.value = false
  }
}

function handleSocketEvent(): void {
  void refresh().catch(() => undefined)
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
    syncDrafts()
    socket = connectRoomSocket(code.value, session.token, handleSocketEvent)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取对账页'
  } finally {
    loading.value = false
  }
}

useVisibilityRefresh(() => {
  void refresh().catch(() => undefined)
})

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
      <AppHeader back label="对账" />

      <main v-if="loading" class="center-state">
        <p>正在读取对账页…</p>
      </main>

      <main v-else-if="snapshot && me && room" class="settlement-page">
        <section class="settlement-hero">
          <div>
            <p class="eyebrow">SETTLE / {{ room.code }}</p>
            <h1>{{ isSettled ? '结算完成' : '对账' }}</h1>
            <p class="lede">
              净资产 = 现金 + 资产估值 − 负债。{{
                isSettled ? '本局已只读。' : '确认结算前仍可修正。'
              }}
            </p>
          </div>
          <div class="settlement-status" :class="{ 'settlement-status--done': isSettled }">
            <Calculator :size="18" :stroke-width="1.8" />
            {{ isSettled ? '已结算' : isSettling ? '结算中' : '对局中' }}
          </div>
        </section>

        <div v-if="isHost" class="ledger-actions">
          <button
            v-if="room.status === 'playing'"
            class="primary-button"
            type="button"
            :disabled="submitting"
            @click="end"
          >
            结束游戏，进入结算
          </button>
          <button
            v-if="isSettling"
            class="secondary-button"
            type="button"
            :disabled="submitting"
            @click="resume"
          >
            <RotateCcw :size="17" :stroke-width="1.8" />
            返回对局
          </button>
          <button
            v-if="isSettling"
            class="primary-button"
            type="button"
            :disabled="submitting"
            @click="confirm"
          >
            <Check :size="18" :stroke-width="2" />
            确认结算
          </button>
        </div>

        <section v-if="!isSettled" class="settlement-grid">
          <div v-for="asset in assets" :key="asset.playerId" class="paper-card asset-card">
            <div class="section-head">
              <div class="asset-player">
                <span class="player-avatar">{{ asset.avatar || asset.nickname.slice(0, 1) }}</span>
                <div>
                  <h2>{{ asset.nickname }}</h2>
                  <span>现金 {{ formatMoney(asset.cash) }} M</span>
                </div>
              </div>
              <strong class="asset-net">{{ formatMoney(netFor(asset)) }} M</strong>
            </div>

            <div class="asset-inputs">
              <label class="form-field">
                <span>资产估值</span>
                <div class="money-input">
                  <input
                    v-model.number="drafts[asset.playerId].propertyValue"
                    type="number"
                    min="0"
                    :disabled="!canEditAsset(asset)"
                  />
                  <b>M</b>
                </div>
              </label>
              <label class="form-field">
                <span>负债</span>
                <div class="money-input">
                  <input
                    v-model.number="drafts[asset.playerId].debt"
                    type="number"
                    min="0"
                    :disabled="!canEditAsset(asset)"
                  />
                  <b>M</b>
                </div>
              </label>
            </div>

            <p v-if="asset.reason" class="asset-reason">房主修正：{{ asset.reason }}</p>
            <button
              v-if="canEditAsset(asset)"
              class="secondary-button asset-save"
              type="button"
              :disabled="submitting"
              @click="save(asset)"
            >
              保存 {{ asset.nickname }}
            </button>
          </div>
        </section>

        <section v-else class="paper-card rankings-card">
          <div class="section-head">
            <div>
              <p class="card-label">FINAL RANKING</p>
              <h2>净资产排名</h2>
            </div>
            <Trophy :size="20" :stroke-width="1.8" />
          </div>

          <div class="rankings">
            <div v-for="entry in rankings" :key="entry.playerId" class="ranking-row">
              <span class="ranking-number">{{ entry.rank }}</span>
              <span class="player-avatar">{{ entry.avatar || entry.nickname.slice(0, 1) }}</span>
              <div class="ranking-name">
                <strong>{{ entry.nickname }}</strong>
                <small v-if="entry.bankrupt">破产</small>
              </div>
              <div class="ranking-numbers">
                <span>现金 {{ formatMoney(entry.cash) }}</span>
                <span>资产 {{ formatMoney(entry.propertyValue) }}</span>
                <span>负债 {{ formatMoney(entry.debt) }}</span>
              </div>
              <strong class="ranking-net">{{ formatMoney(entry.net) }} M</strong>
            </div>
          </div>
        </section>

        <p class="compliance-note">仅使用游戏币 M，不可充值、提现或兑换现金。</p>
        <p v-if="success" class="form-success">{{ success }}</p>
        <p v-if="error" class="form-error">{{ error }}</p>
      </main>
    </div>
  </div>
</template>
