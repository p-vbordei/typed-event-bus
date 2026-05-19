import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/index.js";

type Events = {
  "task.created": { id: string };
  "task.done": { id: string; ms: number };
  ping: void;
};

describe("basic pub/sub", () => {
  it("emits to subscribed listeners", async () => {
    const bus = new EventBus<Events>();
    const seen: string[] = [];
    bus.on("task.created", ({ id }) => seen.push(id));
    await bus.emit("task.created", { id: "a" });
    await bus.emit("task.created", { id: "b" });
    expect(seen).toEqual(["a", "b"]);
  });

  it("unsubscribes via returned function", async () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    const off = bus.on("task.created", fn);
    await bus.emit("task.created", { id: "a" });
    off();
    await bus.emit("task.created", { id: "b" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("multiple listeners all receive", async () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("ping", a);
    bus.on("ping", b);
    await bus.emit("ping", undefined);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});

describe("once", () => {
  it("fires once then auto-unsubscribes", async () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    bus.once("ping", fn);
    await bus.emit("ping", undefined);
    await bus.emit("ping", undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("onAny", () => {
  it("receives all events", async () => {
    const bus = new EventBus<Events>();
    const seen: [keyof Events, unknown][] = [];
    bus.onAny((event, payload) => seen.push([event, payload]));
    await bus.emit("task.created", { id: "a" });
    await bus.emit("ping", undefined);
    expect(seen).toEqual([
      ["task.created", { id: "a" }],
      ["ping", undefined],
    ]);
  });

  it("unsubscribes via returned function", async () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    const off = bus.onAny(fn);
    await bus.emit("ping", undefined);
    off();
    await bus.emit("ping", undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("error handling", () => {
  it("routes sync throws through onError; siblings still run", async () => {
    const errors: unknown[] = [];
    const bus = new EventBus<Events>({ onError: (e) => errors.push(e) });
    bus.on("ping", () => { throw new Error("boom"); });
    const sibling = vi.fn();
    bus.on("ping", sibling);
    await bus.emit("ping", undefined);
    expect(errors).toHaveLength(1);
    expect(sibling).toHaveBeenCalledOnce();
  });

  it("routes async rejections through onError", async () => {
    const errors: unknown[] = [];
    const bus = new EventBus<Events>({ onError: (e) => errors.push(e) });
    bus.on("ping", async () => { throw new Error("async boom"); });
    await bus.emit("ping", undefined);
    expect(errors).toHaveLength(1);
  });
});

describe("waitFor", () => {
  it("resolves on next emission", async () => {
    const bus = new EventBus<Events>();
    const promise = bus.waitFor("task.done");
    setTimeout(() => { void bus.emit("task.done", { id: "x", ms: 10 }); }, 5);
    await expect(promise).resolves.toEqual({ id: "x", ms: 10 });
  });

  it("rejects on timeout", async () => {
    const bus = new EventBus<Events>();
    await expect(bus.waitFor("task.done", 20)).rejects.toThrow(/timed out/);
  });
});

describe("listenerCount + clear", () => {
  it("counts and clears", () => {
    const bus = new EventBus<Events>();
    bus.on("ping", () => {});
    bus.on("ping", () => {});
    expect(bus.listenerCount("ping")).toBe(2);
    bus.clear("ping");
    expect(bus.listenerCount("ping")).toBe(0);
  });

  it("clear() removes everything including onAny", async () => {
    const bus = new EventBus<Events>();
    const wild = vi.fn();
    bus.on("ping", () => {});
    bus.onAny(wild);
    bus.clear();
    await bus.emit("ping", undefined);
    expect(wild).not.toHaveBeenCalled();
  });
});
