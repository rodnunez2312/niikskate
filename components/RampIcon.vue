<script setup lang="ts">
defineProps<{
  type: 'fundamentals' | 'flatground' | 'street' | 'bowl' | 'vert' | 'surf_skate' | 'safety' | 'all'
  size?: number
}>()

// The ramps-sprite.png is a 3x3 grid
// Row 0: PUNK kicker | SKATE quarter | RIOT box
// Row 1: CHAOS stairs+rail | PUNK skull funbox | THRASH quarter  
// Row 2: DESTROY halfpipe | skull quarter | ANARCHY quarter
const positions: Record<string, { row: number; col: number }> = {
  fundamentals: { row: 0, col: 1 },    // "SKATE" quarter - perfect for learning basics
  flatground: { row: 0, col: 0 },      // "PUNK" kicker - small ramp for flatground tricks
  street: { row: 1, col: 0 },          // "CHAOS" stairs+rail - street obstacles
  bowl: { row: 2, col: 1 },            // Skull quarter - bowl-style
  vert: { row: 2, col: 0 },            // "DESTROY" halfpipe - vert ramp
  surf_skate: { row: 1, col: 2 },      // "THRASH" quarter - carving/pumping
  safety: { row: 0, col: 2 },          // "RIOT" box - controlled environment
  all: { row: 1, col: 1 },             // Punk skull funbox - center piece for all
}
</script>

<template>
  <div 
    class="rounded-full overflow-hidden bg-[#e8dcc8] flex-shrink-0"
    :style="{
      width: `${size || 56}px`,
      height: `${size || 56}px`,
    }"
  >
    <div
      class="w-full h-full"
      :style="{
        backgroundImage: `url(/ramps-sprite.png)`,
        backgroundSize: '300% 300%',
        backgroundPosition: `${(positions[type]?.col || 1) * 50}% ${(positions[type]?.row || 1) * 50}%`,
      }"
    />
  </div>
</template>
