<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/coach/profile', { replace: true })
</script>
