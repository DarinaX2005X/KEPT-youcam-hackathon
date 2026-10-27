import { Skeleton } from '@/components/ui';
import styles from './ShelfPage.module.css';
import rowStyles from './ShelfRow.module.css';

/** Placeholder rows shaped like the shelf while trials load from this browser. */
export function ShelfSkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <ul className={styles.list} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className={rowStyles.row} style={{ pointerEvents: 'none' }}>
            <Skeleton width={64} aspect="3 / 4" radius="10px" className={rowStyles.thumb} />
            <span className={rowStyles.name}>
              <Skeleton width="62%" height={22} radius="tag" />
              <Skeleton width="38%" height={15} radius="tag" />
            </span>
            <span className={rowStyles.progress}>
              <Skeleton width={110} height={15} radius="tag" />
              <Skeleton width="100%" height={4} radius="round" />
            </span>
            <span className={rowStyles.verdictCell}>
              <Skeleton width={140} height={28} radius="round" />
            </span>
            <span className={rowStyles.tags}>
              <Skeleton width={64} height={24} radius="tag" />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
