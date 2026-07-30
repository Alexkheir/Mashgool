'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Zustand owns UI/view state — the stuff that is about *how the app looks to this
// user right now*, not server data (that's React Query's job). This is the
// `ui.store` from CLAUDE.md: the active client workspace and the preferred view
// mode, persisted to localStorage so a reload lands you back where you were.
//
// In Feature 8 only `activeClientId` is exercised (selecting a client card).
// `viewMode` is built to the documented shape now; the board/list toggle it
// drives arrives with the Scrum board in Feature 10.
export type ViewMode = 'board' | 'list';

interface UiState {
  activeClientId: string | null;
  viewMode: ViewMode;
  setActiveClient: (clientId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeClientId: null,
      viewMode: 'board',
      setActiveClient: (clientId) => set({ activeClientId: clientId }),
      setViewMode: (mode) => set({ viewMode: mode })
    }),
    { name: 'mashgool-ui' }
  )
);
