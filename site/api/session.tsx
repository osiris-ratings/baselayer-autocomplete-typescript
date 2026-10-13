// The session the reference's forms share. A Create a session that succeeds
// leaves its token here, with when it expires and the request that made it;
// the autocomplete routes' forms start from it, say how long it has, and when
// it has run out mint another, on Send, with the same request. The request
// holds the reader's API key, in memory and nowhere else: this page keeps
// nothing, and the key goes only where the reader sent it.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { refusalOf, sendTarget } from "./send";

/** The request that minted a session, to send again when it has expired. */
export interface MintRequest {
  /** The API URL, as the form shows it; where it goes is `sendTarget`'s. */
  url: string;
  /** The headers it carried, those a browser sets itself left out. */
  headers: Readonly<Record<string, string>>;
  body: unknown;
}

export interface ActiveSession {
  token: string;
  /** When it stops working, in epoch milliseconds, from `expires_in`. */
  expiresAt: number;
  mint: MintRequest;
}

interface SessionState {
  session: ActiveSession | null;
  setSession(session: ActiveSession | null): void;
}

const NONE: SessionState = { session: null, setSession: () => {} };
const SessionContext = createContext<SessionState>(NONE);

export function SessionProvider({
  children,
  initial = null,
}: {
  children: ReactNode;
  /** A session to start with, for a test or a story. */
  initial?: ActiveSession | null;
}) {
  const [session, setSession] = useState<ActiveSession | null>(initial);
  const value = useMemo(() => ({ session, setSession }), [session]);
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/** The shared session, and a way to replace it. */
export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** The header a session travels in. */
export const SESSION_HEADER = "X-Autocomplete-Session";

export const isSessionHeader = (name: string) =>
  name.toLowerCase() === SESSION_HEADER.toLowerCase();

/**
 * The session a mint's answer made: its token, and its expiry counted from
 * when the answer arrived by `expires_in`, which the API says to time from, not
 * from `expires_at`, whatever the reader's clock says.
 */
export function sessionFrom(
  answer: unknown,
  mint: MintRequest,
  receivedAt: number,
): ActiveSession | null {
  if (answer === null || typeof answer !== "object") {
    return null;
  }
  const { session_token: token, expires_in: seconds } = answer as Record<
    string,
    unknown
  >;
  return typeof token === "string" &&
    token !== "" &&
    typeof seconds === "number"
    ? { token, expiresAt: receivedAt + seconds * 1000, mint }
    : null;
}

/** A mint that did not give a session: its status, and why. */
export class MintFailure extends Error {
  readonly status: number | null;
  constructor(status: number | null, message: string) {
    super(message);
    this.status = status;
  }
}

/** Sends a mint again, as it was sent. */
export async function mintSession(mint: MintRequest): Promise<ActiveSession> {
  let response: Response;
  try {
    response = await fetch(sendTarget(mint.url), {
      method: "POST",
      headers: { ...mint.headers },
      body: JSON.stringify(mint.body ?? {}),
      credentials: "omit",
    });
  } catch (error) {
    throw new MintFailure(null, `did not reach the API: ${String(error)}`);
  }
  const text = await response.text();
  let answer: unknown = null;
  try {
    answer = JSON.parse(text);
  } catch {
    answer = null;
  }
  const made = response.ok ? sessionFrom(answer, mint, Date.now()) : null;
  if (made === null) {
    throw new MintFailure(
      response.status,
      refusalOf(answer) ?? `answered ${response.status}`,
    );
  }
  return made;
}

/** The time now, as often as `every` ms while `on`. */
export function useNow(on: boolean, every = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [on, every]);
  return now;
}

/** `4:07`: what is left of a session, to the second, rounded up. */
export function clock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What the session header's row says under its field: whether there is a
 * session and how long it has, and what Send will do about it. The countdown is
 * drawn, not announced: a screen reader is told when it ends instead.
 */
export function SessionLine({
  session,
  own,
  onUse,
}: {
  session: ActiveSession | null;
  /** The reader typed their own value, so the session is not the field's. */
  own: boolean;
  onUse(): void;
}) {
  const live = session !== null && !own;
  const now = useNow(live);

  if (session === null) {
    return (
      <p className="try-session" data-state="none">
        <span className="try-session-line">
          <span className="try-session-dot" aria-hidden="true" />
          No session yet.
        </span>
        <span className="try-session-note">
          Send <a href="#create-a-session">Create a session</a>, and its session
          is used here.
        </span>
      </p>
    );
  }
  if (own) {
    return (
      <p className="try-session" data-state="own">
        <span className="try-session-line">
          <span className="try-session-dot" aria-hidden="true" />
          Your own value, not the active session.{" "}
          <button type="button" className="try-session-use" onClick={onUse}>
            Use the active session
          </button>
        </span>
      </p>
    );
  }
  const left = session.expiresAt - now;
  const expired = left <= 0;
  return (
    <p className="try-session" data-state={expired ? "expired" : "active"}>
      <span className="try-session-line">
        <span className="try-session-dot" aria-hidden="true" />
        {expired ? "Expired" : "Active"}
        {expired ? null : (
          <>
            <span className="visually-hidden">
              , until {new Date(session.expiresAt).toLocaleTimeString()}
            </span>
            <span className="try-session-clock" aria-hidden="true">
              expires in {clock(left)}
            </span>
          </>
        )}
      </span>
      <span className="try-session-note">
        {expired
          ? "Send mints a new one first"
          : "Send mints a new one if it expires"}
        , with the X-API-Key from{" "}
        <a href="#create-a-session">Create a session</a>.
      </span>
    </p>
  );
}
