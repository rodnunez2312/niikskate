<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

await navigateTo('/member/student/progress', { replace: true })
</script>

<template>
  <div />
</template>
