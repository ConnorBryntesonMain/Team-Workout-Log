import { Fragment, useEffect, useState } from "react";
import { BASE_WORKOUT, WorkoutTable } from "./Workouts.jsx";

const API_URL = "http://localhost:3000/api/auth";

export default function Team() {
  const [athletes, setAthletes] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

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

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!athletes) {
    return <p>Loading...</p>;
  }

  return (
    <section id="center">
      <h1>My Team</h1>
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
                      onClick={() => setOpenId(openId === a.id ? null : a.id)}
                    >
                      {openId === a.id ? "Hide Workout" : "View Workout"}
                    </button>
                  </td>
                </tr>
                {openId === a.id && (
                  <tr>
                    <td colSpan="3">
                      {/* ponytail: every athlete shares BASE_WORKOUT; fetch per-athlete workouts once they're stored in the DB */}
                      <WorkoutTable rows={BASE_WORKOUT} />
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
