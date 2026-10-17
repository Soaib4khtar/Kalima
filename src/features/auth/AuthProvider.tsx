import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { authClient } from "./auth-client";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: Boolean(authClient) });
  useEffect(() => {
    if (!authClient) return;
    let disposed = false;
    let generation = 0;
    let userId: string | undefined;
    const accept = (session: Session | null) => {
      if (disposed) return;
      if (userId !== session?.user.id) {
        void cache.cancelQueries({ queryKey: ["learning"] });
        cache.removeQueries({ queryKey: ["learning"] });
      }
      userId = session?.user.id;
      setState({ session, loading: false });
    };
    const { data } = authClient.auth.onAuthStateChange((_event, session) => { generation++; accept(session); });
    const initial = generation;
    void authClient.auth.getSession().then(({ data, error }) => {
      if (generation === initial) accept(error ? null : data.session);
    }).catch(() => { if (generation === initial) accept(null); });
    return () => { disposed = true; data.subscription.unsubscribe(); };
  }, [cache]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
