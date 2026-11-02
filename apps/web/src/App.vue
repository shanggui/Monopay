<script setup lang="ts">
import OfflineBanner from './components/OfflineBanner.vue'
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>
  <OfflineBanner />
</template>
