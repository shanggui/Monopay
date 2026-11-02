<script setup lang="ts">
import { ArrowRight, LoaderCircle, QrCode, UserRound } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { joinRoom } from '../services/api'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const code = ref('')
const nickname = ref('')
const avatar = ref('🙂')
const loading = ref(false)
const error = ref('')
const hasExistingCredential = ref(false)

const avatars = ['🙂', '🌼', '🍀', '🐱', '🦊', '🎲']
const canSubmit = computed(
  () => /^\d{6}$/.test(code.value) && nickname.value.trim().length > 0 && !loading.value,
)

function syncCode(): void {
  const value = route.params.code
  const normalized = Array.isArray(value) ? value[0] : value
  if (normalized) {
    code.value = normalized
  }
  if (/^\d{6}$/.test(code.value)) {
    session.loadForRoom(code.value)
    hasExistingCredential.value = Boolean(session.token)
  }
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  error.value = ''
  loading.value = true

  try {
    session.loadForRoom(code.value)
    const existingToken = session.token ?? undefined
    const result = await joinRoom(
      code.value,
      { nickname: nickname.value.trim(), avatar: avatar.value },
      existingToken,
    )

    if (result.playerToken) {
      session.setPlayer(code.value, result.playerToken)
    } else {
      session.rememberRoom(code.value)
    }

    await router.push(`/room/${code.value}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加入房间失败'
  } finally {
    loading.value = false
  }
}

onMounted(syncCode)
watch(() => route.params.code, syncCode)
watch(code, (value) => {
  if (/^\d{6}$/.test(value)) {
    session.loadForRoom(value)
    hasExistingCredential.value = Boolean(session.token)
  } else {
    hasExistingCredential.value = false
  }
})
</script>

<template>
  <div class="page page--app">
    <div class="page__dots" aria-hidden="true"></div>

    <div class="shell">
      <AppHeader back label="加入房间" />

      <main class="form-page form-page--narrow">
        <div class="form-page__head">
          <p class="eyebrow">JOIN TABLE / PLAYER</p>
          <h1>找到这桌。</h1>
          <p class="lede">输入房主给你的 6 位房号，或者直接扫房主二维码。</p>
        </div>

        <form class="paper-card form-card" @submit.prevent="submit">
          <label class="form-field">
            <span>6 位房号</span>
            <div class="code-input">
              <QrCode :size="19" :stroke-width="1.8" />
              <input
                v-model="code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="例如 407035"
                @input="code = code.replace(/\D/g, '').slice(0, 6)"
              />
            </div>
          </label>

          <label class="form-field">
            <span>你的称呼</span>
            <div class="code-input">
              <UserRound :size="19" :stroke-width="1.8" />
              <input
                v-model="nickname"
                type="text"
                maxlength="20"
                autocomplete="nickname"
                placeholder="例如 小美"
              />
            </div>
          </label>

          <div class="form-field">
            <span>选一个头像</span>
            <div class="avatar-row">
              <button
                v-for="item in avatars"
                :key="item"
                class="avatar-choice"
                :class="{ 'avatar-choice--active': avatar === item }"
                type="button"
                @click="avatar = item"
              >
                {{ item }}
              </button>
            </div>
          </div>

          <p v-if="hasExistingCredential" class="form-hint">
            这台设备保存过这桌的凭证，加入时会按重连处理。
          </p>
          <p v-if="error" class="form-error">{{ error }}</p>

          <button class="primary-button" type="submit" :disabled="!canSubmit">
            <LoaderCircle v-if="loading" class="spinning" :size="18" :stroke-width="2" />
            <ArrowRight v-else :size="18" :stroke-width="1.9" />
            {{ loading ? '正在加入' : '加入房间' }}
          </button>

          <p class="form-footnote">本局仅使用游戏币 M，不可充值、提现或兑换现金。</p>
        </form>
      </main>
    </div>
  </div>
</template>
