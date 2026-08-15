<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

await navigateTo('/member/admin/academy/dashboard', { replace: true })
</script>
