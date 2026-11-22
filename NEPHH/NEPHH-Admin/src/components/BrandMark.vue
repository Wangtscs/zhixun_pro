<script setup lang="ts">
defineProps<{ boxed?: boolean }>()
</script>
<template>
  <span class="brand-mark" :class="{ boxed }">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M5 27V15.5a11 11 0 0 1 22 0V27" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M4 27h24" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M10.5 27v-10a5.5 5.5 0 0 1 11 0v10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
      <path d="M14 23h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
    </svg>
  </span>
</template>