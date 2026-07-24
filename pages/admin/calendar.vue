<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/admin/scheduling/calendar', { replace: true })
</script>
