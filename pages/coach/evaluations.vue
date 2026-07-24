<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
await navigateTo({ path: '/member/coach/evaluations', query: route.query }, { replace: true })
</script>
