<script setup lang="ts">
definePageMeta({ middleware: ['auth'], layout: 'member' })

const { isAdmin, isCoach, isStudent, loading } = useSiteProfile()

watch(
  [loading, isAdmin, isCoach, isStudent],
  () => {
    if (loading.value) return
    if (isAdmin.value) navigateTo('/member/admin/scheduling', { replace: true })
    else if (isCoach.value) navigateTo('/member/coach/home', { replace: true })
    else if (isStudent.value) navigateTo('/member/student/classes', { replace: true })
    else navigateTo('/auth/login?redirect=/member', { replace: true })
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex justify-center py-20">
    <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
  </div>
</template>
