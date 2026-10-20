<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
await navigateTo('/member/coach/library', { replace: true })
</script>
