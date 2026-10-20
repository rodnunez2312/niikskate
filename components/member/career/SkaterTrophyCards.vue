<script setup lang="ts">
import { XP_RULES, type SkaterCareer } from '~/utils/skaterCareer'

type Module = 'tricks' | 'drills' | 'challenges'

const props = defineProps<{
  career: SkaterCareer
  challengesCompleted: number
  challengesTotal: number
  active: Module
  es: boolean
  canAddChallenge?: boolean
}>()

defineEmits<{ select: [module: Module]; addChallenge: [] }>()

const pendingChallenges = computed(() => Math.max(0, props.challengesTotal - props.challengesCompleted))
const earnedRarities = computed(() => props.career.rarityCounts.filter(r => r.count > 0))

const cardClass = (m: Module) =>
  props.active === m
    ? 'border-[#C9EF42]/70 ring-1 ring-[#C9EF42]/40'
    : 'border-gray-800 hover:border-gray-600'
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <button
      type="button"
      class="min-w-0 rounded-xl border bg-gray-900 p-3 text-left transition-colors"
      :class="cardClass('tricks')"
      @click="$emit('select', 'tricks')"
    >
      <p class="text-[11px] font-semibold text-gray-400">🏆 {{ es ? 'Trucos dominados' : 'Tricks mastered' }}</p>
      <div class="mt-1 flex items-end justify-between gap-2">
        <p class="text-3xl font-black text-white leading-none tabular-nums">{{ career.tricksCompleted }}</p>
        <div v-if="earnedRarities.length" class="flex flex-wrap justify-end gap-1">
          <span
            v-for="r in earnedRarities"
            :key="r.rarity.id"
            class="rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums"
            :style="{ color: r.rarity.color, backgroundColor: `${r.rarity.color}1f` }"
            :title="es ? r.rarity.labelEs : r.rarity.labelEn"
          >
            ◆ {{ r.count }}
          </span>
        </div>
      </div>
      <p v-if="career.nextGoal" class="mt-2 text-[11px] text-gray-500 truncate">
        🎯 {{ es ? 'Próximo objetivo' : 'Next goal' }}:
        <span class="font-semibold text-white">{{ career.nextGoal.name }}</span>
      </p>
    </button>

    <button
      type="button"
      class="min-w-0 rounded-xl border bg-gray-900 p-3 text-left transition-colors"
      :class="cardClass('drills')"
      @click="$emit('select', 'drills')"
    >
      <p class="text-[11px] font-semibold text-gray-400">🔥 {{ es ? 'Drills completados' : 'Drills completed' }}</p>
      <p class="mt-1 text-3xl font-black text-white leading-none tabular-nums">{{ career.drillsCompleted }}</p>
      <p class="mt-2 text-[11px] font-bold text-[#C9EF42]">
        +{{ career.drillsCompleted * XP_RULES.drill }} XP {{ es ? 'obtenidos' : 'earned' }}
      </p>
    </button>

    <button
      type="button"
      class="min-w-0 rounded-xl border bg-gray-900 p-3 text-left transition-colors"
      :class="cardClass('challenges')"
      @click="$emit('select', 'challenges')"
    >
      <div class="flex items-start justify-between gap-1">
        <p class="text-[11px] font-semibold text-gray-400">⚡ {{ es ? 'Desafíos' : 'Challenges' }}</p>
        <span
          v-if="canAddChallenge"
          class="shrink-0 rounded-lg bg-[#C9EF42] px-2 py-0.5 text-[10px] font-bold text-charcoal hover:brightness-110"
          @click.stop="$emit('addChallenge')"
        >
          {{ es ? '+ Desafío' : '+ Challenge' }}
        </span>
      </div>
      <p class="mt-1 text-3xl font-black text-white leading-none tabular-nums">{{ challengesCompleted }}</p>
      <p v-if="pendingChallenges" class="mt-2 text-[11px] font-bold text-[#C9EF42]">
        {{ es ? 'Nuevo desafío disponible' : 'New challenge available' }}
      </p>
      <p v-else-if="challengesTotal" class="mt-2 text-[11px] text-gray-500">
        {{ es ? '¡Todos completados!' : 'All completed!' }}
      </p>
      <p v-else class="mt-2 text-[11px] text-gray-500">
        {{ es ? 'Sin desafíos aún' : 'No challenges yet' }}
      </p>
    </button>
  </div>
</template>
