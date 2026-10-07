import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { client, database } from "../client";
import type { Profile } from "../types";
import { can, type AccessGrant, type Scope } from "./permissions";
import { message } from "../../shared/errors";
import { setUnitCoverAccess } from "../unitCovers";
type AuthState = {
  session: Session | null;
  profile: Profile | null;
  grants: AccessGrant[];
  loading: boolean;
  error: string;
};
type AuthValue = AuthState & {
  refresh: () => void;
  can: (permission: string, scope?: Scope) => boolean;
};
const initial: AuthState = {
  session: null,
  profile: null,
  grants: [],
  loading: true,
  error: "",
};
const Context = createContext<AuthValue | null>(null);
// Private client caches (unit cover signed URLs) are scoped to this key: user, active flag and
// grants (order-insensitive). A user whose access is not loaded yet gets a key of its own.
const accessKey = (userId: string, active?: boolean, grants?: AccessGrant[]) =>
  JSON.stringify(
    grants
      ? [
          userId,
          !!active,
          grants
            .map((g) => JSON.stringify([g.permission, g.scope_type, g.unit_id, g.sector_id]))
            .sort(),
        ]
      : [userId],
  );
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial);
  const sequence = useRef(0);
  const current = useRef<Session | null>(null);
  const bootstrap = useCallback(async (session: Session | null) => {
    const request = ++sequence.current;
    const sameUser = current.current?.user.id === session?.user.id;
    current.current = session;
    if (!session) {
      setUnitCoverAccess("");
      setState({ ...initial, loading: false });
      return;
    }
    if (!sameUser) {
      setUnitCoverAccess(accessKey(session.user.id));
      setState({ ...initial, session, loading: true });
    }
    try {
      const [
        { data: profile, error: profileError },
        { data: grants, error: accessError },
      ] = await Promise.all([
        database()
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle(),
        database().rpc("my_access"),
      ]);
      if (profileError || accessError) throw profileError ?? accessError;
      if (request === sequence.current) {
        setUnitCoverAccess(
          accessKey(session.user.id, profile?.active, grants ?? []),
        );
        setState({
          session,
          profile,
          grants: grants ?? [],
          loading: false,
          error: "",
        });
      }
    } catch (e) {
      if (request === sequence.current) {
        setUnitCoverAccess(accessKey(session.user.id));
        setState({ ...initial, session, loading: false, error: message(e) });
      }
    }
  }, []);
  const refresh = useCallback(() => {
    void bootstrap(current.current);
  }, [bootstrap]);
  useEffect(() => {
    if (!client) return;
    // Supabase emits INITIAL_SESSION; do not await Supabase calls inside its auth callback.
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => void bootstrap(session));
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(refresh, 60000);
    return () => {
      ++sequence.current;
      setUnitCoverAccess("");
      data.subscription.unsubscribe();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bootstrap, refresh]);
  return (
    <Context.Provider
      value={{
        ...state,
        refresh,
        can: (p, s) => can(!!state.profile?.active, state.grants, p, s),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider required");
  return value;
}
