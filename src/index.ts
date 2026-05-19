export type EventMap = Record<string, unknown>;

export type Listener<T> = (payload: T) => void | Promise<void>;

export interface EventBusOptions {
  /** Called when a listener throws or rejects. Default: rethrow synchronously. */
  onError?: (err: unknown, event: string) => void;
}

/**
 * A tiny, dependency-free, type-safe event bus.
 *
 * ```ts
 * type Events = {
 *   "task.created": { id: string };
 *   "task.done":    { id: string; ms: number };
 * };
 *
 * const bus = new EventBus<Events>();
 * const off = bus.on("task.created", ({ id }) => console.log(id));
 * bus.emit("task.created", { id: "abc" });
 * off();
 * ```
 */
export class EventBus<E extends EventMap = EventMap> {
  private readonly listeners = new Map<keyof E, Set<Listener<unknown>>>();
  private readonly wildcardListeners = new Set<(event: keyof E, payload: unknown) => void>();
  private readonly onError: (err: unknown, event: string) => void;

  constructor(opts: EventBusOptions = {}) {
    this.onError = opts.onError ?? ((err) => { throw err; });
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  /**
   * Subscribe to the next emission of an event, then auto-unsubscribe.
   */
  once<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    const wrapper: Listener<E[K]> = (payload) => {
      this.off(event, wrapper);
      return listener(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Subscribe to every event. Receives `(event, payload)`.
   */
  onAny(listener: <K extends keyof E>(event: K, payload: E[K]) => void): () => void {
    const wrapped = listener as (event: keyof E, payload: unknown) => void;
    this.wildcardListeners.add(wrapped);
    return () => {
      this.wildcardListeners.delete(wrapped);
    };
  }

  /**
   * Remove a specific listener for an event.
   */
  off<K extends keyof E>(event: K, listener: Listener<E[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener<unknown>);
    if (!set.size) this.listeners.delete(event);
  }

  /**
   * Emit an event. Listener errors are routed through `onError` and never block sibling listeners.
   * Async listeners run in parallel; the returned promise resolves after all settle.
   */
  emit<K extends keyof E>(event: K, payload: E[K]): Promise<void> {
    const direct = this.listeners.get(event);
    const promises: Promise<unknown>[] = [];
    if (direct) {
      for (const l of [...direct]) {
        try {
          const r = (l as Listener<E[K]>)(payload);
          if (r && typeof (r as Promise<unknown>).then === "function") {
            promises.push(
              (r as Promise<unknown>).catch((e) => this.onError(e, event as string)),
            );
          }
        } catch (e) {
          this.onError(e, event as string);
        }
      }
    }
    for (const l of [...this.wildcardListeners]) {
      try {
        l(event, payload);
      } catch (e) {
        this.onError(e, event as string);
      }
    }
    return promises.length ? Promise.all(promises).then(() => undefined) : Promise.resolve();
  }

  /**
   * Wait for the next emission of an event. Useful with `await`.
   */
  waitFor<K extends keyof E>(event: K, timeoutMs?: number): Promise<E[K]> {
    return new Promise<E[K]>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const off = this.once(event, (payload) => {
        if (timer) clearTimeout(timer);
        resolve(payload);
      });
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          off();
          reject(new Error(`waitFor("${String(event)}") timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }

  /**
   * Number of subscribed listeners for an event (excluding wildcard listeners).
   */
  listenerCount(event: keyof E): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Remove all listeners for one event, or all events when called with no argument.
   */
  clear(event?: keyof E): void {
    if (event === undefined) {
      this.listeners.clear();
      this.wildcardListeners.clear();
    } else {
      this.listeners.delete(event);
    }
  }
}

export default EventBus;
