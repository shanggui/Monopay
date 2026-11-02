<script setup lang="ts">
import { ArrowRight, LogIn, Plus, ShieldCheck } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()
const serviceReady = ref<boolean | null>(null)

const hasLastRoom = computed(() => Boolean(session.lastRoomCode))

function continueRoom(): void {
  if (!session.lastRoomCode) return
  void router.push(`/room/${session.lastRoomCode}`)
}

onMounted(async () => {
  try {
    const response = await fetch('/healthz', { cache: 'no-store' })
    serviceReady.value = response.ok
  } catch {
    serviceReady.value = false
  }
})
</script>

<template>
  <div class="page page--app">
    <div class="page__dots" aria-hidden="true"></div>

    <div class="shell">
      <AppHeader label="桌游账房">
        <template #right>
          <span class="stage-chip">
            <span class="stage-chip__dot"></span>
            M1 · 房间
          </span>
        </template>
      </AppHeader>

      <main class="home">
        <section class="home__intro">
          <p class="eyebrow">MONOPAY / TABLE BANK</p>
          <h1>先开一桌，<br /><em>钱交给账房。</em></h1>
          <p class="lede">
            实体棋盘照常玩。开房、发钱、付款、对账，用浏览器完成。只记录本局游戏币，不接管棋盘。
          </p>

          <div class="home__actions">
            <RouterLink class="action-card action-card--primary" to="/create">
              <span class="action-card__icon"><Plus :size="21" :stroke-width="2" /></span>
              <span class="action-card__text">
                <strong>开一桌</strong>
                <small>设置初始资金和银行身份</small>
              </span>
              <ArrowRight class="action-card__arrow" :size="19" :stroke-width="1.8" />
            </RouterLink>

            <RouterLink class="action-card" to="/join">
              <span class="action-card__icon"><LogIn :size="21" :stroke-width="1.8" /></span>
              <span class="action-card__text">
                <strong>加入房间</strong>
                <small>输入房号，或扫房主二维码</small>
              </span>
              <ArrowRight class="action-card__arrow" :size="19" :stroke-width="1.8" />
            </RouterLink>
          </div>

          <button v-if="hasLastRoom" class="resume-link" type="button" @click="continueRoom">
            继续上次房间 <span>{{ session.lastRoomCode }}</span>
            <ArrowRight :size="15" :stroke-width="1.8" />
          </button>
        </section>

        <aside class="home__note">
          <div class="note-card">
            <p class="card-label">这桌的规矩</p>
            <ul>
              <li><span>01</span>2–6 人，房主负责银行</li>
              <li><span>02</span>初始资金默认 2,000 M</li>
              <li><span>03</span>余额不足不能转出，可转入</li>
              <li><span>04</span>流水是最终依据</li>
            </ul>
            <div class="note-card__foot">
              <ShieldCheck :size="17" :stroke-width="1.8" />
              仅游戏币，不充值、不兑换
            </div>
          </div>

          <div class="bank-seal" aria-hidden="true">
            <span class="bank-seal__m">M</span>
            <span class="bank-seal__text">桌游银行<br />TABLE BANK</span>
          </div>
        </aside>
      </main>

      <footer class="app-footer">
        <span>Monopay / 桌游账房</span>
        <span class="service-state">
          <i
            :class="
              serviceReady === false
                ? 'service-state__dot service-state__dot--bad'
                : 'service-state__dot'
            "
          ></i>
          {{ serviceReady === null ? '检查服务…' : serviceReady ? '服务正常' : '服务未连接' }}
        </span>
      </footer>
    </div>
  </div>
</template>
