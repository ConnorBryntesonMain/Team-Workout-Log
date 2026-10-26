import { useEffect, useState } from "react";
import writeExcelFile from "write-excel-file/browser";
import "./App.css";

const API_URL = "http://localhost:3000/api/workouts";

const EMPTY_ROW = { exercise: "", sets: 3, reps: "" };

export default function Workouts({ user }) {
  const [workouts, setWorkouts] = useState(null);
  const [error, setError] = useState("");
  // null = not editing; { id?, name, exercises } = the workout being built or edited
  const [draft, setDraft] = useState(null);
  // athletes only: the workout being logged, and what they've logged before
  const [logDraft, setLogDraft] = useState(null);
  const [log, setLog] = useState([]);
  const isCoach = user.role === "coach";
  const showWorkoutList = !draft && !logDraft;
  const [editingLog, setEditingLog] = useState(null);

  useEffect(() => {
    fetch(API_URL, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "could not load workouts");
        }

        setWorkouts(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!isCoach) {
      loadLog();
    }
  }, [isCoach]);

  async function loadLog() {
    const res = await fetch(`${API_URL}/log`, { credentials: "include" });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "could not load your log");
      return;
    }

    setLog(data);
  }

  function startLog(w) {
    const previousLog = log
      .filter((entry) => entry.name === w.name)
      .sort(
        (a, b) => new Date(b.performed_at) - new Date(a.performed_at)
      )[0];

    setLogDraft({
      coachWorkoutId: w.id,
      name: w.name,
      exercises: w.exercises.map((exercise) => {
        const previousSets = previousLog?.exercises?.filter(
          (set) => set.exercise === exercise.exercise
        );

        return {
          exercise: exercise.exercise,

          sets:
            previousSets?.length > 0
              ? previousSets.map((set) => ({
                  reps: set.reps,
                  weight: set.weight ?? "",
                }))
              : Array.from({ length: exercise.sets }, () => ({
                  reps: exercise.reps,
                  weight: "",
                })),
        };
      }),
    });
  }

  function startLogEdit(entry) {
    const grouped = {};

    entry.exercises.forEach((set) => {
      if (!grouped[set.exercise]) {
        grouped[set.exercise] = [];
      }

      grouped[set.exercise].push({
        reps: set.reps,
        weight: set.weight ?? "",
      });
    });

    setEditingLog(entry.id);

    setLogDraft({
      coachWorkoutId: entry.coach_workout_id,
      name: entry.name,
      exercises: Object.entries(grouped).map(([exercise, sets]) => ({
        exercise,
        sets,
      })),
    });
  }


  async function handleLogSave(e) {
    e.preventDefault();
    setError("");

    const url = editingLog
      ? `${API_URL}/log/${editingLog}`
      : `${API_URL}/log`;

    const method = editingLog
      ? "PUT"
      : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        coachWorkoutId: logDraft.coachWorkoutId,
        exercises: logDraft.exercises.map((row) => ({
          exercise: row.exercise,
          sets: row.sets.map((set) => ({
            reps: set.reps,
            weight: set.weight === "" ? null : Number(set.weight),
          })),
        })),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "could not save log");
      return;
    }

    setEditingLog(null);
    setLogDraft(null);

    loadLog();
  }

  // Replace exercise i's sets with whatever change(sets) returns.
  function updateLogSets(i, change) {
    setLogDraft({
      ...logDraft,
      exercises: logDraft.exercises.map((row, j) =>
        j === i ? { ...row, sets: change(row.sets) } : row
      ),
    });
  }

  function updateSet(i, setIndex, field, value) {
    updateLogSets(i, (sets) =>
      sets.map((set, k) => (k === setIndex ? { ...set, [field]: value } : set))
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");

    const res = await fetch(draft.id ? `${API_URL}/${draft.id}` : API_URL, {
      method: draft.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: draft.name, exercises: draft.exercises }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "could not save workout");
      return;
    }

    setWorkouts(
      draft.id
        ? workouts.map((w) => (w.id === data.id ? data : w))
        : [...workouts, data]
    );
    setDraft(null);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this workout?")) {
      return;
    }

    setError("");
    const res = await fetch(`${API_URL}/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      setError("could not delete workout");
      return;
    }

    setWorkouts(workouts.filter((w) => w.id !== id));
  }

  async function handleDeleteLog(id) {
    if (!confirm("Delete this log entry?")) {
      return;
    }

    setError("");

    const res = await fetch(`${API_URL}/log/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      setError("could not delete log");
      return;
    }

    setLog(log.filter((entry) => entry.id !== id));
  }

  function updateRow(i, field, value) {
    setDraft({
      ...draft,
      exercises: draft.exercises.map((row, j) =>
        j === i ? { ...row, [field]: value } : row
      ),
    });
  }

  if (!workouts) {
    return error ? <p role="alert">{error}</p> : <p>Loading...</p>;
  }

  return (
    <section id="center">
      <h1>Workouts</h1>
      {error && <p role="alert">{error}</p>}

      {isCoach && draft && (
        <form onSubmit={handleSave}>
          <h2>{draft.id ? "Edit Workout" : "New Workout"}</h2>
          <label>
            Workout Name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              maxLength={100}
              required
            />
          </label>
          <table>
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Sets</th>
                <th>Reps</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {draft.exercises.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      aria-label={`Exercise ${i + 1} name`}
                      value={row.exercise}
                      onChange={(e) => updateRow(i, "exercise", e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Exercise ${i + 1} sets`}
                      type="number"
                      min="1"
                      value={row.sets}
                      onChange={(e) => updateRow(i, "sets", Number(e.target.value))}
                      required
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Exercise ${i + 1} reps`}
                      value={row.reps}
                      onChange={(e) => updateRow(i, "reps", e.target.value)}
                      placeholder="8 or 30 sec"
                      required
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={draft.exercises.length === 1}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          exercises: draft.exercises.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() =>
              setDraft({ ...draft, exercises: [...draft.exercises, EMPTY_ROW] })
            }
          >
            Add Exercise
          </button>
          <button type="submit">Save Workout</button>
          <button type="button" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </form>
      )}

      {logDraft && (
        <form onSubmit={handleLogSave}>
          <h2>
            {editingLog ? "Edit Log" : "Log"}: {logDraft.name}
          </h2>
          <p>Enter the reps and weight for each set. Leave weight blank for bodyweight.</p>
          {logDraft.exercises.map((row, i) => (
            <fieldset key={i}>
              <legend>{row.exercise}</legend>
              <table>
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>Reps</th>
                    <th>Weight (lbs)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {row.sets.map((set, k) => (
                    <tr key={k}>
                      <td>{k + 1}</td>
                      <td>
                        <input
                          aria-label={`${row.exercise} set ${k + 1} reps`}
                          value={set.reps}
                          onChange={(e) => updateSet(i, k, "reps", e.target.value)}
                          maxLength={20}
                          required
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${row.exercise} set ${k + 1} weight`}
                          type="number"
                          min="0"
                          max="9999"
                          step="any"
                          value={set.weight}
                          onChange={(e) => updateSet(i, k, "weight", e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={row.sets.length === 1}
                          onClick={() => updateLogSets(i, (sets) => sets.filter((_, j) => j !== k))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => updateLogSets(i, (sets) => [...sets, { ...sets[sets.length - 1] }])}
              >
                Add Set
              </button>
            </fieldset>
          ))}
          <button type="submit">Save Log</button>
          <button
            type="button"
            onClick={() => {
              setLogDraft(null);
              setEditingLog(null);
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {showWorkoutList &&(
        workouts.length === 0 ? (
          <p>
            {isCoach
              ? "You haven't built any workouts yet."
              : "Your coach hasn't posted any workouts yet."}
          </p>
        ) : (
          workouts.map((w) => (
            <div key={w.id}>
              <h2>{w.name}</h2>
              <WorkoutTable rows={w.exercises} />
              {!isCoach && !logDraft && (
                <button type="button" onClick={() => startLog(w)}>
                  Log This Workout
                </button>
                
              )}
              {isCoach && (
                <>
                  <button type="button" onClick={() => setDraft(w)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(w.id)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          ))
        )
      )}

      {isCoach && !draft && (
        <button
          type="button"
          className="new-workout-btn"
          onClick={() => setDraft({ name: "", exercises: [EMPTY_ROW] })}
        >
          New Workout
        </button>
      )}

      {!isCoach && !logDraft &&(
        <>
          <details>
            <summary>My Log</summary>
            <button
              type="button"
              disabled={log.length === 0}
              onClick={() => downloadLog("my-workout-log.xlsx", [{ name: user.name, entries: log }])}
            >
              Download Log
            </button>
            {log.length === 0 ? (
              <p>You haven't logged any workouts yet.</p>
            ) : (
              log.map((entry) => (
                <div key={entry.id}>
                  <h3>
                    {entry.name || "Deleted workout"} ·{" "}
                    {new Date(entry.performed_at).toLocaleDateString()}
                  </h3>

                  <LogTable sets={entry.exercises} />

                  <button
                    type="button"
                    onClick={() => startLogEdit(entry)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteLog(entry.id)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </details>
        </>
      )}
    </section>
  );
}

const LOG_HEADER = ["Date", "Workout", "Exercise", "Set", "Reps", "Weight (lbs)"];

// Downloads an .xlsx with one sheet per { name, entries }, entries as returned by GET /log.
export function downloadLog(fileName, sheets) {
  const used = new Set();

  return writeExcelFile(
    sheets.map(({ name, entries }) => {
      // Excel sheet names: max 31 chars, no []:*?/\, unique (case-insensitive).
      const base = (name.replace(/[[\]:*?/\\]/g, "").trim() || "Athlete").slice(0, 28);
      let sheet = base;

      for (let i = 2; used.has(sheet.toLowerCase()); i++) {
        sheet = `${base} ${i}`;
      }

      used.add(sheet.toLowerCase());

      return {
        sheet,
        stickyRowsCount: 1,
        data: [
          LOG_HEADER.map((value) => ({ value, fontWeight: "bold" })),
          ...entries.flatMap((entry) =>
            entry.exercises.map((s) => [
              new Date(entry.performed_at).toLocaleDateString(),
              entry.name || "Deleted workout",
              s.exercise,
              s.set,
              s.reps,
              s.weight == null ? "Bodyweight" : Number(s.weight),
            ])
          ),
        ],
      };
    })
  ).toFile(fileName);
}

export function WorkoutTable({ rows }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Exercise</th>
          <th>Sets</th>
          <th>Reps</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.exercise}</td>
            <td>{row.sets}</td>
            <td>{row.reps}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A logged workout, one row per set; the exercise name shows on its first set.
export function LogTable({ sets }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Exercise</th>
          <th>Set</th>
          <th>Reps</th>
          <th>Weight (lbs)</th>
        </tr>
      </thead>
      <tbody>
        {sets.map((row, i) => (
          <tr key={i}>
            <td>{row.set === 1 ? row.exercise : ""}</td>
            <td>{row.set}</td>
            <td>{row.reps}</td>
            <td>{row.weight ?? "Bodyweight"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
