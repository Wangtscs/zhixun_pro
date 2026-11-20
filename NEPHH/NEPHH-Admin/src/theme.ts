import { ref } from 'vue'

export type Theme = 'dark' | 'light'
const key = 'nephh-theme'
function savedTheme(): Theme {
  try { return localStorage.getItem(key) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}
export const theme = ref<Theme>(savedTheme())
function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
}
export function setTheme(value: Theme) {
  theme.value = value
  applyTheme(value)
  try { localStorage.setItem(key, value) } catch { /* Still apply for this session. */ }
}
applyTheme(theme.value)
