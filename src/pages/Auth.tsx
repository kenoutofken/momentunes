import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Landing from "./Landing";
import { CheckCircle2, Eye, EyeOff, MapPin, Music2, Quote } from "lucide-react";
import { PressableButton } from "@/components/ui/pressable-button";
import BrandMark from "@/components/BrandMark";
import PrivacyPolicyDialog from "@/components/PrivacyPolicyDialog";

type AuthView = "landing" | "signin" | "signup" | "signup-success";

const authStories = [
  { eyebrow: "Pin the moment", title: "Every place has a story.", copy: "Save the location, photos, and date while the feeling is still close.", scene: "place" },
  { eyebrow: "Add the soundtrack", title: "Remember how it sounded.", copy: "Pair each memory with the song that brings you straight back.", scene: "music" },
  { eyebrow: "Return anytime", title: "Your life, mapped in memories.", copy: "Wander through the places, people, and music that shaped you.", scene: "return" },
] as const;

const AuthIllustration = ({ scene }: { scene: typeof authStories[number]["scene"] }) => (
  <svg className="auth-story-art" viewBox="0 0 620 470" role="img" aria-label="A colorful map of personal memories">
    <rect width="620" height="470" rx="42" fill="#ffebf3" />
    <path d="M0 95C95 44 150 135 245 91s154-77 248-25 83 5 127-12v416H0Z" fill="#ffd1e3" />
    <path d="M-20 335c90-72 142-21 216-78s125-104 216-55 129 16 229-67" fill="none" stroke="#fff" strokeWidth="22" strokeLinecap="round" />
    <path d="M54 20c58 87 32 152 117 190s181 24 220 103 92 74 167 65" fill="none" stroke="#f8a9c7" strokeWidth="7" strokeLinecap="round" />
    <path d="M280-15c-20 103 43 147 8 231s-4 154 68 269" fill="none" stroke="#f8a9c7" strokeWidth="7" strokeLinecap="round" />
    <g transform={scene === "place" ? "translate(280 112)" : scene === "music" ? "translate(108 205)" : "translate(400 128)"}>
      <path d="M62 0C28 0 0 27 0 61c0 48 62 112 62 112s62-64 62-112C124 27 96 0 62 0Z" fill="#f31e78" />
      <text x="62" y="79" fill="white" fontFamily="Georgia,serif" fontSize="66" fontWeight="700" textAnchor="middle">“</text>
    </g>
    {scene === "music" && <g transform="translate(295 90)"><rect width="235" height="270" rx="28" fill="white" /><rect x="22" y="22" width="191" height="154" rx="20" fill="#171717" /><circle cx="117" cy="99" r="53" fill="#f31e78" /><circle cx="117" cy="99" r="18" fill="#fff" /><path d="M28 216h179" stroke="#171717" strokeWidth="5" strokeLinecap="round" /><circle cx="91" cy="216" r="11" fill="#f31e78" /><path d="M45 245h78M45 260h48" stroke="#171717" strokeWidth="7" strokeLinecap="round" /></g>}
    {scene === "place" && <g transform="translate(64 255)"><rect width="188" height="150" rx="25" fill="white" /><circle cx="53" cy="55" r="29" fill="#f31e78" /><path d="M34 104h120M34 124h83" stroke="#171717" strokeWidth="8" strokeLinecap="round" /></g>}
    {scene === "return" && <g transform="translate(72 95)"><rect width="260" height="270" rx="30" fill="white" /><rect x="22" y="22" width="216" height="150" rx="20" fill="#f8a9c7" /><circle cx="91" cy="86" r="28" fill="#f31e78" /><path d="m30 160 64-65 38 36 35-42 63 71" fill="#fff" /><path d="M30 211h176M30 238h126" stroke="#171717" strokeWidth="8" strokeLinecap="round" /></g>}
    <circle cx="555" cy="407" r="46" fill="#171717" /><path d="m541 408 11 11 22-28" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Auth = () => {
  const [searchParams] = useSearchParams();
  const initialView = (searchParams.get("view") as AuthView) || "landing";
  const [view, setView] = useState<AuthView>(initialView);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const normalizedUsername = username.trim().toLowerCase();

  // Authenticated users should not stay on the login/signup screens. If they were
  // redirected here from a protected page (e.g. a shared memory link), send them back.
  useEffect(() => {
    if (!user) return;
    const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
    navigate(from ? `${from.pathname}${from.search ?? ""}` : "/", { replace: true });
  }, [user, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (view === "signup") {
      // Usernames are normalized before saving so profile links and search stay predictable.
      if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
        toast.error("Username must be 3-24 characters using lowercase letters, numbers, or underscores");
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        setLoading(false);
        return;
      }

      // Check the profiles table first because Supabase Auth does not know about app usernames.
      const { data: existingProfile, error: usernameError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("username", normalizedUsername)
        .maybeSingle();

      if (usernameError) {
        toast.error(usernameError.message);
        setLoading(false);
        return;
      }

      if (existingProfile) {
        toast.error("That username is already taken");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            username: normalizedUsername,
            display_name: normalizedUsername,
          },
        },
      });
      if (error) {
        toast.error(error.message);
      } else {
        // When email confirmation is not required, create/update the profile immediately.
        if (data.user && data.session) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              user_id: data.user.id,
              username: normalizedUsername,
              display_name: normalizedUsername,
            });

          if (profileError) {
            toast.error(profileError.message);
            setLoading(false);
            return;
          }
        }
        setView("signup-success");
      }
    } else {
      // Sign-in delegates password verification to Supabase Auth.
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
      }
    }
    setLoading(false);
  };

  if (view === "landing") {
    return (
      <Landing
        onGetStarted={() => setView("signup")}
        onSignIn={() => setView("signin")}
      />
    );
  }

  if (view === "signup-success") {
    return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-6">
            <CheckCircle2 size={56} className="text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-3">
            Account Created!
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Your account has been created successfully. You can now sign in.
          </p>
          <PressableButton
            onClick={() => setView("signin")}
            className="w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign In Now
          </PressableButton>
        </div>
      </div>
    );
  }

  const isSignUp = view === "signup";
  const story = authStories[storyIndex];

  return (
    <main className="momentunes-auth">
      <section className="momentunes-auth-form">
        <button className="auth-brand" type="button" onClick={() => setView("landing")}><BrandMark /></button>
        <div className="auth-form-inner">
          <div className="auth-heading">
            <span className="auth-quote"><Quote /></span>
            <p>{isSignUp ? "Start your memory map" : "Welcome back"}</p>
            <h1>{isSignUp ? "Create your Momentunes account" : "Log in to your memories"}</h1>
            <span>{isSignUp ? "A home for the places, photos, and songs you never want to forget." : "Your memories are right where you left them."}</span>
          </div>

        <form onSubmit={handleSubmit} className="auth-fields">
          {isSignUp && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  className="auth-input auth-input-username"
                  placeholder="username"
                  required
                  minLength={3}
                  maxLength={24}
                />
              </div>
              <p className="auth-field-note">
                Lowercase letters, numbers, and underscores only.
              </p>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input auth-input-password"
                placeholder="••••••••"
                required
                minLength={6}
              />
              <PressableButton
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </PressableButton>
            </div>
          </div>
          {isSignUp && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="auth-input auth-input-password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <PressableButton
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </PressableButton>
              </div>
            </div>
          )}

          <PressableButton
            type="submit"
            disabled={loading}
            className="auth-submit"
          >
            {loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
          </PressableButton>
        </form>

        <p className="auth-switch">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <PressableButton
            onClick={() => setView(isSignUp ? "signin" : "signup")}
            className="auth-switch-button"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </PressableButton>
        </p>

        </div>
        <p className="auth-terms">By continuing, you agree to the Terms and <button type="button" className="auth-terms-link" onClick={() => setPrivacyOpen(true)}>Privacy Policy</button>.</p>
      </section>
      <aside className="auth-story-panel">
        <div className="auth-story-copy"><span>{story.eyebrow}</span><h2>{story.title}</h2><p>{story.copy}</p></div>
        <AuthIllustration scene={story.scene} />
        <div className="auth-story-controls" aria-label="Onboarding slides">{authStories.map((item, index) => <button key={item.eyebrow} type="button" className={index === storyIndex ? "active" : ""} onClick={() => setStoryIndex(index)} aria-label={`Show slide ${index + 1}`} />)}</div>
        <div className="auth-floating-icon auth-pin"><MapPin /></div><div className="auth-floating-icon auth-note"><Music2 /></div>
      </aside>
      <PrivacyPolicyDialog open={privacyOpen} onOpenChange={setPrivacyOpen} />
    </main>
  );
};

export default Auth;
