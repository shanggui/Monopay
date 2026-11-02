<script setup lang="ts">
import type { HealthData, ReadyData } from '@monopay/shared'
import { Database, RefreshCw, Server, ShieldCheck } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

type CheckState = 'checking' | 'ok' | 'error'

interface MetaData {
  name: string
  version: string
  initializedAt: string
}

const apiState = ref<CheckState>('checking')
const dbState = ref<CheckState>('checking')
const meta = ref<MetaData | null>(null)
const errorMessage = ref('')
const lastCheckedAt = ref<Date | null>(null)

const checking = computed(() => apiState.value === 'checking' || dbState.value === 'checking')
const allReady = computed(() => apiState.value === 'ok' && dbState.value === 'ok')

const headline = computed(() => {
  if (checking.value) return '正在核对…'
  return allReady.value ? '系统已就绪' : '还有一项没接通'
})

const apiLabel = computed(() => {
  if (apiState.value === 'checking') return '检查中'
  return apiState.value === 'ok' ? '正常' : '异常'
})

const dbLabel = computed(() => {
  if (dbState.value === 'checking') return '检查中'
  return dbState.value === 'ok' ? '正常' : '异常'
})

async function getJson<T>(
  url: string,
): Promise<{ ok: boolean; data?: T; error?: { message: string } }> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })

  const body = (await response.json()) as {
    ok: boolean
    data?: T
    error?: { message: string }
  }

  if (!response.ok || !body.ok) {
    throw new Error(body.error?.message ?? `请求失败（${response.status}）`)
  }

  return body
}

async function check(): Promise<void> {
  apiState.value = 'checking'
  dbState.value = 'checking'
  errorMessage.value = ''

  try {
    await getJson<HealthData>('/healthz')
    apiState.value = 'ok'
  } catch (error) {
    apiState.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'API 无法连接'
  }

  try {
    await getJson<ReadyData>('/readyz')
    dbState.value = 'ok'
  } catch (error) {
    dbState.value = 'error'
    if (!errorMessage.value) {
      errorMessage.value = error instanceof Error ? error.message : '数据库暂不可用'
    }
  }

  try {
    const result = await getJson<MetaData>('/api/meta')
    meta.value = result.data ?? null
  } catch {
    meta.value = null
  }

  lastCheckedAt.value = new Date()
}

function stateClass(state: CheckState): string {
  return `state state--${state}`
}

function formatTime(value: Date | null): string {
  if (!value) return '—'
  return value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(() => {
  void check()
})
</script>

<template>
  <div class="page">
    <div class="page__dots" aria-hidden="true"></div>

    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand__mark" aria-hidden="true">
            <span>M</span>
            <i></i>
          </div>
          <div class="brand__text">
            <p class="brand__name">Monopay</p>
            <p class="brand__sub">桌游账房</p>
          </div>
        </div>

        <div class="stage-chip">
          <span class="stage-chip__dot"></span>
          M0 · 工程闭环
        </div>
      </header>

      <main class="hero">
        <section class="intro">
          <p class="eyebrow">BUILD 0 / SERVICE CHECK</p>
          <h1>账房开门前，<br />先把灯点亮。</h1>
          <p class="lede">
            这是 M0 的工程验收页：浏览器、API、SQLite 和镜像部署链路已经接通。
            下一步才会开始房间、付款和账本。
          </p>

          <div class="chips" aria-label="产品边界">
            <span>仅游戏币 M</span>
            <span>不接管棋盘</span>
            <span>2–6 人</span>
          </div>
        </section>

        <section class="status-card" aria-live="polite">
          <div class="status-card__head">
            <div>
              <p class="card-label">系统状态</p>
              <h2>{{ headline }}</h2>
            </div>
            <div :class="['status-orb', allReady ? 'status-orb--ok' : '']" aria-hidden="true">
              <ShieldCheck v-if="allReady" :size="22" :stroke-width="1.8" />
              <RefreshCw v-else :size="22" :stroke-width="1.8" />
            </div>
          </div>

          <div class="status-list">
            <div class="status-row">
              <div class="status-row__icon"><Server :size="19" :stroke-width="1.8" /></div>
              <div class="status-row__text">
                <p>API 服务</p>
                <span>Fastify · /healthz</span>
              </div>
              <strong :class="stateClass(apiState)">{{ apiLabel }}</strong>
            </div>

            <div class="status-row">
              <div class="status-row__icon"><Database :size="19" :stroke-width="1.8" /></div>
              <div class="status-row__text">
                <p>账本数据库</p>
                <span>SQLite · Drizzle</span>
              </div>
              <strong :class="stateClass(dbState)">{{ dbLabel }}</strong>
            </div>
          </div>

          <div v-if="meta" class="status-meta">
            <span>版本 {{ meta.version }}</span>
            <span>初始化 {{ new Date(meta.initializedAt).toLocaleDateString('zh-CN') }}</span>
            <span>检查于 {{ formatTime(lastCheckedAt) }}</span>
          </div>

          <p v-if="errorMessage" class="status-error">{{ errorMessage }}</p>

          <button class="primary-button" type="button" :disabled="checking" @click="check">
            <RefreshCw :size="17" :stroke-width="2" :class="{ spinning: checking }" />
            {{ checking ? '正在检查' : '重新检查' }}
          </button>

          <p class="disclaimer">本局仅使用游戏币 M，不可充值、提现或兑换现金。</p>
        </section>
      </main>

      <footer class="footer">
        <span>Monopay / 桌游银行</span>
        <span>M0 · workspace · Fastify · SQLite · Docker</span>
      </footer>
    </div>
  </div>
</template>
