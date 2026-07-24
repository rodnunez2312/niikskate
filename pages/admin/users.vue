<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
await navigateTo({ path: '/member/admin/academy/users', query: route.query }, { replace: true })
</script>
