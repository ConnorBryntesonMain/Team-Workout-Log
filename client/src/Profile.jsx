import { useEffect, useState } from "react";

const API_URL = "http://localhost:3000/api/auth";

export default function Profile({ onLoggedOut }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/me`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "could not load profile");
        setUser(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleLogout() {
    await fetch(`${API_URL}/logout`, { method: "POST", credentials: "include" });
    onLoggedOut();
  }

  if (error) return <p role="alert">{error}</p>;
  if (!user) return <p>Loading…</p>;

  return (
    <section id="center">
      <h1>Profile</h1>
      <dl>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
        <dt>Member since</dt>
        <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
      </dl>
      <button type="button" onClick={handleLogout}>
        Log Out
      </button>
    </section>
  );
}
