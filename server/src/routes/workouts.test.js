import assert from "node:assert";
import { validateLog, validateWorkout } from "./workouts.js";

const ok = { name: "Leg Day", exercises: [{ exercise: "Squat", sets: 3, reps: "8" }] };
assert.equal(validateWorkout(ok), null);
assert.ok(validateWorkout({ ...ok, name: " " }));
assert.ok(validateWorkout({ ...ok, exercises: [] }));
assert.ok(validateWorkout({ ...ok, exercises: [{ exercise: "Squat", sets: 0, reps: "8" }] }));
assert.ok(validateWorkout({ ...ok, exercises: [{ exercise: "Squat", sets: 3, reps: "" }] }));
assert.ok(validateWorkout({ ...ok, exercises: [null] }));
console.log("validateWorkout ok");

const set = { reps: "8", weight: 225 };
const log = { exercises: [{ exercise: "Squat", sets: [set, { reps: "6", weight: 245 }] }] };
assert.equal(validateLog(log), null);
assert.equal(validateLog({ exercises: [{ exercise: "Plank", sets: [{ reps: "30 sec", weight: null }] }] }), null);
assert.ok(validateLog({ exercises: [{ exercise: "Squat", sets: [] }] }));
assert.ok(validateLog({ exercises: [{ exercise: "Squat", sets: 3 }] }));
assert.ok(validateLog({ exercises: [{ exercise: "Squat", sets: [{ ...set, reps: "" }] }] }));
assert.ok(validateLog({ exercises: [{ exercise: "Squat", sets: [{ ...set, weight: -5 }] }] }));
assert.ok(validateLog({ exercises: [{ exercise: "Squat", sets: [{ ...set, weight: 10000 }] }] }));
assert.ok(validateLog({ exercises: [{ exercise: "Squat", sets: [{ ...set, weight: "heavy" }] }] }));
assert.ok(validateLog({ exercises: [{ exercise: "Squat", sets: [null] }] }));
console.log("validateLog ok");
