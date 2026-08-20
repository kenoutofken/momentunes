import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PrivacyPolicyDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const PrivacyPolicyDialog = ({ open, onOpenChange }: PrivacyPolicyDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="legal-dialog">
      <DialogHeader><DialogTitle>Privacy Policy</DialogTitle></DialogHeader>
      <div className="legal-dialog-body">
        <p className="legal-updated">Last updated August 20, 2026</p>

        <h3>Overview</h3>
        <p>Momentunes lets you save memories tied to a photo, place, date, and song, and optionally share them with friends. This page explains what information we collect, why, and how you can control it.</p>

        <h3>Information we collect</h3>
        <p><strong>Account information:</strong> your email address, and any display name or profile photo you add.</p>
        <p><strong>Memories you create:</strong> titles, descriptions, dates, locations (place name and coordinates), photos you upload, songs and artists you attach, and any mood or tags you choose.</p>
        <p><strong>Friend connections:</strong> usernames, friend requests, and which memories you've chosen to share with friends.</p>
        <p><strong>Support messages:</strong> the subject and message you submit through Contact support, along with your account email so we can reply.</p>

        <h3>How we use it</h3>
        <p>We use this information to operate the app: showing your memories on your map, letting friends see what you've chosen to share, powering location and song search when you're adding a memory, and responding to support requests.</p>

        <h3>Third-party services we rely on</h3>
        <p>Momentunes is built on a few outside services, each of which only sees the minimum needed to do its job:</p>
        <ul>
          <li><strong>Supabase</strong> — authentication, database storage, and file storage for your account, memories, and photos.</li>
          <li><strong>Geoapify</strong> — location search and reverse geocoding when you pick a place for a memory.</li>
          <li><strong>Deezer</strong> — song search and preview playback when you attach music to a memory.</li>
          <li><strong>Formspree</strong> — delivers the messages you send through Contact support.</li>
        </ul>

        <h3>Sharing</h3>
        <p>Your memories are private by default. They're only visible to other people if you mark them shared with friends, as reflected in the app's own sharing controls.</p>

        <h3>Data retention and deletion</h3>
        <p>We keep your memories and photos until you delete them or delete your account. Deleting a memory or your account removes it from our active database; routine backups kept for disaster recovery may retain a copy for a short period before they're purged.</p>

        <h3>Your rights</h3>
        <p>You can view, edit, or delete your memories and account information at any time from within the app. For anything you can't do yourself, reach out through Contact support in Account settings.</p>

        <h3>Children's privacy</h3>
        <p>Momentunes isn't directed at children under 13, and we don't knowingly collect information from them.</p>

        <h3>Security</h3>
        <p>We use reasonable technical measures to protect your data, but no method of storage or transmission is 100% secure.</p>

        <h3>Changes to this policy</h3>
        <p>If this policy changes, we'll update the "last updated" date above.</p>

        <h3>Contact</h3>
        <p>Questions about this policy or your data? Use Contact support in Account settings.</p>
      </div>
    </DialogContent>
  </Dialog>
);

export default PrivacyPolicyDialog;
