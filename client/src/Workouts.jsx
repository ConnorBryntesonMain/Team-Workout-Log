import { useEffect, useState } from "react";

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
    setLogDraft({
      coachWorkoutId: w.id,
      name: w.name,
      // one row per planned set, prefilled with the coach's target reps
      exercises: w.exercises.map((e) => ({
        exercise: e.exercise,
        sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: "" })),
      })),
    });
  }

  async function handleLogSave(e) {
    e.preventDefault();
    setError("");

    const res = await fetch(`${API_URL}/log`, {
      method: "POST",
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
      setError(data.error || "could not log workout");
      return;
    }

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
          <h2>Log: {logDraft.name}</h2>
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
          <button type="button" onClick={() => setLogDraft(null)}>
            Cancel
          </button>
        </form>
      )}

      {isCoach && !draft && (
        <button
          type="button"
          onClick={() => setDraft({ name: "", exercises: [EMPTY_ROW] })}
        >
          New Workout
        </button>
      )}

      {workouts.length === 0 ? (
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
      )}

      {!isCoach && (
        <>
          <h2>My Log</h2>
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
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
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
