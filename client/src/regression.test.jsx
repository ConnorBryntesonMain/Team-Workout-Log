// Regression tests for bugs fixed on 2026-10-30. Each describe block names the bug.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Profile from "./Profile.jsx";
import Team from "./Team.jsx";
import Workouts from "./Workouts.jsx";
import { reply, stubFetch } from "./testUtils.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const offline = "could not reach the server";

describe("network failures show an error instead of doing nothing", () => {
  test("Login", async () => {
    stubFetch({});
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "Log In" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  test("Signup", async () => {
    stubFetch({});
    render(<Signup onSignedUp={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Name"), "Al");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.type(screen.getByLabelText("Answer"), "Rex");
    await userEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
  });

  const athlete = { name: "Al", email: "a@b.com", role: "athlete", created_at: "2026-01-01" };

  test("Profile: join team", async () => {
    stubFetch({ "/me": reply({ ...athlete, athleteCode: null }) });
    render(<Profile onLoggedOut={vi.fn()} />);
    await userEvent.type(await screen.findByLabelText("Enter Team Code:"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
  });

  test("Profile: leave team", async () => {
    stubFetch({ "/me": reply({ ...athlete, athleteCode: "123456", coachName: "Cy" }) });
    render(<Profile onLoggedOut={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Leave Team" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
    expect(screen.getByText("Team Code: 123456")).toBeTruthy();
  });

  test("Profile: change password", async () => {
    stubFetch({ "/me": reply(athlete) });
    render(<Profile onLoggedOut={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reset Password" }));
    await userEvent.type(screen.getByLabelText("Current Password"), "oldpass12");
    await userEvent.type(screen.getByLabelText("New Password"), "newpass12");
    await userEvent.click(screen.getByRole("button", { name: "Save Password" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
  });

  test("Profile: log out still logs out locally", async () => {
    stubFetch({ "/me": reply(athlete) });
    const onLoggedOut = vi.fn();
    render(<Profile onLoggedOut={onLoggedOut} />);
    await userEvent.click(await screen.findByRole("button", { name: "Log Out" }));
    expect(onLoggedOut).toHaveBeenCalledOnce();
  });

  test("Workouts: athlete's log fails to load", async () => {
    stubFetch({ "/workouts/log": () => Promise.reject(new TypeError("Failed to fetch")), "/workouts": reply([]) });
    render(<Workouts user={{ role: "athlete", name: "Al" }} />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
  });

  test("Workouts: coach saves a workout", async () => {
    const fetch = stubFetch({ "/workouts": reply([]) });
    render(<Workouts user={{ role: "coach", name: "Cy" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "New Workout" }));
    await userEvent.type(screen.getByLabelText("Workout Name"), "Legs");
    await userEvent.type(screen.getByLabelText("Exercise 1 name"), "Squat");
    await userEvent.type(screen.getByLabelText("Exercise 1 reps"), "5");
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
  });

  test("Workouts: coach deletes a workout", async () => {
    vi.stubGlobal("confirm", () => true);
    const fetch = stubFetch({ "/workouts": reply([{ id: 1, name: "Legs", exercises: [] }]) });
    render(<Workouts user={{ role: "coach", name: "Cy" }} />);
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
    expect(screen.getByText("Legs")).toBeTruthy();
  });

  test("Team: viewing an athlete's log", async () => {
    stubFetch({ "/team": reply([{ id: 1, name: "Al", email: "a@b.com" }]) });
    render(<Team />);
    await userEvent.click(await screen.findByRole("button", { name: "View Workout" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", offline);
  });
});

describe("Team: a slow log response can't overwrite the athlete opened after it", () => {
  test("opening A then B, with A answering last, shows B's log", async () => {
    const pending = {};
    stubFetch({
      "/team": reply([
        { id: 1, name: "Al", email: "a@b.com" },
        { id: 2, name: "Bo", email: "b@b.com" },
      ]),
      "athleteId=": (url) => new Promise((resolve) => (pending[url.at(-1)] = resolve)),
    });
    const entry = (id, name) => ({ id, name, performed_at: "2026-10-01", exercises: [] });

    render(<Team />);
    await screen.findByText("Al");
    const [viewA, viewB] = screen.getAllByRole("button", { name: "View Workout" });
    await userEvent.click(viewA);
    await userEvent.click(viewB);

    pending[2](reply([entry(20, "Bo's workout")]));
    await screen.findByText(/Bo's workout/);
    pending[1](reply([entry(10, "Al's workout")]));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText(/Bo's workout/)).toBeTruthy();
    expect(screen.queryByText(/Al's workout/)).toBeNull();
    expect(screen.queryByText("Loading...")).toBeNull();
  });
});

describe("Workouts: logging prefills from the same workout's last log, matched by id", () => {
  const squat = (weight) => ({ exercise: "Squat", set: 1, reps: "5", weight });
  const pastLog = { id: 9, coach_workout_id: 1, name: "Legs", performed_at: "2026-10-01", exercises: [squat("225")] };

  async function openLog(workout) {
    stubFetch({ "/workouts/log": reply([pastLog]), "/workouts": reply([workout]) });
    render(<Workouts user={{ role: "athlete", name: "Al" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Log This Workout" }));
    return screen.getAllByLabelText(/Squat set \d weight/).map((input) => input.value);
  }

  const exercises = [{ exercise: "Squat", sets: 3, reps: "5" }];

  test("a renamed workout still prefills its history", async () => {
    expect(await openLog({ id: 1, name: "Leg Day", exercises })).toEqual(["225"]);
  });

  test("a different workout with the same name doesn't", async () => {
    expect(await openLog({ id: 2, name: "Legs", exercises })).toEqual(["", "", ""]);
  });
});

describe("Profile: change password requires 8 characters like signup", () => {
  test("new password input has minLength 8", async () => {
    stubFetch({ "/me": reply({ name: "Al", email: "a@b.com", role: "athlete", created_at: "2026-01-01" }) });
    render(<Profile onLoggedOut={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reset Password" }));
    expect(screen.getByLabelText("New Password").minLength).toBe(8);
  });
});
