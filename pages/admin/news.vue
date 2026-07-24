<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/admin/academy/news', { replace: true })
</script>
