<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
await navigateTo('/member/student/classes', { replace: true })
</script>
