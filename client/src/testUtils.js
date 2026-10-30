// Shared helpers for the client tests.
import { vi } from "vitest";

export const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// Answers fetch by the first matching URL fragment (in insertion order, so list specific
// fragments first); a function value is called with (url, options). Anything unmatched
// rejects, like an unreachable server.
export function stubFetch(routes) {
  const fetch = vi.fn(async (url, options) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new TypeError("Failed to fetch");
    const value = routes[key];
    return typeof value === "function" ? value(url, options) : value;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

// The parsed JSON body of the first fetch call whose URL includes `fragment` and uses `method`.
export function sentBody(fetch, fragment, method = "POST") {
  const call = fetch.mock.calls.find(([url, opts]) => url.includes(fragment) && opts?.method === method);
  return call && JSON.parse(call[1].body);
}
