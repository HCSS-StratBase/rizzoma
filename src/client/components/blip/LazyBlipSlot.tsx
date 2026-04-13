// Lazy-mount slot for top-level child blips under the topic root.
//
// Motivation: in full-render mode (perfRender != 'lite'), rendering a
// topic with 1000+ reply blips meant mounting 1000 full `<RizzomaBlip>`
// React components at initial load — each with ~29 useEffects, multiple
// refs, and event listeners. That blocked the main thread for seconds
// and was the reason perfRender=lite existed as a fallback.
//
// This component wraps each child-blip render in an IntersectionObserver
// gate: on first mount it renders a fixed-height skeleton placeholder,
// and only upgrades to the full `<RizzomaBlip>` once the slot enters
// (or approaches) the viewport via `rootMargin`. Off-screen children
// never pay the React-component mount cost, while still occupying
// vertical space so the page layout stays stable.
//
// The skeleton renders a lightweight `.blip-collapsed-row` with the
// child's label so the user sees the "landing-labels" view that matches
// what perfRender=lite produces. Once scrolled near, it swaps in the
// real `<RizzomaBlip>` which takes over event handling and full
// rendering. The swap is one-way — we never downgrade a mounted slot
// back to a skeleton, because unmounting loses all local state
// (expanded/collapsed, edit mode, inline children) the user may have
// interacted with.
//
// Used from `RizzomaBlip.tsx` when `isTopicRoot && listChildren.length
// > LAZY_MOUNT_THRESHOLD` so the small-wave common case stays on the
// original eager-mount path.

import { useEffect, useRef, useState, useCallback, memo, type ReactNode } from 'react';

export const LAZY_MOUNT_THRESHOLD = 100;
const ROOT_MARGIN = '1000px 0px'; // mount when slot is within ~1000px of viewport
const PLACEHOLDER_HEIGHT = 40; // px — collapsed row ~32 + padding

type LazyBlipSlotProps = {
  blipId: string;
  label: string;
  hasUnread: boolean;
  hasChildren: boolean;
  onExpand?: (blipId: string) => void;
  renderFull: () => ReactNode;
};

function LazyBlipSlotImpl({
  blipId,
  label,
  hasUnread,
  hasChildren,
  onExpand,
  renderFull,
}: LazyBlipSlotProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const node = slotRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      // SSR or ancient browsers — fall back to eager mount on next tick.
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // If the user clicks the placeholder, upgrade immediately and
      // forward the expand intent so the resulting RizzomaBlip mounts
      // in its expanded state on the very first render.
      e.stopPropagation();
      setMounted(true);
      onExpand?.(blipId);
    },
    [blipId, onExpand],
  );

  if (mounted) {
    return <>{renderFull()}</>;
  }

  return (
    <div
      ref={slotRef}
      className="rizzoma-blip lazy-blip-slot"
      data-blip-id={blipId}
      data-testid="lazy-blip-slot"
      style={{ minHeight: PLACEHOLDER_HEIGHT }}
    >
      <div
        className={`blip-collapsed-row lazy-blip-collapsed ${hasUnread ? 'has-unread' : ''}`}
        onClick={handleClick}
      >
        <span className="blip-bullet">•</span>
        <span className="blip-collapsed-label-text">{label}</span>
        {hasChildren && (
          <span className={`blip-expand-icon ${hasUnread ? 'has-unread' : ''}`}>+</span>
        )}
      </div>
    </div>
  );
}

export const LazyBlipSlot = memo(LazyBlipSlotImpl);
