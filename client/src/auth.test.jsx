// Unit tests for the logged-out screens: Login, Signup and ForgotPassword.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import ForgotPassword from "./ForgotPassword.jsx";
import { reply, sentBody, stubFetch } from "./testUtils.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (label, text) => userEvent.type(screen.getByLabelText(label), text);
const click = (name) => userEvent.click(screen.getByRole("button", { name }));

describe("Login", () => {
  async function logIn() {
    await type("Email", "a@b.com");
    await type("Password", "password1");
    await click("Log In");
  }

  test("posts the credentials and hands the user to onLoggedIn", async () => {
    const user = { id: 1, name: "Al", role: "athlete" };
    const fetch = stubFetch({ "/login": reply(user) });
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    await logIn();
    expect(sentBody(fetch, "/login")).toEqual({ email: "a@b.com", password: "password1" });
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
    expect(onLoggedIn).toHaveBeenCalledWith(user);
  });

  test("shows the server's error and doesn't log in", async () => {
    stubFetch({ "/login": reply({ error: "invalid email or password" }, 401) });
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    await logIn();
    expect((await screen.findByRole("alert")).textContent).toBe("invalid email or password");
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  test("falls back to a generic error when the server gives none", async () => {
    stubFetch({ "/login": reply({}, 500) });
    render(<Login onLoggedIn={vi.fn()} />);
    await logIn();
    expect((await screen.findByRole("alert")).textContent).toBe("login failed");
  });

  test("links to sign up and forgot password", async () => {
    const onSwitchToSignup = vi.fn();
    const onForgotPassword = vi.fn();
    render(<Login onSwitchToSignup={onSwitchToSignup} onForgotPassword={onForgotPassword} />);
    await click("Sign Up");
    await click("Forgot password?");
    expect(onSwitchToSignup).toHaveBeenCalledOnce();
    expect(onForgotPassword).toHaveBeenCalledOnce();
  });
});

describe("Signup", () => {
  async function fillIn() {
    await type("Name", "Al");
    await type("Email", "a@b.com");
    await type("Password", "password1");
    await type("Answer", "Rex");
  }

  test("sends every field, defaulting to athlete and the first question", async () => {
    const fetch = stubFetch({ "/register": reply({ id: 1 }, 201) });
    const onSignedUp = vi.fn();
    render(<Signup onSignedUp={onSignedUp} />);
    await fillIn();
    await click("Sign Up");
    expect(sentBody(fetch, "/register")).toEqual({
      name: "Al",
      email: "a@b.com",
      password: "password1",
      role: "athlete",
      securityQuestion: "What was the name of your first pet?",
      securityAnswer: "Rex",
    });
    expect(onSignedUp).toHaveBeenCalledWith({ id: 1 });
  });

  test("sends the chosen role and security question", async () => {
    const fetch = stubFetch({ "/register": reply({ id: 1 }, 201) });
    render(<Signup onSignedUp={vi.fn()} />);
    await fillIn();
    await userEvent.selectOptions(screen.getByLabelText("I am a"), "coach");
    await userEvent.selectOptions(screen.getByLabelText("Security Question"), "What city were you born in?");
    await click("Sign Up");
    expect(sentBody(fetch, "/register")).toMatchObject({
      role: "coach",
      securityQuestion: "What city were you born in?",
    });
  });

  test("shows the server's error", async () => {
    stubFetch({ "/register": reply({ error: "email already registered" }, 409) });
    const onSignedUp = vi.fn();
    render(<Signup onSignedUp={onSignedUp} />);
    await fillIn();
    await click("Sign Up");
    expect((await screen.findByRole("alert")).textContent).toBe("email already registered");
    expect(onSignedUp).not.toHaveBeenCalled();
  });

  test("password requires 8 characters", () => {
    render(<Signup />);
    expect(screen.getByLabelText("Password").minLength).toBe(8);
  });

  test("links back to log in", async () => {
    const onSwitchToLogin = vi.fn();
    render(<Signup onSwitchToLogin={onSwitchToLogin} />);
    await click("Log In");
    expect(onSwitchToLogin).toHaveBeenCalledOnce();
  });
});

describe("ForgotPassword", () => {
  const question = "What was the name of your first pet?";

  test("step 1 looks up the question and locks the email", async () => {
    const fetch = stubFetch({ "/security-question": reply({ securityQuestion: question }) });
    render(<ForgotPassword />);
    await type("Email", "a@b.com");
    await click("Continue");
    expect(await screen.findByLabelText(question)).toBeTruthy();
    expect(screen.getByLabelText("Email").disabled).toBe(true);
    expect(sentBody(fetch, "/security-question")).toEqual({ email: "a@b.com" });
  });

  test("step 2 resets the password and shows the confirmation", async () => {
    const fetch = stubFetch({
      "/security-question": reply({ securityQuestion: question }),
      "/reset-password": reply({ success: true }),
    });
    const onSwitchToLogin = vi.fn();
    render(<ForgotPassword onSwitchToLogin={onSwitchToLogin} />);
    await type("Email", "a@b.com");
    await click("Continue");
    await userEvent.type(await screen.findByLabelText(question), "Rex");
    await type("New Password", "newpass12");
    await click("Reset Password");
    expect(await screen.findByText("Your password has been updated.")).toBeTruthy();
    expect(sentBody(fetch, "/reset-password")).toEqual({
      email: "a@b.com",
      securityAnswer: "Rex",
      newPassword: "newpass12",
    });
    await click("Log In");
    expect(onSwitchToLogin).toHaveBeenCalledOnce();
  });

  test("shows the server's error for an unknown email", async () => {
    stubFetch({ "/security-question": reply({ error: "no security question found for that email" }, 404) });
    render(<ForgotPassword />);
    await type("Email", "x@b.com");
    await click("Continue");
    expect((await screen.findByRole("alert")).textContent).toBe("no security question found for that email");
    expect(screen.getByLabelText("Email").disabled).toBe(false);
  });

  test("a wrong answer keeps the form open with the error", async () => {
    stubFetch({
      "/security-question": reply({ securityQuestion: question }),
      "/reset-password": reply({}, 401),
    });
    render(<ForgotPassword />);
    await type("Email", "a@b.com");
    await click("Continue");
    await userEvent.type(await screen.findByLabelText(question), "Fido");
    await type("New Password", "newpass12");
    await click("Reset Password");
    expect((await screen.findByRole("alert")).textContent).toBe("request failed");
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeTruthy();
  });

  test("new password requires 8 characters", async () => {
    stubFetch({ "/security-question": reply({ securityQuestion: question }) });
    render(<ForgotPassword />);
    await type("Email", "a@b.com");
    await click("Continue");
    expect((await screen.findByLabelText("New Password")).minLength).toBe(8);
  });

  test("links back to log in", async () => {
    const onSwitchToLogin = vi.fn();
    render(<ForgotPassword onSwitchToLogin={onSwitchToLogin} />);
    await click("Back to Log In");
    expect(onSwitchToLogin).toHaveBeenCalledOnce();
  });
});
