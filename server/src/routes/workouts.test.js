import assert from "node:assert";
import { validateWorkout } from "./workouts.js";

const ok = { name: "Leg Day", exercises: [{ exercise: "Squat", sets: 3, reps: "8" }] };
assert.equal(validateWorkout(ok), null);
assert.ok(validateWorkout({ ...ok, name: " " }));
assert.ok(validateWorkout({ ...ok, exercises: [] }));
assert.ok(validateWorkout({ ...ok, exercises: [{ exercise: "Squat", sets: 0, reps: "8" }] }));
assert.ok(validateWorkout({ ...ok, exercises: [{ exercise: "Squat", sets: 3, reps: "" }] }));
assert.ok(validateWorkout({ ...ok, exercises: [null] }));
console.log("validateWorkout ok");
