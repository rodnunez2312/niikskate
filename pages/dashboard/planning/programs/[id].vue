<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
await navigateTo(`/member/coach/plans/programs/${route.params.id}`, { replace: true })
</script>
