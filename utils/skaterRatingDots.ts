/**
 * Tony Hawk–style stat bubbles: slot color reflects skill tier (red → green).
 * @param slotIndex 0-based bubble position (0 = first / weakest tier)
 * @param filledCount how many bubbles are filled for this stat (0–10)
 */
export function skaterRatingBubbleClass(slotIndex: number, filledCount: number): string {
  if (slotIndex < 0 || slotIndex > 9) return 'bg-gray-800'
  if (slotIndex >= filledCount) {
    return 'bg-gray-800 ring-1 ring-inset ring-gray-700/70'
  }
  if (slotIndex <= 2) {
    return 'bg-red-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(239,68,68,0.5)]'
  }
  if (slotIndex <= 4) {
    return 'bg-orange-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(249,115,22,0.5)]'
  }
  if (slotIndex <= 7) {
    return 'bg-yellow-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(250,204,21,0.45)]'
  }
  return 'bg-green-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(34,197,94,0.5)]'
}
