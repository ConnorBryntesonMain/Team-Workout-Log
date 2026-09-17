import { useState } from "react";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("login");

  if (user) {
    return (
      <p>
        Logged in as {user.name} ({user.email}) — {user.role}
      </p>
    );
  }

  return mode === "login" ? (
    <Login onLoggedIn={setUser} onSwitchToSignup={() => setMode("signup")} />
  ) : (
    <Signup onSignedUp={setUser} onSwitchToLogin={() => setMode("login")} />
  );
}
