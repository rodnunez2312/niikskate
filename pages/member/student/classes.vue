<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
</script>

<template>
  <ClassesClassSessionsExplorer />
</template>
