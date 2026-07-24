<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/admin/scheduling/credits', { replace: true })
</script>
