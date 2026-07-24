<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/student/progress', { replace: true })
</script>
