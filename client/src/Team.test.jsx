// Unit tests for Team (the coach's athlete list).
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Team from "./Team.jsx";
import { reply, stubFetch } from "./testUtils.js";

const excel = vi.hoisted(() => ({ toFile: vi.fn(), write: vi.fn() }));
vi.mock("write-excel-file/browser", () => ({
  default: (sheets) => {
    excel.write(sheets);
    return { toFile: excel.toFile };
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const al = { id: 1, name: "Al", email: "a@b.com" };
const bo = { id: 2, name: "Bo", email: "b@b.com" };
const entry = { id: 10, name: "Legs", performed_at: "2026-10-01T12:00:00Z", exercises: [{ exercise: "Squat", set: 1, reps: "5", weight: "225" }] };

describe("loading", () => {
  test("shows Loading... then the athletes", async () => {
    stubFetch({ "/team": reply([al, bo]) });
    render(<Team />);
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(await screen.findByText("Al")).toBeTruthy();
    expect(screen.getByText("b@b.com")).toBeTruthy();
  });

  test("shows the server's error when the team can't load", async () => {
    stubFetch({ "/team": reply({ error: "not logged in" }, 401) });
    render(<Team />);
    expect((await screen.findByRole("alert")).textContent).toBe("not logged in");
  });

  test("an empty team shows a hint and no download button", async () => {
    stubFetch({ "/team": reply([]) });
    render(<Team />);
    expect(await screen.findByText(/No athletes yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download Team Log" })).toBeNull();
  });
});

describe("viewing an athlete's log", () => {
  test("View fetches that athlete's log and shows it; Hide closes it", async () => {
    const fetch = stubFetch({ "athleteId=1": reply([entry]), "/team": reply([al]) });
    render(<Team />);
    const view = await screen.findByRole("button", { name: "View Workout" });
    await userEvent.click(view);
    expect(await screen.findByText(/Legs ·/)).toBeTruthy();
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(view.getAttribute("aria-expanded")).toBe("true");
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/log?athleteId=1"))).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Hide Workout" }));
    expect(screen.queryByText(/Legs ·/)).toBeNull();
  });

  test("an athlete with no logs gets a message", async () => {
    stubFetch({ "athleteId=1": reply([]), "/team": reply([al]) });
    render(<Team />);
    await userEvent.click(await screen.findByRole("button", { name: "View Workout" }));
    expect(await screen.findByText("Al hasn't logged any workouts yet.")).toBeTruthy();
  });

  test("a log for a deleted workout is labelled", async () => {
    stubFetch({ "athleteId=1": reply([{ ...entry, name: null }]), "/team": reply([al]) });
    render(<Team />);
    await userEvent.click(await screen.findByRole("button", { name: "View Workout" }));
    expect(await screen.findByText(/Deleted workout ·/)).toBeTruthy();
  });

  test("a server error is shown and the list stays", async () => {
    stubFetch({ "athleteId=1": reply({ error: "athlete not found on your team" }, 404), "/team": reply([al]) });
    render(<Team />);
    await userEvent.click(await screen.findByRole("button", { name: "View Workout" }));
    expect((await screen.findByRole("alert")).textContent).toBe("athlete not found on your team");
    expect(screen.getByText("Al")).toBeTruthy();
  });
});

describe("Download Team Log", () => {
  test("fetches every athlete and writes one sheet each", async () => {
    stubFetch({ "athleteId=1": reply([entry]), "athleteId=2": reply([]), "/team": reply([al, bo]) });
    render(<Team />);
    await userEvent.click(await screen.findByRole("button", { name: "Download Team Log" }));
    expect(excel.toFile).toHaveBeenCalledWith("team-workout-log.xlsx");
    const sheets = excel.write.mock.calls[0][0];
    expect(sheets.map((s) => s.sheet)).toEqual(["Al", "Bo"]);
    expect(sheets[0].data).toHaveLength(2);
    expect(sheets[1].data).toHaveLength(1);
  });

  test("one failed athlete stops the download and shows the error", async () => {
    stubFetch({ "athleteId=1": reply([entry]), "athleteId=2": reply({ error: "boom" }, 500), "/team": reply([al, bo]) });
    render(<Team />);
    await userEvent.click(await screen.findByRole("button", { name: "Download Team Log" }));
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
    expect(excel.toFile).not.toHaveBeenCalled();
  });
});
