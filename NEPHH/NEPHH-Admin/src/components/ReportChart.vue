<script setup lang="ts">
import { computed } from 'vue'
const props=defineProps<{values?:any[]}>()
const weeks=computed(()=>Array.from({length:12},(_,i)=>{const value=props.values?.[i];return typeof value==='number'?{label:'W'+(i+1),planned:value,completed:Math.max(0,value-13)}:{label:value?.label||'W'+(i+1),planned:value?.planned||0,completed:value?.completed||0}}))
</script>
<template><div class="d-report-chart"><svg viewBox="0 0 830 330" preserveAspectRatio="none" aria-label="近12周计划覆盖率和实际完成率"><g class="d-chart-grid"><path d="M0 16H830M0 91H830M0 166H830M0 241H830M0 302H830"/></g><g class="d-chart-axis"><text v-for="(n,i) in [100,75,50,25,0]" x="8" :y="i===4?302:20+i*75">{{n}}%</text></g><g v-for="(w,i) in weeks" :key="i"><rect :x="57+i*66" :y="302-w.planned*2.84" width="7" :height="w.planned*2.84" rx="2" fill="#2bdaca"/><rect :x="67+i*66" :y="302-w.completed*2.84" width="7" :height="w.completed*2.84" rx="2" fill="#6e9ffb"/><text :x="65+i*66" y="316" text-anchor="middle" fill="#657786" font-size="7">{{w.label}}</text></g></svg></div></template>
