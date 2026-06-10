export function formatPlayTime(seconds: number | undefined, empty = '0 min'): string {
  const totalSeconds = Math.max(0, Math.round(seconds ?? 0))
  if (totalSeconds <= 0) return empty
  if (totalSeconds < 60) return `${totalSeconds}s`

  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60))
  if (totalMinutes < 60) return `${totalMinutes} min`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`
}
