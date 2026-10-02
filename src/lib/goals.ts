export type GoalKey = 'weight_loss' | 'weight_gain' | 'muscle_gain' | 'corrective' | 'fitness' | 'other';

export const GOAL_KEYS: GoalKey[] = ['weight_loss', 'weight_gain', 'muscle_gain', 'corrective', 'fitness', 'other'];

export const GOAL_LABELS: Record<GoalKey, string> = {
  weight_loss: 'کاهش وزن',
  weight_gain: 'افزایش وزن',
  muscle_gain: 'عضله‌سازی',
  corrective: 'اصلاحی',
  fitness: 'تناسب اندام',
  other: 'سایر',
};

export const GOAL_TIPS: Record<GoalKey, string> = {
  weight_loss: 'برای نتیجه بهتر در مسیر کاهش وزن، جلسات کاردیو را با تغذیه مناسب ترکیب کن.',
  weight_gain: 'برای افزایش وزن اصولی، مصرف پروتئین و کربوهیدرات سالم را در برنامه‌ات بگنجان.',
  muscle_gain: 'برای عضله‌سازی مؤثرتر، تمرینات قدرتی را منظم انجام بده و استراحت کافی داشته باش.',
  corrective: 'برای اصلاح وضعیت بدن، تمرینات اصلاحی تجویز شده را هر روز و با دقت دنبال کن.',
  fitness: 'برای تناسب اندام، برنامه تمرینی‌ات را منظم دنبال کن و بدن‌ات را هیدراته نگه دار.',
  other: 'تمرینات تجویز شده را منظم پیگیری کن تا سریع‌تر به هدف‌ات برسی.',
};

export function goalLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return (GOAL_LABELS as Record<string, string>)[key] || key;
}
