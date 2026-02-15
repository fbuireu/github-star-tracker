import { THRESHOLD_MAX_PACE, THRESHOLDS } from '@presentation/constants';

export function getAdaptiveThreshold(totalStars: number): number {
  return THRESHOLDS.find((t) => totalStars <= t.limit)?.value ?? THRESHOLD_MAX_PACE;
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
