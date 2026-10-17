import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeQuickAction, observeQuickActions, publishWidgetTemplates } from "./quick-action-bridge";

type Listener = () => void;

function stubNative(queue: string[], publish?: (json: string) => void) {
  const listeners: Record<string, Listener[]> = {};
  const add = (target: Record<string, Listener[]>) => (type: string, fn: Listener) => {
    target[type] = [...(target[type] || []), fn];
  };
  const remove = (target: Record<string, Listener[]>) => (type: string, fn: Listener) => {
    target[type] = (target[type] || []).filter((item) => item !== fn);
  };
  const documentStub = { visibilityState: "visible", addEventListener: add(listeners), removeEventListener: remove(listeners) };
  Object.assign(globalThis, {
    window: {
      BugetFamilieQuickAction: {
        consume: () => queue.shift() || "",
        publishTemplates: publish,
      },
      addEventListener: add(listeners),
      removeEventListener: remove(listeners),
    },
    document: documentStub,
  });
  return { fire: (type: string) => (listeners[type] || []).forEach((fn) => fn()), listeners };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

describe("puntea către widget", () => {
  it("întoarce acțiunea cerută o singură dată", () => {
    stubNative(["expense"]);
    expect(consumeQuickAction()).toBe("expense");
    expect(consumeQuickAction()).toBeUndefined();
  });

  it("ignoră o acțiune necunoscută", () => {
    stubNative(["stergeTot"]);
    expect(consumeQuickAction()).toBeUndefined();
  });

  it("citește un șablon de pe widget ca template:id", () => {
    stubNative(["template:taxi-serviciu"]);
    expect(consumeQuickAction()).toEqual({ kind: "template", templateId: "taxi-serviciu" });
  });

  it("publică pe widget doar id și etichetă, max 3 — o singură dată, după ce ecranul se liniștește", () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    stubNative([], publish);
    publishWidgetTemplates([
      { id: "a", label: "Taxi" },
      { id: "b", label: "Lidl" },
      { id: "c", label: "Benzină" },
      { id: "d", label: "Extra" },
    ]);
    // Puntea e sincronă: nu o chemăm în timpul randării.
    expect(publish).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(publish).toHaveBeenCalledWith(JSON.stringify([
      { id: "a", label: "Taxi" },
      { id: "b", label: "Lidl" },
      { id: "c", label: "Benzină" },
    ]));
    // Aceleași șabloane din nou: nimic nou de scris pe widget.
    publishWidgetTemplates([{ id: "a", label: "Taxi" }, { id: "b", label: "Lidl" }, { id: "c", label: "Benzină" }]);
    vi.runAllTimers();
    expect(publish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("nu face nimic fără puntea nativă", () => {
    vi.useFakeTimers();
    Object.assign(globalThis, {
      window: { setTimeout: globalThis.setTimeout.bind(globalThis), addEventListener: () => undefined, removeEventListener: () => undefined },
      document: { addEventListener: () => undefined, removeEventListener: () => undefined, visibilityState: "visible" },
    });
    const handle = vi.fn();
    const stop = observeQuickActions(handle);
    vi.runAllTimers();
    stop();
    expect(handle).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("verifică la montare și la revenirea în prim-plan", () => {
    const native = stubNative(["expense"]);
    const handle = vi.fn();
    const stop = observeQuickActions(handle);
    expect(handle).toHaveBeenCalledWith("expense");

    (globalThis as unknown as { window: { BugetFamilieQuickAction: { consume: () => string } } }).window.BugetFamilieQuickAction.consume = () => "receipt";
    native.fire("visibilitychange");
    expect(handle).toHaveBeenLastCalledWith("receipt");
    stop();
  });

  it("desface ascultătorii la oprire", () => {
    const native = stubNative([]);
    const stop = observeQuickActions(() => undefined);
    stop();
    expect(native.listeners.visibilitychange).toEqual([]);
    expect(native.listeners.focus).toEqual([]);
    expect(native.listeners["buget-familie:quick-action"]).toEqual([]);
  });

  it("consumă imediat când nativul semnalează quick-action cu aplicația deja vizibilă", () => {
    const native = stubNative([]);
    const handle = vi.fn();
    const stop = observeQuickActions(handle);
    expect(handle).not.toHaveBeenCalled();

    (globalThis as unknown as { window: { BugetFamilieQuickAction: { consume: () => string } } }).window.BugetFamilieQuickAction.consume = () => "expense";
    native.fire("buget-familie:quick-action");
    expect(handle).toHaveBeenCalledWith("expense");
    stop();
  });
});

import { shoppingWidgetData } from "./quick-action-bridge";
describe("widgetul listei", () => {
  it("primele 4 produse, fără goluri, și câte sunt", () => {
    const todo = ["Lapte", " ", "Pâine", "Ouă", "Mere", "Pere"].map((text) => ({ text }));
    expect(shoppingWidgetData(todo, (n) => `${n} produse`)).toEqual({ items: ["Lapte", "Pâine", "Ouă"], count: "6 produse" });
    expect(shoppingWidgetData([], () => "x")).toEqual({ items: [], count: "" });
  });
});
