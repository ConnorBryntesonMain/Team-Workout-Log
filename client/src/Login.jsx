import { useState } from "react";
import "./App.css";

const API_URL = "http://localhost:3000/api/auth";

export default function Login({ onLoggedIn, onSwitchToSignup, onForgotPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    let res, data;
    try {
      res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      data = await res.json();
    } catch {
      setError("could not reach the server");
      return;
    }

    if (!res.ok) {
      setError(data.error || "login failed");
      return;
    }
    onLoggedIn(data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Log In</h1>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Log In</button>
      <p>
        <button type="button" onClick={onForgotPassword}>
          Forgot password?
        </button>
      </p>
      <p>
        Need an account?{" "}
        <button type="button" onClick={onSwitchToSignup}>
          Sign Up
        </button>
      </p>
    </form>
  );
}
