<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
await navigateTo('/member/coach/home', { replace: true })
</script>
