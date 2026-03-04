<script setup lang="ts">
// Initialize Capacitor plugins
const initCapacitor = async () => {
  if (import.meta.client) {
    try {
      const { StatusBar } = await import('@capacitor/status-bar')
      const { Keyboard } = await import('@capacitor/keyboard')
      
      // Configure status bar for mobile
      await StatusBar.setBackgroundColor({ color: '#3B82F6' })
      
      // Handle keyboard events
      Keyboard.addListener('keyboardWillShow', () => {
        document.body.classList.add('keyboard-open')
      })
      
      Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-open')
      })
    } catch (error) {
      // Not running in Capacitor (web browser)
      console.log('Running in web mode')
    }
  }
}

onMounted(() => {
  initCapacitor()
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
