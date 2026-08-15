<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
await navigateTo('/member/staff/dashboard', { replace: true })
</script>

<template>
  <div />
</template>
