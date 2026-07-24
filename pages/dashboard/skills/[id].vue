<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
await navigateTo(`/member/coach/library/${route.params.id}`, { replace: true })
</script>
