'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Zustand owns UI/view state — the stuff that is about *how the app looks to this
// user right now*, not server data (that's React Query's job). This is the
// `ui.store` from CLAUDE.md: the active client workspace and the preferred view
// mode, persisted to localStorage so a reload lands you back where you were.
export type ViewMode = 'board' | 'list';

// View mode is remembered *per workspace* (Feature 10): a client whose work you
// track on the board can stay on the board while another stays a list. The
// dashboard's own toggle is stored under this key, since it isn't a client.
export const GLOBAL_SCOPE = 'global';

interface UiState {
  activeClientId: string | null;
  // Keyed by client id, or GLOBAL_SCOPE for the dashboard. Absent → the default.
  viewModes: Record<string, ViewMode>;
  setActiveClient: (clientId: string | null) => void;
  setViewMode: (scope: string, mode: ViewMode) => void;
}

// The board is the default view everywhere — it's the feature's headline, and it
// shows status at a glance where the list shows detail.
const DEFAULT_VIEW: ViewMode = 'board';

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeClientId: null,
      viewModes: {},
      setActiveClient: (clientId) => set({ activeClientId: clientId }),
      setViewMode: (scope, mode) =>
        set((state) => ({ viewModes: { ...state.viewModes, [scope]: mode } }))
    }),
    {
      name: 'mashgool-ui',
      // v1 stored a single `viewMode` for the whole app. Re-key it onto the
      // dashboard scope so an existing visitor's preference survives the upgrade
      // instead of being dropped on the floor by a shape mismatch.
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<UiState> & { viewMode?: ViewMode };
        if (version < 2) {
          return {
            ...state,
            viewModes: state.viewMode ? { [GLOBAL_SCOPE]: state.viewMode } : {}
          };
        }
        return state;
      }
    }
  )
);

// Reading a scope's view mode with the default applied. A hook (not a plain
// getter) so a component re-renders when *its* scope changes — subscribing to
// the whole `viewModes` map would re-render every board on any toggle.
export function useViewMode(scope: string): ViewMode {
  return useUiStore((s) => s.viewModes[scope] ?? DEFAULT_VIEW);
}
