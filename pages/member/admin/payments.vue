<script setup lang="ts">
// Pagos became the Finanzas section (income, expenses, prices, break-even).
definePageMeta({ middleware: ['auth', 'member'] })
await navigateTo('/member/admin/finance', { replace: true })
</script>
