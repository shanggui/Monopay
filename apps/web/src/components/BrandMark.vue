<template>
  <div :class="['brand-mark', compact ? 'brand-mark--compact' : '']" aria-hidden="true">
    <span>M</span>
    <i></i>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: false },
)
</script>
