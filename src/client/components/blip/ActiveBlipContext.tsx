import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
  onRelease,
}: {
  editing: boolean;
  surfaceId: string;
  onRelease: () => void;
}) {
  const ctx = useContext(ActiveBlipContext);
  const { activeBlipId, setActiveBlip } = ctx ?? { activeBlipId: null, setActiveBlip: undefined };
  // Claim on edit start (and re-claim is a no-op thanks to useState bailout).
  useEffect(() => {
    if (editing) setActiveBlip?.(surfaceId);
  }, [editing, surfaceId, setActiveBlip]);
  // Release when someone else claims while we are editing.
  useEffect(() => {
    if (!ctx || !editing) return;
    if (activeBlipId !== null && activeBlipId !== surfaceId) onRelease();
  }, [ctx, editing, activeBlipId, surfaceId, onRelease]);
  return null;
}
