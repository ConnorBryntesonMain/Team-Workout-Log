import { useState } from "react";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Profile from "./Profile.jsx";
import Workouts from "./Workouts.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("login");
  const [page, setPage] = useState("profile");

  if (user) {
    return (
      <>
        <nav>
          <button type="button" onClick={() => setPage("profile")} aria-current={page === "profile" ? "page" : undefined}>
            Profile
          </button>
          <button type="button" onClick={() => setPage("workouts")} aria-current={page === "workouts" ? "page" : undefined}>
            Workouts
          </button>
        </nav>
        {page === "profile" ? 
        <Profile
          onLoggedOut={() => {
            setUser(null);
            setMode("login");
          }}
        /> : <Workouts />}
        </>
      );
  }

  return mode === "login" ? (
    <Login onLoggedIn={setUser} onSwitchToSignup={() => setMode("signup")} />
  ) : (
    <Signup onSignedUp={setUser} onSwitchToLogin={() => setMode("login")} />
  );
}
