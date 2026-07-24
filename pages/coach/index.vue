<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/coach/plans', { replace: true })
</script>
