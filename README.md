# typed-event-bus

[![ci](https://github.com/p-vbordei/typed-event-bus/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/typed-event-bus/actions/workflows/ci.yml)

[![npm](https://img.shields.io/npm/v/%40p-vbordei%2Ftyped-event-bus.svg)](https://www.npmjs.com/package/@p-vbordei/typed-event-bus)
[![downloads](https://img.shields.io/npm/dm/%40p-vbordei%2Ftyped-event-bus.svg)](https://www.npmjs.com/package/@p-vbordei/typed-event-bus)
[![bundle](https://img.shields.io/bundlejs/size/%40p-vbordei%2Ftyped-event-bus)](https://bundlejs.com/?q=%40p-vbordei%2Ftyped-event-bus)

> A tiny, dependency-free, type-safe event bus. Works anywhere modern JS runs — Node, browsers, Deno, Bun, edge runtimes.

```ts
import { EventBus } from "@p-vbordei/typed-event-bus";

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
npm install @p-vbordei/typed-event-bus
```

Works with Node 20+, browsers, Bun, Deno. ESM + CJS.

## Why

Node's `EventEmitter` is untyped, ships only in Node, and is bigger than this whole package. `typed-event-bus` is ~120 lines, zero deps, runs everywhere, and gives you real TypeScript autocomplete for both event names and payload shapes.

## Recipes

### Decouple modules via events

```ts
// events.ts
import { EventBus } from "@p-vbordei/typed-event-bus";

type AppEvents = {
  "user.signup":  { userId: string; plan: "free" | "pro" };
  "user.cancel":  { userId: string };
  "billing.fail": { userId: string; reason: string };
};

export const events = new EventBus<AppEvents>();
```

```ts
// in auth module
events.emit("user.signup", { userId, plan: "free" });

// in email module (knows nothing about auth)
events.on("user.signup", async ({ userId, plan }) => {
  await sendWelcomeEmail(userId, plan);
});

// in metrics module
events.onAny((event, payload) => {
  metrics.inc(`event.${event.replace(".", "_")}`);
});
```

### React-like "await next" pattern

```ts
import { EventBus } from "@p-vbordei/typed-event-bus";

type Events = { "auth.complete": { token: string } };
const bus = new EventBus<Events>();

// Anywhere in the app:
const { token } = await bus.waitFor("auth.complete", 30_000);  // 30s timeout
```

### Bridge to native EventTarget / WebSocket

```ts
import { EventBus } from "@p-vbordei/typed-event-bus";

type Messages = { open: void; close: { code: number }; message: { data: string } };
const bus = new EventBus<Messages>();

ws.addEventListener("open",    () => bus.emit("open", undefined));
ws.addEventListener("close",   (e) => bus.emit("close", { code: e.code }));
ws.addEventListener("message", (e) => bus.emit("message", { data: e.data }));

// Consumer side gets typed events:
bus.on("message", ({ data }) => handle(JSON.parse(data)));
```

### Cleanup on component unmount

```tsx
import { useEffect } from "react";
import { events } from "./events";

function MyComponent() {
  useEffect(() => {
    const off = events.on("user.signup", ({ userId }) => {
      console.log("new user:", userId);
    });
    return off;  // off() runs on unmount
  }, []);
  return <div>...</div>;
}
```

### Error isolation

```ts
import { EventBus } from "@p-vbordei/typed-event-bus";

const bus = new EventBus<Events>({
  onError: (err, event) => {
    logger.error(`listener for ${event} threw:`, err);
    // don't re-throw — other listeners should still run
  },
});

bus.on("task.created", () => { throw new Error("boom"); });
bus.on("task.created", () => { /* still runs even though prev threw */ });
```

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

## When to use this

- ✅ Decoupling modules within a single process
- ✅ React/Vue/Svelte event bridges
- ✅ WebSocket / EventSource adapters
- ✅ Anywhere you want pub/sub without dependencies
- ❌ Cross-process pub/sub — use Redis, NATS, or another broker
- ❌ Persistent event sourcing — this is in-memory

## License

Apache-2.0 © Vlad Bordei
