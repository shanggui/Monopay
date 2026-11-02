<script setup lang="ts">
import type { CreateRoomRequest, HostIdentity } from '@monopay/shared'
import { Landmark, LoaderCircle, Sparkles, Users } from '@lucide/vue'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { createRoom } from '../services/api'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()
const loading = ref(false)
const error = ref('')

const form = reactive<CreateRoomRequest>({
  hostIdentity: 'dual',
  hostNickname: '房主',
  initialFunds: 2000,
  maxPlayers: 6,
  salary: 200,
  largeConfirmAmount: 1000,
  soundEnabled: true,
})

const identityOptions: Array<{
  value: HostIdentity
  title: string
  description: string
}> = [
  {
    value: 'dual',
    title: '双身份房主',
    description: '自己也玩，占 1 个玩家名额，参与排名。',
  },
  {
    value: 'bank_only',
    title: '银行-only',
    description: '只当银行，不占名额、不参与排名。',
  },
]

async function submit(): Promise<void> {
  error.value = ''
  loading.value = true

  try {
    const result = await createRoom({
      ...form,
      initialFunds: Number(form.initialFunds),
      maxPlayers: Number(form.maxPlayers),
      salary: Number(form.salary),
      largeConfirmAmount: Number(form.largeConfirmAmount),
    })
    session.setHost(result.roomCode, result.hostToken, result.url)
    await router.push(`/room/${result.roomCode}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '创建房间失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page page--app">
    <div class="page__dots" aria-hidden="true"></div>

    <div class="shell">
      <AppHeader back label="创建房间" />

      <main class="form-page">
        <div class="form-page__head">
          <p class="eyebrow">NEW TABLE / BANK RULES</p>
          <h1>这桌的银行规则</h1>
          <p class="lede">开局后房主身份不能更改。初始资金只发一次。</p>
        </div>

        <form class="paper-card form-card" @submit.prevent="submit">
          <fieldset class="form-field">
            <legend>房主身份</legend>
            <div class="identity-grid">
              <button
                v-for="option in identityOptions"
                :key="option.value"
                class="identity-option"
                :class="{ 'identity-option--active': form.hostIdentity === option.value }"
                type="button"
                @click="form.hostIdentity = option.value"
              >
                <span class="identity-option__icon">
                  <Users v-if="option.value === 'dual'" :size="19" :stroke-width="1.8" />
                  <Landmark v-else :size="19" :stroke-width="1.8" />
                </span>
                <strong>{{ option.title }}</strong>
                <small>{{ option.description }}</small>
              </button>
            </div>
          </fieldset>

          <label class="form-field">
            <span>你的称呼</span>
            <input v-model="form.hostNickname" maxlength="20" autocomplete="nickname" />
          </label>

          <label class="form-field">
            <span>初始资金</span>
            <div class="money-input">
              <input
                v-model.number="form.initialFunds"
                type="number"
                min="1"
                max="1000000000"
                inputmode="numeric"
              />
              <b>M</b>
            </div>
            <div class="quick-row">
              <button type="button" @click="form.initialFunds = 1000">1,000</button>
              <button type="button" @click="form.initialFunds = 2000">2,000</button>
              <button type="button" @click="form.initialFunds = 3000">3,000</button>
            </div>
          </label>

          <div class="form-row">
            <label class="form-field">
              <span>最大玩家数</span>
              <div class="stepper">
                <button
                  type="button"
                  :disabled="form.maxPlayers <= 2"
                  @click="form.maxPlayers -= 1"
                >
                  −
                </button>
                <strong>{{ form.maxPlayers }}</strong>
                <button
                  type="button"
                  :disabled="form.maxPlayers >= 6"
                  @click="form.maxPlayers += 1"
                >
                  ＋
                </button>
              </div>
              <small>2–6 人；银行-only 不占名额</small>
            </label>

            <label class="form-field">
              <span>过起点工资</span>
              <div class="money-input">
                <input
                  v-model.number="form.salary"
                  type="number"
                  min="1"
                  max="1000000000"
                  inputmode="numeric"
                />
                <b>M</b>
              </div>
              <small>每次发放时仍可改</small>
            </label>
          </div>

          <div class="form-row">
            <label class="form-field">
              <span>大额二次确认</span>
              <div class="money-input">
                <input
                  v-model.number="form.largeConfirmAmount"
                  type="number"
                  min="0"
                  max="1000000000"
                  inputmode="numeric"
                />
                <b>M</b>
              </div>
              <small>仅防误触；工资、退款豁免</small>
            </label>

            <div class="form-field">
              <span>交易音效</span>
              <button
                class="switch-row"
                type="button"
                :aria-pressed="form.soundEnabled"
                @click="form.soundEnabled = !form.soundEnabled"
              >
                <span
                  :class="{ 'switch-row__track--on': form.soundEnabled }"
                  class="switch-row__track"
                >
                  <i></i>
                </span>
                <span>{{ form.soundEnabled ? '开启' : '关闭' }}</span>
              </button>
              <small>仅收款人设备播放</small>
            </div>
          </div>

          <p v-if="error" class="form-error">{{ error }}</p>

          <button class="primary-button" type="submit" :disabled="loading">
            <LoaderCircle v-if="loading" class="spinning" :size="18" :stroke-width="2" />
            <Sparkles v-else :size="18" :stroke-width="1.8" />
            {{ loading ? '正在开桌' : '创建房间' }}
          </button>

          <p class="form-footnote">
            创建后会生成 6 位房号和二维码。银行由房主操作，其他玩家只能付款。
          </p>
        </form>
      </main>
    </div>
  </div>
</template>
