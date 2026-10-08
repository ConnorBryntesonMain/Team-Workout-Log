import { useEffect, useState } from "react";

const API_URL = "http://localhost:3000/api/workouts";

// ponytail: hard-coded base workout shared by every athlete; Team.jsx still shows it until logged workouts are wired up
export const BASE_WORKOUT = [
  { exercise: "Back Squat", sets: 3, reps: "8" },
  { exercise: "Bench Press", sets: 3, reps: "8" },
  { exercise: "Deadlift", sets: 3, reps: "5" },
  { exercise: "Pull-Ups", sets: 3, reps: "10" },
  { exercise: "Plank", sets: 3, reps: "30 sec" },
];

const EMPTY_ROW = { exercise: "", sets: 3, reps: "" };

export default function Workouts({ user }) {
  const [workouts, setWorkouts] = useState(null);
  const [error, setError] = useState("");
  // null = not editing; { id?, name, exercises } = the workout being built or edited
  const [draft, setDraft] = useState(null);

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

  const isCoach = user.role === "coach";

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
