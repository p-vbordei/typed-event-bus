# typed-event-bus

[![ci](https://github.com/p-vbordei/typed-event-bus/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/typed-event-bus/actions/workflows/ci.yml)

A tiny, dependency-free, type-safe event bus. Works anywhere modern JS runs — Node, browsers, Deno, Bun, edge runtimes.

```ts
import { EventBus } from "typed-event-bus";

type Events = {
  "task.created": { id: string };
  "task.done":    { id: string; ms: number };
};

const bus = new EventBus<Events>();

const off = bus.on("task.created", ({ id }) => console.log("created", id));
bus.once("task.done", ({ id, ms }) => console.log("done", id, ms));

await bus.emit("task.created", { id: "abc" });
await bus.emit("task.done",    { id: "abc", ms: 142 });

off();
```

## Install

```sh
npm install typed-event-bus
```

## Why

Node's `EventEmitter` is untyped, ships only in Node, and is bigger than this whole package. `typed-event-bus` is ~120 lines, zero deps, runs everywhere, and gives you real TypeScript autocomplete for both event names and payload shapes.

## API

```ts
new EventBus<E>(opts?: { onError?: (err, event) => void })

bus.on(event, listener) → unsubscribe()
bus.once(event, listener) → unsubscribe()
bus.onAny((event, payload) => ...) → unsubscribe()
bus.off(event, listener) → void
bus.emit(event, payload) → Promise<void>     // resolves after all async listeners settle
bus.waitFor(event, timeoutMs?) → Promise<payload>
bus.listenerCount(event) → number
bus.clear(event?) → void                      // clears one event, or everything
```

### Listener errors

By default, listener errors **throw**. Pass `onError` to the constructor to collect them instead — sibling listeners keep running either way:

```ts
const bus = new EventBus<Events>({
  onError: (err, event) => console.error(`[${event}]`, err),
});
```

Both sync `throw` and async `Promise` rejections are routed through `onError`.

### Async listeners

Listeners may return `Promise<void>`. `emit()` returns a promise that resolves after all async listeners settle. Useful when you need to await side-effects (e.g. in tests).

## License

Apache-2.0 © Vlad Bordei
