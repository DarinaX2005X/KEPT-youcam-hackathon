import { useId } from 'react';

/**
 * The Kept mark taken apart: the day 0 outline, and today's oval still dashed because no photo
 * has been taken. Where they will overlap, the lens is already there.
 */
export function EmptyMark({ size = 120 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={(size * 140) / 120} viewBox="0 0 120 140" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-sheen`} x1="20" y1="20" x2="90" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F4CDB8" />
          <stop offset="0.55" stopColor="#C9E6D6" />
          <stop offset="1" stopColor="#D6D9F0" />
        </linearGradient>
        <clipPath id={`${id}-today`}>
          <rect x="46" y="12" width="60" height="90" rx="30" />
        </clipPath>
      </defs>
      <rect x="14" y="34" width="60" height="90" rx="30" style={{ fill: 'var(--surface)' }} />
      <rect x="14" y="34" width="60" height="90" rx="30" fill={`url(#${id}-sheen)`} opacity="0.75" clipPath={`url(#${id}-today)`} />
      <rect x="14" y="34" width="60" height="90" rx="30" style={{ stroke: 'var(--brand)' }} strokeOpacity="0.42" strokeWidth="3" />
      <rect x="46" y="12" width="60" height="90" rx="30" style={{ stroke: 'var(--brand)' }} strokeWidth="2.5" strokeDasharray="7 7" strokeLinecap="round" />
    </svg>
  );
}
