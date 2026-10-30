import { useEffect, useState } from "react";

const API_URL = "http://localhost:3000/api/auth";

export default function Profile({ onLoggedOut }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [teamError, setTeamError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/me`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "could not load profile");
        }

        setUser(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleLogout() {
    // Log out locally even if the server can't be reached.
    await fetch(`${API_URL}/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});

    onLoggedOut();
  }

  async function handleJoinTeam() {
    setTeamError("");

    let res, data;
    try {
      res = await fetch(`${API_URL}/join-team`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          coachCode: teamCode,
        }),
      });
      data = await res.json();
    } catch {
      setTeamError("could not reach the server");
      return;
    }

    if (!res.ok) {
      setTeamError(data.error || "team code does not exist");
      return;
    }

    setUser({
      ...user,
      athleteCode: data.athleteCode,
    });
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordMessage("");

    let res, data;
    try {
      res = await fetch(`${API_URL}/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      data = await res.json();
    } catch {
      setPasswordMessage("could not reach the server");
      return;
    }

    if (!res.ok) {
      setPasswordMessage(data.error || "could not change password");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setShowPassword(false);
    setPasswordMessage("Password updated");
  }

  async function handleLeaveTeam() {
    setTeamError("");

    let res;
    try {
      res = await fetch(`${API_URL}/leave-team`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      setTeamError("could not reach the server");
      return;
    }

    if (!res.ok) {
      setTeamError("could not leave team");
      return;
    }

    setUser({
      ...user,
      athleteCode: null,
      coachName: null,
    });
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!user) {
    return <p>Loading...</p>;
  }

  return (
    <section id="center">
      <h1>Profile</h1>

      {user.role === "coach" && (
        <p
          style={{
            textAlign: "center",
            fontWeight: "bold",
            fontSize: "1.25rem",
            marginBottom: "1rem",
          }}
        >
          Coach Code: {user.coachCode}
        </p>
      )}

      {user.role === "athlete" &&
        (user.athleteCode ? (
          <div
            style={{
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            <p
              style={{
                fontWeight: "bold",
                fontSize: "1.25rem",
                margin: 0,
              }}
            >
              Team Code: {user.athleteCode}
            </p>

            {user.coachName && (
              <p
                style={{
                  marginTop: "0.5rem",
                }}
              >
                Coach Name: {user.coachName}
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            <label>
              Enter Team Code:
              <input
                type="text"
                maxLength="6"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                style={{ marginLeft: "8px" }}
              />
            </label>

            <button
              type="button"
              onClick={handleJoinTeam}
              style={{ marginLeft: "8px" }}
            >
              Join
            </button>

            {teamError && (
              <p
                role="alert"
                style={{
                  color: "red",
                  marginTop: "8px",
                }}
              >
                {teamError}
              </p>
            )}
          </div>
        ))}

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

      {user.role === "athlete" && user.athleteCode && (
  <>
    <button
      type="button"
      onClick={handleLeaveTeam}
      style={{
        display: "block",
        width: "120px",
        margin: "0 auto 10px auto",
        backgroundColor: "#dc3545",
        color: "white",
        border: "none",
        borderRadius: "4px",
        padding: "8px 16px",
        cursor: "pointer",
      }}
      >
      Leave Team
    </button>
    {teamError && (
      <p role="alert" style={{ textAlign: "center", color: "red" }}>
        {teamError}
      </p>
    )}
    </>
    )}

    {showPassword ? (
      <form onSubmit={handleChangePassword} style={{ marginBottom: "10px" }}>
        <label>
          Current Password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
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
        <button type="submit">Save Password</button>
        <button type="button" onClick={() => setShowPassword(false)}>
          Cancel
        </button>
      </form>
    ) : (
      <button
        type="button"
        onClick={() => setShowPassword(true)}
        style={{
          display: "block",
          width: "180px",
          margin: "0 auto 10px auto",
        }}
      >
        Reset Password
      </button>
    )}

    {passwordMessage && (
      <p role="alert" style={{ textAlign: "center" }}>
        {passwordMessage}
      </p>
    )}

    <button
      type="button"
      onClick={handleLogout}
      style={{
        display: "block",
        width: "120px",
        margin: "0 auto",
      }}
      >
      Log Out
    </button>

    </section>
  );
}