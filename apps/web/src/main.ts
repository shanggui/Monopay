import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { unlockAudio } from './lib/feedback'
import { initTheme } from './lib/theme'
import router from './router'
import './style.css'

initTheme()
window.addEventListener('pointerdown', unlockAudio, { once: true })

createApp(App).use(createPinia()).use(router).mount('#app')
