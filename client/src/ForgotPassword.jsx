import { useState } from "react";

const API_URL = "http://localhost:3000/api/auth";

export default function ForgotPassword({ onSwitchToLogin }) {
  const [email, setEmail] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function post(path, body) {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "request failed");
    }
    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      if (!securityQuestion) {
        const data = await post("/security-question", { email });
        setSecurityQuestion(data.securityQuestion);
      } else {
        await post("/reset-password", { email, securityAnswer, newPassword });
        setDone(true);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  if (done) {
    return (
      <section>
        <h1>Password Reset</h1>
        <p>Your password has been updated.</p>
        <button type="button" onClick={onSwitchToLogin}>
          Log In
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Reset Password</h1>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!!securityQuestion}
          required
        />
      </label>
      {securityQuestion && (
        <>
          <label>
            {securityQuestion}
            <input
              type="text"
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              required
            />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit">{securityQuestion ? "Reset Password" : "Continue"}</button>
      <p>
        <button type="button" onClick={onSwitchToLogin}>
          Back to Log In
        </button>
      </p>
    </form>
  );
}
