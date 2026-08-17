import { useMemo, useRef, useState } from "react";
import { Camera, ChevronRight, Compass, ContactRound, Heart, KeyRound, LifeBuoy, Loader2, LogOut, Mail, Map as MapIcon, MapPin, Plus, Star, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useMemories } from "@/hooks/useMemories";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useFriendRequestCount } from "@/hooks/useFriendRequestCount";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FAVORITES_KEY = "momentunes:favorite-memories";

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut, refreshUser } = useAuth();
  const { memories } = useMemories();
  const { profile, setProfile } = useCurrentProfile();
  const friendRequestCount = useFriendRequestCount();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [displayNameOpen, setDisplayNameOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [sendingSupport, setSendingSupport] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Music lover";
  const username = profile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const joinedAt = profile?.created_at || user?.created_at;
  const placeCount = useMemo(() => new Set(memories.map((memory) => memory.locationPlaceId || memory.locationName).filter(Boolean)).size, [memories]);
  const favoriteCount = useMemo(() => {
    try { return (JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]") as string[]).length; } catch { return 0; }
  }, []);

  const saveEmail = async () => {
    const email = emailDraft.trim().toLowerCase();
    if (!email || email === user?.email) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email });
    setSavingEmail(false);
    if (error) toast.error(error.message);
    else { await refreshUser(); setEmailOpen(false); toast.success("Check your inbox to confirm the new email address"); }
  };

  const savePassword = async () => {
    if (newPassword.length < 8) { toast.error("Use at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("New passwords do not match"); return; }
    if (!currentPassword) { toast.error("Enter your current password"); return; }
    if (!user?.email) { toast.error("No email address is available for this account"); return; }
    setSavingPassword(true);
    const { error: verificationError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verificationError) {
      setSavingPassword(false);
      toast.error("Current password is incorrect");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) toast.error(error.message);
    else { setPasswordOpen(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); toast.success("Password updated"); }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose an image file"); return; }
    if (file.size > 12 * 1024 * 1024) { toast.error("Choose an image smaller than 12 MB"); return; }
    setUploadingAvatar(true);
    try {
      const compressed = await compressImage(file);
      const fileName = `${user.id}/avatars/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("memory-images").upload(fileName, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const avatar_url = supabase.storage.from("memory-images").getPublicUrl(fileName).data.publicUrl;
      const { error: profileError } = await supabase.from("profiles").upsert({ user_id: user.id, avatar_url, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (profileError) throw profileError;
      setProfile((current) => ({ display_name: current?.display_name ?? null, username: current?.username ?? null, created_at: current?.created_at, avatar_url }));
      await supabase.auth.updateUser({ data: { avatar_url } });
      toast.success("Profile photo updated");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not upload profile photo");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const saveDisplayName = async () => {
    if (!user || !displayNameDraft.trim()) return;
    setSavingDisplayName(true);
    try {
      const display_name = displayNameDraft.trim();
      const { error } = await supabase.from("profiles").upsert({ user_id: user.id, display_name, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      setProfile({ display_name, username: profile?.username ?? null, avatar_url: profile?.avatar_url ?? null, created_at: profile?.created_at });
      await supabase.auth.updateUser({ data: { display_name } });
      setDisplayNameOpen(false);
      toast.success("Display name updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update display name");
    } finally { setSavingDisplayName(false); }
  };

  const sendSupportRequest = async () => {
    const subject = supportSubject.trim();
    const message = supportMessage.trim();
    if (!subject || !message) return;
    setSendingSupport(true);
    const { error } = await supabase.functions.invoke("contact-support", { body: { subject, message } });
    setSendingSupport(false);
    if (error) {
      toast.error("Could not send your message. Please try again.");
      return;
    }
    setSupportOpen(false);
    setSupportSubject("");
    setSupportMessage("");
    toast.success("Your message was sent to support");
  };

  return <main className="profile-page">
    <aside className="desktop-map-sidebar desktop-library-sidebar desktop-profile-sidebar">
      <button type="button" className="desktop-add-memory" onClick={() => navigate("/?add=true")}><Plus /><span>Add memory</span></button>
      <nav className="desktop-map-nav"><button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button><button onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button><button onClick={() => navigate("/friends")}><span className="nav-icon-wrap"><ContactRound />{friendRequestCount > 0 && <span className="nav-request-badge">{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>}</span><span>Friends</span></button><button className="active"><UserRound /><span>Account</span></button></nav>
      <div className="desktop-account-wrap">
        <button className="desktop-account" onClick={() => navigate("/account")}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="account-initials">{displayName.slice(0,2).toUpperCase()}</span>}<span className="account-name"><strong>{displayName}</strong>{username && <small>@{username}</small>}</span></button>
      </div>
    </aside>
    <div className="profile-desktop-layout">
    <div className="profile-shell">
      <section className="profile-identity">
        <button type="button" className="profile-avatar-editor" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar} aria-label="Upload profile photo">
          {avatarUrl ? <img src={avatarUrl} alt={`${displayName}'s profile`} /> : <span className="profile-initials">{displayName.slice(0, 2).toUpperCase()}</span>}
          <span className="profile-avatar-action">{uploadingAvatar ? <Loader2 className="animate-spin" /> : <Camera />}</span>
        </button>
        <input ref={avatarInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => uploadAvatar(event.target.files?.[0])} />
        <div><h2>{displayName}</h2>{username && <p>@{username}</p>}<span>Member since {joinedAt ? format(new Date(joinedAt), "yyyy") : "2026"}</span></div>
      </section>

      <section className="profile-stats" aria-label="Your Momentunes stats">
        <button onClick={() => navigate("/journal")}><MapPin /><strong>{memories.length}</strong><span>memories</span></button>
        <button onClick={() => navigate("/")}><MapIcon /><strong>{placeCount}</strong><span>places</span></button>
        <button onClick={() => navigate("/journal?favorites=true")}><Star /><strong>{favoriteCount}</strong><span>favorites</span></button>
      </section>

      <section className="profile-section">
        <h3>Library</h3>
        <div className="profile-link-group">
          <button onClick={() => navigate("/journal?favorites=true")}><span><Star />Favorites</span><ChevronRight /></button>
          <button onClick={() => navigate("/")}><span><MapPin />Places</span><ChevronRight /></button>
        </div>
      </section>

      <section className="profile-section">
        <h3>Account</h3>
        <div className="profile-link-group">
          <button onClick={() => { setEmailDraft(user?.email || ""); setEmailOpen(true); }}><span><Mail />Email<small>{user?.email}</small></span><ChevronRight /></button>
          <button onClick={() => setPasswordOpen(true)}><span><KeyRound />Change password</span><ChevronRight /></button>
          <button onClick={() => { setDisplayNameDraft(displayName); setDisplayNameOpen(true); }}><span><UserRound />Display name<small>{displayName}</small></span><ChevronRight /></button>
        </div>
      </section>

      <section className="profile-section">
        <h3>Need help?</h3>
        <div className="profile-link-group">
          <button onClick={() => navigate("/?tour=1")}><span><Compass />Show me around again</span><ChevronRight /></button>
          <button onClick={() => setSupportOpen(true)}><span><LifeBuoy />Contact support</span><ChevronRight /></button>
        </div>
      </section>

      <button className="profile-signout" onClick={async () => { await signOut(); navigate("/auth"); }}><LogOut />Sign out</button>
    </div>

    </div>

    <nav className="library-bottom-nav" aria-label="Primary navigation">
      <button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button>
      <button onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button>
      <button onClick={() => navigate("/friends")}><span className="nav-icon-wrap"><ContactRound />{friendRequestCount > 0 && <span className="nav-request-badge">{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>}</span><span>Friends</span></button>
      <button className="active"><UserRound /><span>Account</span></button>
    </nav>
    <Dialog open={displayNameOpen} onOpenChange={setDisplayNameOpen}><DialogContent className="profile-name-dialog"><DialogHeader><DialogTitle>Change display name</DialogTitle></DialogHeader><Input value={displayNameDraft} onChange={(event) => setDisplayNameDraft(event.target.value)} maxLength={60} placeholder="Your display name" onKeyDown={(event) => { if (event.key === "Enter") saveDisplayName(); }} /><button className="profile-name-save" onClick={saveDisplayName} disabled={savingDisplayName || !displayNameDraft.trim()}>{savingDisplayName ? "Saving…" : "Save name"}</button></DialogContent></Dialog>
    <Dialog open={emailOpen} onOpenChange={setEmailOpen}><DialogContent className="profile-name-dialog"><DialogHeader><DialogTitle>Change email</DialogTitle></DialogHeader><p className="profile-dialog-copy">Supabase will send confirmation instructions. Your current email remains active until the change is verified.</p><Input type="email" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} placeholder="New email address" onKeyDown={(event) => { if (event.key === "Enter") saveEmail(); }} /><button className="profile-name-save" onClick={saveEmail} disabled={savingEmail || !emailDraft.trim() || emailDraft.trim().toLowerCase() === user?.email?.toLowerCase()}>{savingEmail ? "Updating…" : "Update email"}</button></DialogContent></Dialog>
    <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}><DialogContent className="profile-name-dialog"><DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader><p className="profile-dialog-copy">Enter your current password, then choose a new password with at least 8 characters.</p><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" /><Input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" /><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" onKeyDown={(event) => { if (event.key === "Enter") savePassword(); }} /><button className="profile-name-save" onClick={savePassword} disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}>{savingPassword ? "Updating…" : "Update password"}</button></DialogContent></Dialog>
    <Dialog open={supportOpen} onOpenChange={setSupportOpen}><DialogContent className="profile-name-dialog"><DialogHeader><DialogTitle>Contact support</DialogTitle></DialogHeader><p className="profile-dialog-copy">Tell us what happened and we’ll reply to {user?.email || "your account email"}.</p><Input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} maxLength={120} placeholder="What do you need help with?" /><Textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} maxLength={2000} rows={6} placeholder="Describe the issue, including what you expected to happen." /><button className="profile-name-save" onClick={sendSupportRequest} disabled={sendingSupport || !supportSubject.trim() || !supportMessage.trim()}>{sendingSupport ? "Sending…" : "Send message"}</button></DialogContent></Dialog>
  </main>;
};

export default Profile;
