// Unit tests for Profile.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Profile from "./Profile.jsx";
import { reply, sentBody, stubFetch } from "./testUtils.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const athlete = { name: "Al", email: "a@b.com", role: "athlete", created_at: "2026-01-01T12:00:00Z", athleteCode: null };
const coach = { name: "Cy", email: "c@b.com", role: "coach", created_at: "2026-01-01T12:00:00Z", coachCode: "123456" };
const click = (name) => userEvent.click(screen.getByRole("button", { name }));

function renderAs(me, routes = {}) {
  const fetch = stubFetch({ "/me": reply(me), ...routes });
  const onLoggedOut = vi.fn();
  render(<Profile onLoggedOut={onLoggedOut} />);
  return { fetch, onLoggedOut };
}

describe("loading", () => {
  test("shows Loading... then the user's details", async () => {
    renderAs(athlete);
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(await screen.findByText("Al")).toBeTruthy();
    expect(screen.getByText("a@b.com")).toBeTruthy();
    expect(screen.getByText("athlete")).toBeTruthy();
    expect(screen.getByText(new Date(athlete.created_at).toLocaleDateString())).toBeTruthy();
  });

  test("shows the server's error when the profile can't load", async () => {
    stubFetch({ "/me": reply({ error: "not logged in" }, 401) });
    render(<Profile />);
    expect((await screen.findByRole("alert")).textContent).toBe("not logged in");
  });
});

describe("team code", () => {
  test("a coach sees their coach code and no join box", async () => {
    renderAs(coach);
    expect(await screen.findByText("Coach Code: 123456")).toBeTruthy();
    expect(screen.queryByLabelText("Enter Team Code:")).toBeNull();
  });

  test("an athlete on a team sees the team code and coach name", async () => {
    renderAs({ ...athlete, athleteCode: "123456", coachName: "Cy" });
    expect(await screen.findByText("Team Code: 123456")).toBeTruthy();
    expect(screen.getByText("Coach Name: Cy")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave Team" })).toBeTruthy();
  });

  test("joining a team posts the code and shows it", async () => {
    const { fetch } = renderAs(athlete, { "/join-team": reply({ athleteCode: "123456" }) });
    await userEvent.type(await screen.findByLabelText("Enter Team Code:"), "123456");
    await click("Join");
    expect(await screen.findByText("Team Code: 123456")).toBeTruthy();
    expect(sentBody(fetch, "/join-team")).toEqual({ coachCode: "123456" });
  });

  test("an unknown code shows the server's error", async () => {
    renderAs(athlete, { "/join-team": reply({ error: "team code does not exist" }, 404) });
    await userEvent.type(await screen.findByLabelText("Enter Team Code:"), "999999");
    await click("Join");
    expect((await screen.findByRole("alert")).textContent).toBe("team code does not exist");
  });

  test("leaving a team brings back the join box", async () => {
    renderAs({ ...athlete, athleteCode: "123456", coachName: "Cy" }, { "/leave-team": reply({ success: true }) });
    await userEvent.click(await screen.findByRole("button", { name: "Leave Team" }));
    expect(await screen.findByLabelText("Enter Team Code:")).toBeTruthy();
  });

  test("a failed leave keeps the team and shows an error", async () => {
    renderAs({ ...athlete, athleteCode: "123456" }, { "/leave-team": reply({}, 500) });
    await userEvent.click(await screen.findByRole("button", { name: "Leave Team" }));
    expect((await screen.findByRole("alert")).textContent).toBe("could not leave team");
    expect(screen.getByText("Team Code: 123456")).toBeTruthy();
  });
});

describe("change password", () => {
  async function submit(current, next) {
    await userEvent.click(await screen.findByRole("button", { name: "Reset Password" }));
    await userEvent.type(screen.getByLabelText("Current Password"), current);
    await userEvent.type(screen.getByLabelText("New Password"), next);
    await click("Save Password");
  }

  test("success sends both passwords, closes the form and confirms", async () => {
    const { fetch } = renderAs(athlete, { "/change-password": reply({ success: true }) });
    await submit("oldpass12", "newpass12");
    expect((await screen.findByRole("alert")).textContent).toBe("Password updated");
    expect(screen.queryByLabelText("Current Password")).toBeNull();
    expect(sentBody(fetch, "/change-password")).toEqual({ currentPassword: "oldpass12", newPassword: "newpass12" });
  });

  test("a wrong current password shows the error and keeps the form", async () => {
    renderAs(athlete, { "/change-password": reply({ error: "current password is incorrect" }, 401) });
    await submit("wrongpass", "newpass12");
    expect((await screen.findByRole("alert")).textContent).toBe("current password is incorrect");
    expect(screen.getByLabelText("Current Password")).toBeTruthy();
  });

  test("cancel closes the form", async () => {
    renderAs(athlete);
    await userEvent.click(await screen.findByRole("button", { name: "Reset Password" }));
    await click("Cancel");
    expect(screen.queryByLabelText("Current Password")).toBeNull();
  });
});

test("log out posts to /logout then calls onLoggedOut", async () => {
  const { fetch, onLoggedOut } = renderAs(athlete, { "/logout": { ok: true, status: 204 } });
  await userEvent.click(await screen.findByRole("button", { name: "Log Out" }));
  expect(fetch.mock.calls.some(([url, o]) => url.endsWith("/logout") && o.method === "POST")).toBe(true);
  expect(onLoggedOut).toHaveBeenCalledOnce();
});
