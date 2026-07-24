<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/coach/knowledge-base', { replace: true })
</script>
