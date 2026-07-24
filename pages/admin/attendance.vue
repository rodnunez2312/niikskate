<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/admin/scheduling/attendance', { replace: true })
</script>
