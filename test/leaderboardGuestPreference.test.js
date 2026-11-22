import assert from "node:assert/strict";
import test from "node:test";
import { loadGuestPreference, saveGuestPreference } from "../src/leaderboard/guestPreference.js";

test("lembra a escolha de convidado", (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  context.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  });

  assert.equal(loadGuestPreference(), false);
  saveGuestPreference();
  assert.equal(loadGuestPreference(), true);
});

test("permite jogar como convidado com o armazenamento bloqueado", (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("Armazenamento bloqueado."); },
  });
  context.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  });

  assert.equal(loadGuestPreference(), false);
  assert.doesNotThrow(saveGuestPreference);
});
