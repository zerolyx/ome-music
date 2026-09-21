/**
 * 1.0 Foundation — typed event bus.
 *
 * Why this exists: the backend currently emits zero events, so every
 * asynchronous state change (QQ login flow, NetEase sidecar readiness, QR
 * polling) is discovered by the frontend polling a command. A typed bus gives
 * the app layer one place to publish facts and one place to subscribe to them,
 * without pulling in a state library.
 *
 * Not wired into App/lib.rs yet — Phase 1A only establishes the skeleton.
 */

export type EventMap = Record<string, unknown>;

export type EventListener<Payload> = (payload: Payload) => void;

export interface EventBus<Events extends EventMap> {
  on<Key extends keyof Events>(type: Key, listener: EventListener<Events[Key]>): () => void;
  once<Key extends keyof Events>(type: Key, listener: EventListener<Events[Key]>): () => void;
  emit<Key extends keyof Events>(type: Key, payload: Events[Key]): void;
  listenerCount(type: keyof Events): number;
  clear(type?: keyof Events): void;
}

export function createEventBus<Events extends EventMap>(): EventBus<Events> {
  const listeners = new Map<keyof Events, Set<EventListener<never>>>();

  const subscribe = <Key extends keyof Events>(
    type: Key,
    listener: EventListener<Events[Key]>,
    single: boolean,
  ): (() => void) => {
    const set = listeners.get(type) ?? new Set();
    listeners.set(type, set);

    const wrapped = single
      ? (payload: Events[Key]) => {
          set.delete(wrapped as EventListener<never>);
          listener(payload);
        }
      : listener;

    set.add(wrapped as EventListener<never>);

    return () => {
      set.delete(wrapped as EventListener<never>);
      if (set.size === 0) listeners.delete(type);
    };
  };

  return {
    on(type, listener) {
      return subscribe(type, listener, false);
    },
    once(type, listener) {
      return subscribe(type, listener, true);
    },
    emit(type, payload) {
      const set = listeners.get(type);
      if (!set) return;
      // Copy first: a listener may unsubscribe itself or others while running.
      for (const listener of [...set]) {
        (listener as EventListener<Events[typeof type]>)(payload);
      }
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
    clear(type) {
      if (type) listeners.delete(type);
      else listeners.clear();
    },
  };
}
