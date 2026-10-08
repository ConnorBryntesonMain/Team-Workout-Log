import { Fragment, useEffect, useState } from "react";
import { LogTable } from "./Workouts.jsx";

const API_URL = "http://localhost:3000/api/auth";
const WORKOUTS_URL = "http://localhost:3000/api/workouts";

export default function Team() {
  const [athletes, setAthletes] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  // { athleteId, entries } for the open athlete; null while loading
  const [log, setLog] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/team`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "could not load team");
        }

        setAthletes(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function toggleAthlete(id) {
    if (openId === id) {
      setOpenId(null);
      return;
    }

    setOpenId(id);
    setLog(null);
    setError("");

    // Refetch on every open so the coach sees the athlete's latest logs.
    const res = await fetch(`${WORKOUTS_URL}/log?athleteId=${id}`, { credentials: "include" });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "could not load workouts");
      return;
    }

    setLog({ athleteId: id, entries: data });
  }

  if (error && !athletes) {
    return <p role="alert">{error}</p>;
  }

  if (!athletes) {
    return <p>Loading...</p>;
  }

  return (
    <section id="center">
      <h1>My Team</h1>
      {error && <p role="alert">{error}</p>}
      {athletes.length === 0 ? (
        <p>No athletes yet. Share your coach code so they can join.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => (
              <Fragment key={a.id}>
                <tr>
                  <td>{a.name}</td>
                  <td>{a.email}</td>
                  <td>
                    <button
                      type="button"
                      aria-expanded={openId === a.id}
                      onClick={() => toggleAthlete(a.id)}
                    >
                      {openId === a.id ? "Hide Workout" : "View Workout"}
                    </button>
                  </td>
                </tr>
                {openId === a.id && (
                  <tr>
                    <td colSpan="3">
                      {log?.athleteId !== a.id ? (
                        <p>Loading...</p>
                      ) : log.entries.length === 0 ? (
                        <p>{a.name} hasn't logged any workouts yet.</p>
                      ) : (
                        log.entries.map((entry) => (
                          <div key={entry.id}>
                            <h3>
                              {entry.name || "Deleted workout"} ·{" "}
                              {new Date(entry.performed_at).toLocaleDateString()}
                            </h3>
                            <LogTable sets={entry.exercises} />
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
