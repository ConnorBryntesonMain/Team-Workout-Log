// Unit tests for App: which screen shows, and the logged-in nav.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { reply, stubFetch } from "./testUtils.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const click = (name) => userEvent.click(screen.getByRole("button", { name }));
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("logged out", () => {
  test("starts on Log In and switches to Sign Up and back", async () => {
    render(<App />);
    expect(heading()).toBe("Log In");
    await click("Sign Up");
    expect(heading()).toBe("Sign Up");
    await click("Log In");
    expect(heading()).toBe("Log In");
  });

  test("Forgot password? opens the reset screen", async () => {
    render(<App />);
    await click("Forgot password?");
    expect(heading()).toBe("Reset Password");
    await click("Back to Log In");
    expect(heading()).toBe("Log In");
  });
});

describe("logged in", () => {
  async function logInAs(role) {
    const me = { id: 1, name: "Al", email: "a@b.com", role, created_at: "2026-01-01" };
    stubFetch({
      "/login": reply(me),
      "/me": reply(me),
      "/logout": { ok: true, status: 204 },
      "/auth/team": reply([]),
      "/workouts/log": reply([]),
      "/workouts": reply([]),
    });
    render(<App />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await click("Log In");
    await screen.findByRole("heading", { name: "Profile" });
  }

  test("an athlete sees Profile and Workouts tabs but not Team", async () => {
    await logInAs("athlete");
    expect(screen.getByRole("button", { name: "Profile" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Workouts" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Team" })).toBeNull();
  });

  test("a coach can switch between all three pages", async () => {
    await logInAs("coach");
    await click("Workouts");
    expect(await screen.findByRole("heading", { name: "Workouts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Workouts" }).getAttribute("aria-current")).toBe("page");
    await click("Team");
    expect(await screen.findByRole("heading", { name: "My Team" })).toBeTruthy();
    await click("Profile");
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
  });

  test("logging out returns to Log In", async () => {
    await logInAs("athlete");
    await click("Log Out");
    expect(await screen.findByRole("heading", { name: "Log In" })).toBeTruthy();
  });
});
