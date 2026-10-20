<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/member/coach/library', { replace: true })
</script>
