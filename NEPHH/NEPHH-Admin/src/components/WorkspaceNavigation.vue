<script setup lang="ts">
import { computed } from 'vue'
import BrandMark from './BrandMark.vue'
import Icon from './Icon.vue'

export interface NavigationItem { key: string; name: string; icon: string; group?: string }
const props = defineProps<{ items: NavigationItem[]; active: string; collapsed: boolean }>()
defineEmits<{ navigate: [key: string]; toggle: []; settings: [] }>()
const groups = computed(() => [...new Set(props.items.map(item => item.group || '运行作业'))]
  .map(name => ({ name, items: props.items.filter(item => (item.group || '运行作业') === name) })))
</script>

<template>
  <aside class="work-sidebar operations-navigation" aria-label="工作台侧栏">
    <button class="d-brand" aria-label="返回总览" @click="$emit('navigate', 'overview')">
      <BrandMark /><span class="nav-label">智巡管廊</span>
    </button>
    <button class="nav-collapse" :aria-label="collapsed ? '展开导航' : '收起导航'" :aria-expanded="!collapsed" @click="$emit('toggle')">
      <Icon name="menu" /><span class="nav-label">收起导航</span>
    </button>
    <nav aria-label="业务导航">
      <section v-for="group in groups" :key="group.name" class="nav-group">
        <h2 class="nav-group-title">{{ group.name }}</h2>
        <button v-for="item in group.items" :key="item.key" :class="{ active: active === item.key }"
          :aria-label="item.name" :aria-current="active === item.key ? 'page' : undefined" :title="item.name"
          @click="$emit('navigate', item.key)">
          <Icon :name="item.icon" /><span class="nav-label">{{ item.name }}</span>
        </button>
      </section>
    </nav>
    <button class="d-profile-nav" aria-label="个人设置" :aria-current="active === 'settings' ? 'page' : undefined" @click="$emit('settings')">
      <Icon name="user" /><span class="nav-label">个人设置</span>
    </button>
  </aside>
</template>

<style>
.design-app { --navigation-width: 208px; }
.design-app.nav-collapsed { --navigation-width: 72px; }
.design-app .work-sidebar.operations-navigation { width: var(--navigation-width); align-items: stretch; padding: 0 12px; }
.design-app .operations-navigation .d-brand { width: 100%; gap: 12px; display: flex; align-items: center; justify-content: flex-start; }
.design-app .operations-navigation .d-brand > svg { flex: 0 0 30px; width: 30px; height: 30px; }
.design-app .operations-navigation .nav-label { white-space: nowrap; font-size: 14px; }
.design-app .operations-navigation .d-brand .nav-label { font-weight: 650; letter-spacing: 1px; }
.design-app .operations-navigation .nav-collapse { width: 100%; display: flex; gap: 12px; padding: 10px 12px; align-items: center; margin: 8px 0; background: transparent; border: 1px solid var(--ops-line, #35414c); }
.design-app .operations-navigation nav { display: block; width: 100%; margin: 0; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; }
.design-app .nav-group { margin-bottom: 12px; }
.design-app .nav-group-title { font-size: 12px; color: var(--ops-muted, #a7b9c6); padding: 8px 12px; font-weight: 500; }
.design-app .operations-navigation .nav-group > button,
.design-app .operations-navigation .d-profile-nav { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 42px; padding: 10px 12px; margin: 2px 0; background: transparent; color: var(--ops-muted, #a7b9c6); border: 1px solid transparent; border-radius: 6px; }
.design-app .operations-navigation .nav-group > button.active { color: var(--ops-accent, #58e1d3); background: var(--ops-accent-bg, #163e40); border-color: var(--ops-line, #35414c); }
.design-app .operations-navigation button[aria-current="page"] { font-weight: 650; }
.design-app .operations-navigation .d-profile-nav { margin: 8px 0 16px; border-color: var(--ops-line, #35414c); }
.work-app.design-app .work-sidebar.operations-navigation :is(.d-brand, .d-profile-nav) { width: 100%; justify-content: flex-start; }
.work-app.design-app .work-sidebar.operations-navigation .d-profile-nav { height: auto; min-height: 42px; padding: 10px 12px; }
.design-app .operations-navigation button:focus-visible { outline: 3px solid var(--ops-accent, #58e1d3); outline-offset: -3px; }
.design-app .operations-navigation svg { flex-shrink: 0; }
.design-app.nav-collapsed .operations-navigation .nav-label,
.design-app.nav-collapsed .operations-navigation .nav-group-title { display: none; }
.work-app.design-app .d-topbar { left: var(--navigation-width); }
.work-app.design-app .work-main { width: calc(100% - var(--navigation-width)); margin-left: var(--navigation-width); }
.work-app.design-app .d-drawer-overlay { left: var(--navigation-width); }
.design-app .operations-area { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.design-app .operations-area select { max-width: 180px; min-height: 36px; }
@media (max-width: 900px) {
  .design-app { --navigation-width: 72px; }
  .design-app:not(.nav-collapsed) .work-sidebar.operations-navigation { width: 208px; box-shadow: 12px 0 24px #0005; }
  .design-app .d-header-actions { gap: 8px; }
  .design-app .d-take-mode { display: none; }
  .design-app .d-global-search { width: 150px; }
  .design-app .d-global-search input { width: 90px; }
}
@media (max-width: 600px) {
  .design-app .d-topbar { padding: 0 12px; gap: 8px; }
  .design-app .d-breadcrumb, .design-app .d-global-search, .design-app .d-connection { display: none; }
  .design-app .d-header-actions { width: 100%; justify-content: space-between; }
  .work-app.design-app .work-main { padding: 16px 12px; }
  .design-app .d-drawer { max-width: 100%; width: 100%; }
  .design-app .operations-area { max-width: 180px; }
  .design-app .operations-area > span { display: none; }
}
</style>
