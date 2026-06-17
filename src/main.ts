import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'
import { i18n } from './i18n'

import 'virtual:uno.css'
import '@unocss/reset/tailwind-compat.css'
import './assets/styles/main.css'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPersist)

app.use(pinia)
app.use(i18n)
app.use(router)
app.mount('#app')

// Tear down the index.html boot screen now that Vue is mounted and
// UnoCSS / main.css have been injected. requestAnimationFrame ensures
// the first real frame has been laid out before we start fading out,
// so the user never sees a styleless flash mid-transition.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot-screen')
  if (!boot) return
  boot.setAttribute('data-leaving', '1')
  // Match the CSS transition duration in index.html (220ms).
  setTimeout(() => boot.remove(), 240)
})
