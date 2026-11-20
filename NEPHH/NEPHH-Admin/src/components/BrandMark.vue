<script setup lang="ts">
defineProps<{ boxed?: boolean }>()
</script>
<template><span class="brand-mark" :class="{boxed}"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect :x="boxed?5:3" :y="boxed?5:3" :width="boxed?22:26" :height="boxed?22:26" :rx="boxed?7:8" transform="rotate(45 16 16)" stroke="currentColor" stroke-width="1.5"/><circle cx="11" cy="11" r="3" fill="currentColor"/><circle cx="21" cy="21" r="3" fill="currentColor"/></svg></span></template>
