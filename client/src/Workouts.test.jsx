// Unit tests for Workouts, downloadLog and LogTable.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Workouts, { LogTable, downloadLog } from "./Workouts.jsx";
import { reply, sentBody, stubFetch } from "./testUtils.js";

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

const coach = { role: "coach", name: "Cy" };
const athlete = { role: "athlete", name: "Al" };
const legs = { id: 1, name: "Legs", exercises: [{ exercise: "Squat", sets: 3, reps: "5" }] };
const set = (exercise, n, reps, weight) => ({ exercise, set: n, reps, weight });
const logEntry = (id, performed_at, exercises, extra = {}) => ({
  id, coach_workout_id: 1, name: "Legs", performed_at, exercises, ...extra,
});

const click = (name) => userEvent.click(screen.getByRole("button", { name }));
const values = (pattern) => screen.getAllByLabelText(pattern).map((input) => input.value);

async function renderAs(user, workouts, routes = {}) {
  const fetch = stubFetch({ ...routes, "/workouts": reply(workouts) });
  render(<Workouts user={user} />);
  await screen.findByRole("heading", { name: "Workouts" });
  return fetch;
}

describe("loading", () => {
  test("shows Loading... first", () => {
    stubFetch({ "/workouts": new Promise(() => {}) });
    render(<Workouts user={coach} />);
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  test("shows the server's error when workouts can't load", async () => {
    stubFetch({ "/workouts": reply({ error: "not logged in" }, 401) });
    render(<Workouts user={coach} />);
    expect((await screen.findByRole("alert")).textContent).toBe("not logged in");
  });

  test("empty states differ for coach and athlete", async () => {
    await renderAs(coach, []);
    expect(screen.getByText("You haven't built any workouts yet.")).toBeTruthy();
    cleanup();
    await renderAs(athlete, [], { "/workouts/log": reply([]) });
    expect(screen.getByText("Your coach hasn't posted any workouts yet.")).toBeTruthy();
  });

  test("lists each workout's exercises", async () => {
    await renderAs(coach, [legs]);
    const row = screen.getByRole("cell", { name: "Squat" }).closest("tr");
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Squat", "3", "5"]);
  });
});

describe("role gating", () => {
  test("a coach can build and edit but not log", async () => {
    await renderAs(coach, [legs]);
    for (const name of ["New Workout", "Edit", "Delete"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log This Workout" })).toBeNull();
    expect(screen.queryByText("My Log")).toBeNull();
  });

  test("an athlete can log but not build or edit", async () => {
    await renderAs(athlete, [legs], { "/workouts/log": reply([]) });
    expect(screen.getByRole("button", { name: "Log This Workout" })).toBeTruthy();
    expect(screen.getByText("My Log")).toBeTruthy();
    for (const name of ["New Workout", "Edit", "Delete"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });
});

describe("coach: building workouts", () => {
  test("New Workout posts the draft and adds it to the list", async () => {
    const created = { id: 2, name: "Arms", exercises: [{ exercise: "Curl", sets: 3, reps: "10" }] };
    const fetch = await renderAs(coach, [], {});
    fetch.mockImplementation(async (url, o) => (o?.method === "POST" ? reply(created, 201) : reply([])));
    await click("New Workout");
    await userEvent.type(screen.getByLabelText("Workout Name"), "Arms");
    await userEvent.type(screen.getByLabelText("Exercise 1 name"), "Curl");
    await userEvent.type(screen.getByLabelText("Exercise 1 reps"), "10");
    await click("Save Workout");
    expect(await screen.findByRole("heading", { name: "Arms" })).toBeTruthy();
    expect(screen.queryByLabelText("Workout Name")).toBeNull();
    expect(sentBody(fetch, "/workouts")).toEqual({
      name: "Arms",
      exercises: [{ exercise: "Curl", sets: 3, reps: "10" }],
    });
  });

  test("Edit puts to the workout's id and replaces it in the list", async () => {
    const fetch = await renderAs(coach, [legs]);
    fetch.mockImplementation(async (url, o) => (o?.method === "PUT" ? reply({ ...legs, name: "Leg Day" }) : reply([])));
    await click("Edit");
    const name = screen.getByLabelText("Workout Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Leg Day");
    await click("Save Workout");
    expect(await screen.findByRole("heading", { name: "Leg Day" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Legs" })).toBeNull();
    expect(sentBody(fetch, "/workouts/1", "PUT").name).toBe("Leg Day");
  });

  test("Add Exercise adds a row; Remove is disabled on the last row", async () => {
    await renderAs(coach, []);
    await click("New Workout");
    expect(screen.getByRole("button", { name: "Remove" }).disabled).toBe(true);
    await click("Add Exercise");
    expect(screen.getAllByLabelText(/Exercise \d name/)).toHaveLength(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(screen.getAllByLabelText(/Exercise \d name/)).toHaveLength(1);
  });

  test("a rejected save shows the server's error and keeps the form", async () => {
    const fetch = await renderAs(coach, []);
    fetch.mockResolvedValue(reply({ error: "name is required" }, 400));
    await click("New Workout");
    await userEvent.type(screen.getByLabelText("Workout Name"), "x");
    await userEvent.type(screen.getByLabelText("Exercise 1 name"), "Curl");
    await userEvent.type(screen.getByLabelText("Exercise 1 reps"), "10");
    await click("Save Workout");
    expect((await screen.findByRole("alert")).textContent).toBe("name is required");
    expect(screen.getByLabelText("Workout Name")).toBeTruthy();
  });

  test("Cancel discards the draft", async () => {
    await renderAs(coach, [legs]);
    await click("Edit");
    await click("Cancel");
    expect(screen.queryByLabelText("Workout Name")).toBeNull();
    expect(screen.getByRole("heading", { name: "Legs" })).toBeTruthy();
  });

  test("Delete asks first and only deletes when confirmed", async () => {
    const fetch = await renderAs(coach, [legs]);
    vi.stubGlobal("confirm", () => false);
    await click("Delete");
    expect(fetch.mock.calls.some(([, o]) => o?.method === "DELETE")).toBe(false);

    vi.stubGlobal("confirm", () => true);
    fetch.mockResolvedValue({ ok: true, status: 204 });
    await click("Delete");
    expect(fetch.mock.calls.some(([url, o]) => url.endsWith("/workouts/1") && o.method === "DELETE")).toBe(true);
    expect(await screen.findByText("You haven't built any workouts yet.")).toBeTruthy();
  });
});

describe("athlete: logging workouts", () => {
  test("with no history, prefills the coach's sets and reps with blank weights", async () => {
    await renderAs(athlete, [legs], { "/workouts/log": reply([]) });
    await click("Log This Workout");
    expect(screen.getByRole("heading", { name: "Log: Legs" })).toBeTruthy();
    expect(values(/Squat set \d reps/)).toEqual(["5", "5", "5"]);
    expect(values(/Squat set \d weight/)).toEqual(["", "", ""]);
  });

  test("prefills from the most recent log of the workout", async () => {
    const log = [
      logEntry(8, "2026-09-01T12:00:00Z", [set("Squat", 1, "5", "200")]),
      logEntry(9, "2026-10-01T12:00:00Z", [set("Squat", 1, "5", "225"), set("Squat", 2, "4", null)]),
    ];
    await renderAs(athlete, [legs], { "/workouts/log": reply(log) });
    await click("Log This Workout");
    expect(values(/Squat set \d reps/)).toEqual(["5", "4"]);
    expect(values(/Squat set \d weight/)).toEqual(["225", ""]);
  });

  test("an exercise missing from the last log falls back to the coach's plan", async () => {
    const workout = { ...legs, exercises: [...legs.exercises, { exercise: "Lunge", sets: 2, reps: "8" }] };
    const log = [logEntry(9, "2026-10-01T12:00:00Z", [set("Squat", 1, "5", "225")])];
    await renderAs(athlete, [workout], { "/workouts/log": reply(log) });
    await click("Log This Workout");
    expect(values(/Lunge set \d reps/)).toEqual(["8", "8"]);
  });

  test("saving posts blank weight as null and numbers as numbers, then reloads the log", async () => {
    const fetch = await renderAs(athlete, [legs], { "/workouts/log": reply([]) });
    await click("Log This Workout");
    const weights = screen.getAllByLabelText(/Squat set \d weight/);
    await userEvent.type(weights[0], "135");
    await userEvent.type(weights[1], "137.5");
    fetch.mockImplementation(async (url, o) => (o?.method === "POST" ? reply({ id: 5 }, 201) : reply([])));
    await click("Save Log");
    expect(await screen.findByText("My Log")).toBeTruthy();
    expect(sentBody(fetch, "/workouts/log")).toEqual({
      coachWorkoutId: 1,
      exercises: [{
        exercise: "Squat",
        sets: [{ reps: "5", weight: 135 }, { reps: "5", weight: 137.5 }, { reps: "5", weight: null }],
      }],
    });
    const logLoads = fetch.mock.calls.filter(([url, o]) => url.endsWith("/workouts/log") && !o?.method);
    expect(logLoads).toHaveLength(2);
  });

  test("a rejected log shows the server's error and keeps the form", async () => {
    const fetch = await renderAs(athlete, [legs], { "/workouts/log": reply([]) });
    await click("Log This Workout");
    fetch.mockResolvedValue(reply({ error: "weight must be under 10000" }, 400));
    await click("Save Log");
    expect((await screen.findByRole("alert")).textContent).toBe("weight must be under 10000");
    expect(screen.getByRole("button", { name: "Save Log" })).toBeTruthy();
  });

  test("Add Set copies the last set; Remove is disabled on the last set", async () => {
    await renderAs(athlete, [{ ...legs, exercises: [{ exercise: "Squat", sets: 1, reps: "5" }] }], { "/workouts/log": reply([]) });
    await click("Log This Workout");
    expect(screen.getByRole("button", { name: "Remove" }).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Squat set 1 weight"), "100");
    await click("Add Set");
    expect(values(/Squat set \d weight/)).toEqual(["100", "100"]);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(values(/Squat set \d weight/)).toEqual(["100"]);
  });

  test("Cancel closes the log form", async () => {
    await renderAs(athlete, [legs], { "/workouts/log": reply([]) });
    await click("Log This Workout");
    await click("Cancel");
    expect(screen.queryByRole("button", { name: "Save Log" })).toBeNull();
    expect(screen.getByRole("button", { name: "Log This Workout" })).toBeTruthy();
  });
});

describe("athlete: My Log", () => {
  const entry = logEntry(9, "2026-10-01T12:00:00Z", [set("Squat", 1, "5", "225"), set("Squat", 2, "5", "225"), set("Lunge", 1, "8", null)]);

  test("shows each entry with its date, or Deleted workout when the workout is gone", async () => {
    await renderAs(athlete, [], { "/workouts/log": reply([entry, { ...entry, id: 10, name: null }]) });
    const date = new Date(entry.performed_at).toLocaleDateString();
    expect(screen.getByRole("heading", { name: `Legs · ${date}` })).toBeTruthy();
    expect(screen.getByRole("heading", { name: `Deleted workout · ${date}` })).toBeTruthy();
  });

  test("an empty log disables Download", async () => {
    await renderAs(athlete, [], { "/workouts/log": reply([]) });
    expect(screen.getByText("You haven't logged any workouts yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download Log" }).disabled).toBe(true);
  });

  test("Edit groups the sets by exercise and saves with PUT", async () => {
    const fetch = await renderAs(athlete, [], { "/workouts/log": reply([entry]) });
    await click("Edit");
    expect(screen.getByRole("heading", { name: "Edit Log: Legs" })).toBeTruthy();
    expect(values(/Squat set \d weight/)).toEqual(["225", "225"]);
    expect(values(/Lunge set \d weight/)).toEqual([""]);
    fetch.mockImplementation(async (url, o) => (o?.method === "PUT" ? reply({ success: true }) : reply([])));
    await click("Save Log");
    await screen.findByText("My Log");
    expect(sentBody(fetch, "/workouts/log/9", "PUT")).toEqual({
      coachWorkoutId: 1,
      exercises: [
        { exercise: "Squat", sets: [{ reps: "5", weight: 225 }, { reps: "5", weight: 225 }] },
        { exercise: "Lunge", sets: [{ reps: "8", weight: null }] },
      ],
    });
  });

  test("Delete removes the entry after confirming", async () => {
    vi.stubGlobal("confirm", () => true);
    const fetch = await renderAs(athlete, [], { "/workouts/log": reply([entry]) });
    fetch.mockResolvedValue({ ok: true, status: 204 });
    await click("Delete");
    expect(await screen.findByText("You haven't logged any workouts yet.")).toBeTruthy();
    expect(fetch.mock.calls.some(([url, o]) => url.endsWith("/workouts/log/9") && o.method === "DELETE")).toBe(true);
  });

  test("a failed delete keeps the entry and shows an error", async () => {
    vi.stubGlobal("confirm", () => true);
    const fetch = await renderAs(athlete, [], { "/workouts/log": reply([entry]) });
    fetch.mockResolvedValue({ ok: false, status: 404 });
    await click("Delete");
    expect((await screen.findByRole("alert")).textContent).toBe("could not delete log");
    expect(screen.getByRole("heading", { name: /Legs ·/ })).toBeTruthy();
  });

  test("Download writes the athlete's log to my-workout-log.xlsx", async () => {
    await renderAs(athlete, [], { "/workouts/log": reply([entry]) });
    await click("Download Log");
    expect(excel.toFile).toHaveBeenCalledWith("my-workout-log.xlsx");
    expect(excel.write.mock.calls[0][0][0].sheet).toBe("Al");
  });
});

describe("downloadLog", () => {
  const sheetNames = (names) => {
    downloadLog("x.xlsx", names.map((name) => ({ name, entries: [] })));
    return excel.write.mock.calls.at(-1)[0].map((s) => s.sheet);
  };

  test("strips characters Excel forbids and falls back to Athlete", () => {
    expect(sheetNames(["a[b]:c*d?e/f\\g", "  ", "[]"])).toEqual(["abcdefg", "Athlete", "Athlete 2"]);
  });

  test("cuts names to 28 characters so a suffix still fits in 31", () => {
    const [name] = sheetNames(["x".repeat(40)]);
    expect(name).toBe("x".repeat(28));
  });

  test("numbers duplicate names, ignoring case", () => {
    expect(sheetNames(["Al", "al", "AL"])).toEqual(["Al", "al 2", "AL 3"]);
  });

  test("writes a bold header and one row per set", () => {
    const performed_at = "2026-10-01T12:00:00Z";
    downloadLog("x.xlsx", [{
      name: "Al",
      entries: [
        { name: "Legs", performed_at, exercises: [set("Squat", 1, "5", "225.50"), set("Squat", 2, "5", null)] },
        { name: null, performed_at, exercises: [set("Curl", 1, "10", "30")] },
      ],
    }]);
    const [{ data, stickyRowsCount }] = excel.write.mock.calls[0][0];
    const date = new Date(performed_at).toLocaleDateString();
    expect(stickyRowsCount).toBe(1);
    expect(data[0].map((c) => c.value)).toEqual(["Date", "Workout", "Exercise", "Set", "Reps", "Weight (lbs)"]);
    expect(data[0].every((c) => c.fontWeight === "bold")).toBe(true);
    expect(data.slice(1)).toEqual([
      [date, "Legs", "Squat", 1, "5", 225.5],
      [date, "Legs", "Squat", 2, "5", "Bodyweight"],
      [date, "Deleted workout", "Curl", 1, "10", 30],
    ]);
    expect(excel.toFile).toHaveBeenCalledWith("x.xlsx");
  });
});

describe("LogTable", () => {
  test("names the exercise only on its first set and shows Bodyweight for no weight", () => {
    render(<LogTable sets={[set("Squat", 1, "5", "225"), set("Squat", 2, "5", null)]} />);
    const rows = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(rows).toEqual([
      ["Squat", "1", "5", "225"],
      ["", "2", "5", "Bodyweight"],
    ]);
  });
});
