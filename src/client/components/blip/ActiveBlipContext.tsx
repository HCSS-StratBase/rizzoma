import { createContext, useContext, useMemo, useState } from 'react';
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
