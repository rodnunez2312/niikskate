<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/admin/scheduling/coaches', { replace: true })
</script>
