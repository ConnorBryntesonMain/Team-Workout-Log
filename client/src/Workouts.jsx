// ponytail: hard-coded base workout shared by every athlete; move to the DB when coaches can create workouts
export const BASE_WORKOUT = [
  { exercise: "Back Squat", sets: 3, reps: "8" },
  { exercise: "Bench Press", sets: 3, reps: "8" },
  { exercise: "Deadlift", sets: 3, reps: "5" },
  { exercise: "Pull-Ups", sets: 3, reps: "10" },
  { exercise: "Plank", sets: 3, reps: "30 sec" },
];

export default function Workouts() {
  return (
    <section id="center">
      <h1>Workouts</h1>
      <h2>Base Workout</h2>
      <WorkoutTable rows={BASE_WORKOUT} />
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
        {rows.map((row) => (
          <tr key={row.exercise}>
            <td>{row.exercise}</td>
            <td>{row.sets}</td>
            <td>{row.reps}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
