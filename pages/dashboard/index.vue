<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/staff/dashboard', { replace: true })
</script>
