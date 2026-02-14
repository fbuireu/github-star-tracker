export function getAdaptiveThreshold(totalStars: number): number {
  if (totalStars <= 50) return 1;
  if (totalStars <= 200) return 5;
  if (totalStars <= 500) return 10;
  return 20;
}

interface ShouldNotifyParams {
  totalStars: number;
  starsAtLastNotification: number | undefined;
  threshold: number | 'auto';
}

export function shouldNotify({
  totalStars,
  starsAtLastNotification,
  threshold,
}: ShouldNotifyParams): boolean {
  if (threshold === 0) return true;

  const effectiveThreshold = threshold === 'auto' ? getAdaptiveThreshold(totalStars) : threshold;
  const accumulatedDelta = Math.abs(totalStars - (starsAtLastNotification ?? 0));

  return accumulatedDelta >= effectiveThreshold;
}
