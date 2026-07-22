import { registerSW } from "virtual:pwa-register";

export interface UpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  update: () => Promise<void>;
}

let _update: (() => Promise<void>) | null = null;

export function initPwa(onNeedRefresh: () => void, onOfflineReady: () => void): UpdateState {
  const update = registerSW({
    onNeedRefresh() {
      onNeedRefresh();
    },
    onOfflineReady() {
      onOfflineReady();
    },
  });
  _update = update;
  return {
    needRefresh: false,
    offlineReady: false,
    update: async () => {
      try {
        await update();
      } catch {
        // ignored — SW may already be controlling
      }
    },
  };
}

export function triggerUpdate(): Promise<void> {
  if (_update) return Promise.resolve(_update());
  return Promise.resolve();
}