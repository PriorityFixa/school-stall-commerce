/**
 * Shared admin access helper.
 * Prompts for the admin PIN once per browser tab (kept in sessionStorage),
 * sends it as X-Stall-Pin, and re-prompts if the Worker rejects it.
 *
 * Usage:  const data = await StallAdmin.api("/api/students");
 */
(function () {
  "use strict";

  const API_URL = "https://school-stall-commerce.priorityfixa.workers.dev";
  const PIN_KEY = "stallAdminPin";

  let pinPromise = null;

  function getPin(message) {
    const stored = sessionStorage.getItem(PIN_KEY);
    if (stored) return Promise.resolve(stored);

    // Parallel requests share one prompt.
    if (!pinPromise) {
      pinPromise = Promise.resolve().then(() => {
        const entered = window.prompt(message || "Enter the admin PIN:");
        const pin = entered ? entered.trim() : "";

        if (!pin) throw new Error("The admin PIN is required.");

        sessionStorage.setItem(PIN_KEY, pin);
        return pin;
      }).finally(() => {
        pinPromise = null;
      });
    }

    return pinPromise;
  }

  async function api(path, options = {}) {
    let lastError = new Error("Request failed.");

    for (let attempt = 0; attempt < 2; attempt++) {
      const pin = await getPin(
        attempt ? "Incorrect PIN. Enter the admin PIN again:" : undefined
      );

      const response = await fetch(API_URL + path, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
          "X-Stall-Pin": pin
        }
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The server returned an unreadable response.");
      }

      if (response.status === 401) {
        if (sessionStorage.getItem(PIN_KEY) === pin) {
          sessionStorage.removeItem(PIN_KEY);
        }
        lastError = new Error(data.error || "Invalid admin PIN.");
        continue;
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Request failed (${response.status}).`);
      }

      return data;
    }

    throw lastError;
  }

  function signOut() {
    sessionStorage.removeItem(PIN_KEY);
  }

  window.StallAdmin = { API_URL, api, signOut };
})();
