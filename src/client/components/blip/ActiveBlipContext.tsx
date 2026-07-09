import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Single-active-blip invariant (BLB §18b2 three-state model): a topic shows at
// most ONE blip with chrome (menu bar / edit toolbar) at a time. Every
// RizzomaBlip derives its "active" state from this shared context instead of
// activating itself whenever it happens to be expanded — the June-16 merge was
// rejected precisely because every expanded nested blip showed its own toolbar.
interface ActiveBlipState {
  activeBlipId: string | null;
  setActiveBlip: (id: string | null) => void;
}

const ActiveBlipContext = createContext<ActiveBlipState | null>(null);

export function ActiveBlipProvider({ children }: { children: ReactNode }) {
  const [activeBlipId, setActiveBlip] = useState<string | null>(null);
  const value = useMemo(() => ({ activeBlipId, setActiveBlip }), [activeBlipId]);
  return <ActiveBlipContext.Provider value={value}>{children}</ActiveBlipContext.Provider>;
}

// Null outside a provider — callers fall back to their legacy local behavior.
export function useActiveBlip(): ActiveBlipState | null {
  return useContext(ActiveBlipContext);
}

// Bridges a NON-RizzomaBlip edit surface (the topic-level editor owned by
// RizzomaTopicDetail) into the single-active model: while it is editing it
// claims the slot under a synthetic id, and when any blip claims the slot it
// releases (finishing, i.e. saving, the topic edit). Without this, topic-root
// edit + a child editor could both be editable at once (two toolbars).
export function EditSurfaceActiveBridge({
  editing,
  surfaceId,
  hostBlipId,
  onRelease,
}: {
  editing: boolean;
  surfaceId: string;
  // The blip whose container visually hosts this edit surface (e.g. the topic
  // root). Clicks INSIDE the surface bubble to that blip's container and claim
  // ITS id — that is a click on our own surface, never a reason to release.
  // Without this, clicking into the topic editor blurred+closed it instantly.
  hostBlipId?: string;
  onRelease: () => void;
}) {
  const ctx = useContext(ActiveBlipContext);
  const { activeBlipId, setActiveBlip } = ctx ?? { activeBlipId: null, setActiveBlip: undefined };
  // Claim on edit start (and re-claim is a no-op thanks to useState bailout).
  useEffect(() => {
    if (editing) setActiveBlip?.(surfaceId);
  }, [editing, surfaceId, setActiveBlip]);
  // Release when a genuinely FOREIGN surface claims while we are editing — and
  // only AFTER our own claim has been observed. The claim lands via setState
  // from an effect, so the first post-edit commit still carries the PREVIOUS
  // active id; releasing against that stale value would close the edit the
  // instant it opened.
  const claimedRef = useRef(false);
  useEffect(() => {
    if (!ctx || !editing) {
      claimedRef.current = false;
      return;
    }
    if (activeBlipId === surfaceId) {
      claimedRef.current = true;
    } else if (activeBlipId === hostBlipId) {
      // Our own host container was clicked (e.g. inside the editor) — reassert
      // the surface claim instead of releasing.
      if (claimedRef.current) setActiveBlip?.(surfaceId);
    } else if (claimedRef.current) {
      claimedRef.current = false;
      onRelease();
    }
  }, [ctx, editing, activeBlipId, surfaceId, hostBlipId, setActiveBlip, onRelease]);
  return null;
}
