<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
await navigateTo('/member/admin/academy/dashboard', { replace: true })
</script>

<template>
  <div class="flex justify-center py-20">
    <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
  </div>
</template>
