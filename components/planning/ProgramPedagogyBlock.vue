<script setup lang="ts">
defineProps<{
  language: 'en' | 'es'
  /** When true, slightly tighter spacing for mobile detail pages */
  compact?: boolean
}>()
</script>

<template>
  <div :class="compact ? 'space-y-4' : 'space-y-6'">
    <section class="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide mb-3">
        {{ language === 'es' ? 'Bloque de 90 minutos' : '90-minute session block' }}
      </h2>
      <p class="text-sm text-gray-400 mb-4">
        {{
          language === 'es'
            ? 'Cada sesión estructurada: calentamiento, juego, trabajo focal y cierre. Ajusta el ritmo al grupo.'
            : 'Each session follows a clear arc: warm-up, engagement, focused work, and closure. Adapt pacing to the group.'
        }}
      </p>
      <div class="grid grid-cols-4 gap-1.5 sm:gap-2 text-center text-[10px] sm:text-xs">
        <div class="rounded-lg bg-amber-500/15 border border-amber-500/30 py-2 sm:py-3 px-1">
          <p class="font-bold text-amber-300">15′</p>
          <p class="text-gray-300 mt-1 leading-tight">{{ language === 'es' ? 'Calentamiento' : 'Warm-up' }}</p>
        </div>
        <div class="rounded-lg bg-sky-500/15 border border-sky-500/30 py-2 sm:py-3 px-1">
          <p class="font-bold text-sky-300">15′</p>
          <p class="text-gray-300 mt-1 leading-tight">{{ language === 'es' ? 'Juegos / interacción' : 'Games / interaction' }}</p>
        </div>
        <div class="rounded-lg bg-gold-500/20 border border-gold-500/40 py-2 sm:py-3 px-1 col-span-1 sm:col-span-1">
          <p class="font-bold text-gold-300">45′</p>
          <p class="text-gray-300 mt-1 leading-tight">
            {{ language === 'es' ? 'Clase focal (drills por coach)' : 'Focused class (coach-assigned drills)' }}
          </p>
        </div>
        <div class="rounded-lg bg-violet-500/15 border border-violet-500/30 py-2 sm:py-3 px-1">
          <p class="font-bold text-violet-300">15′</p>
          <p class="text-gray-300 mt-1 leading-tight">{{ language === 'es' ? 'Cierre / vuelta a la calma' : 'Closure / cool-down' }}</p>
        </div>
      </div>
    </section>

    <section class="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide mb-2">
        {{ language === 'es' ? 'Enfoque pedagógico' : 'Teaching focus' }}
      </h2>
      <p class="text-sm text-gray-400 mb-4">
        {{
          language === 'es'
            ? 'En todos los niveles y programas: seguridad primero, control del cuerpo y la patineta, equilibrio, y fuerza funcional integrada al skate.'
            : 'Across all levels: safety first, board and body control, balance, and strength training integrated into skate-specific work.'
        }}
      </p>
      <ul class="grid sm:grid-cols-2 gap-3 text-sm text-gray-200">
        <li class="flex gap-2 items-start">
          <span class="text-lg">🛡️</span>
          <span>
            <strong class="text-white">{{ language === 'es' ? 'Seguridad' : 'Security & safety' }}</strong>
            — {{ language === 'es' ? 'protección, reglas de pista, caídas controladas.' : 'gear, park rules, controlled falls.' }}
          </span>
        </li>
        <li class="flex gap-2 items-start">
          <span class="text-lg">🎯</span>
          <span>
            <strong class="text-white">{{ language === 'es' ? 'Control' : 'Control' }}</strong>
            — {{ language === 'es' ? 'líneas, velocidad, lectura del terreno.' : 'lines, speed, reading the spot.' }}
          </span>
        </li>
        <li class="flex gap-2 items-start">
          <span class="text-lg">⚖️</span>
          <span>
            <strong class="text-white">{{ language === 'es' ? 'Equilibrio' : 'Balance' }}</strong>
            — {{ language === 'es' ? 'peso, apoyos, transiciones carvey / switch.' : 'stance, weight, carve & switch.' }}
          </span>
        </li>
        <li class="flex gap-2 items-start">
          <span class="text-lg">💪</span>
          <span>
            <strong class="text-white">{{ language === 'es' ? 'Fuerza' : 'Strength' }}</strong>
            — {{ language === 'es' ? 'estabilidad, potencia, prevención de lesiones.' : 'stability, power, prehab for ankles & knees.' }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
