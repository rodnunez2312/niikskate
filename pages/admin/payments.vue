<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/admin/finance', { replace: true })
</script>
