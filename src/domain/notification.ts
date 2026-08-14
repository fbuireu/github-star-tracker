import { NOTIFICATION_THRESHOLD_MAX_PACE, NOTIFICATION_THRESHOLDS } from './constants';
import { NotificationMode } from './types';

function getAdaptiveThreshold(totalStars: number): number {
  return (
    NOTIFICATION_THRESHOLDS.find((threshold) => totalStars <= threshold.limit)?.value ??
    NOTIFICATION_THRESHOLD_MAX_PACE
  );
}

interface ShouldNotifyParams {
  totalStars: number;
  starsAtLastNotification: number | undefined;
  threshold: number | 'auto';
  mode?: NotificationMode;
}

export function shouldNotify({
  totalStars,
  starsAtLastNotification,
  threshold,
  mode = NotificationMode.NET,
}: ShouldNotifyParams): boolean {
  if (threshold === 0) return true;

  const effectiveThreshold = threshold === 'auto' ? getAdaptiveThreshold(totalStars) : threshold;
  const delta = totalStars - (starsAtLastNotification ?? 0);
  const accumulatedDelta = mode === NotificationMode.GAINS ? delta : Math.abs(delta);

  return accumulatedDelta >= effectiveThreshold;
}
