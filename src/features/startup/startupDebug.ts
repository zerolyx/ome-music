type StartupMark =
  | "appStartAt"
  | "frontendMountedAt"
  | "shellVisibleAt"
  | "lastSessionLoadedAt"
  | "settingsLoadedAt"
  | "providersInitStartedAt"
  | "providersReadyAt"
  | "firstInteractiveAt";

type StartupEntry = Partial<Record<StartupMark, number>> & {
  blockingTasks: string[];
};

const enabled = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
const start = typeof performance !== "undefined" ? performance.now() : Date.now();

const debug: StartupEntry = {
  appStartAt: 0,
  blockingTasks: [],
};

export function markStartup(name: StartupMark): void {
  if (!enabled) return;
  debug[name] = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - start,
  );
}

export function noteStartupTask(task: string): void {
  if (!enabled || debug.blockingTasks.includes(task)) return;
  debug.blockingTasks.push(task);
}

export function reportStartup(label = "Ome startup"): void {
  if (!enabled) return;
  const totalStartupTime = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - start,
  );
  // Keep the diagnostics in devtools only; normal users never see this.
  console.info(`[${label}]`, {
    ...debug,
    totalStartupTime,
  });
}
