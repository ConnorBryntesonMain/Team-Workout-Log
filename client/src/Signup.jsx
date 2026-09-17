import { useState } from "react";

const API_URL = "http://localhost:3000/api/auth";

export default function Signup({ onSignedUp, onSwitchToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const res = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "sign up failed");
      return;
    }
    onSignedUp(data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sign Up</h1>
      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
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
          minLength={8}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Sign Up</button>
      <p>
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin}>
          Log In
        </button>
      </p>
    </form>
  );
}
