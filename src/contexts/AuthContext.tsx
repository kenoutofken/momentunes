import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    setUser(data.user);
    setSession((current) => current ? { ...current, user: data.user } : current);
    return data.user;
  };

  useEffect(() => {
    // Subscribe first so login/logout changes update the whole app immediately.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Also load the existing session on refresh so protected routes know whether to render.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const refreshOnReturn = () => { void refreshUser(); };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshUser(); };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
