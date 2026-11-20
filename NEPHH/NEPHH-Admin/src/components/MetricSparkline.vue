<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

// Decorative motion for summary cards; this does not generate business statistics.
const props = defineProps<{ variant: 'teal' | 'red' | 'amber' | 'blue' }>()
const reducedMotion = ref(false)
let preference: MediaQueryList | undefined
const updatePreference = () => { reducedMotion.value = preference?.matches ?? false }
onMounted(() => {
  preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  updatePreference()
  preference.addEventListener('change', updatePreference)
})
onUnmounted(() => preference?.removeEventListener('change', updatePreference))
const base = {
  teal: [18, 20, 22, 21, 23, 22, 24],
  red: [6, 13, 5, 16, 10, 20, 14],
  amber: [14, 9, 15, 7, 12, 6, 10],
  blue: [4, 7, 10, 15, 16, 20, 24]
}
const frames = computed(() => Array.from({ length: 9 }, (_, frame) => {
  const values = base[props.variant]
  return values.map((value, index) => {
    const phase = frame / 8 * Math.PI * 2 + index * .85
    const center = 16 + (value - 16) * .35
    const y = Math.max(2, Math.min(30, center + Math.sin(phase) * 11))
    return `${index === 0 ? 'M' : 'L'}${2 + index * 106 / 6} ${y.toFixed(2)}`
  }).join(' ')
}))
const areas = computed(() => frames.value.map(path => `${path} V32 H2 Z`))
</script>

<template>
  <svg class="d-spark" :class="variant" viewBox="0 0 110 32" aria-hidden="true">
    <path :d="frames[0]">
      <animate v-if="!reducedMotion" attributeName="d" :values="frames.join(';')" dur="6s" repeatCount="indefinite" />
    </path>
    <path class="area" :d="areas[0]">
      <animate v-if="!reducedMotion" attributeName="d" :values="areas.join(';')" dur="6s" repeatCount="indefinite" />
    </path>
  </svg>
</template>
