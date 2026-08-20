import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Authentication required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email) return jsonResponse({ error: "Authentication required" }, 401);

    const { subject, message } = await req.json();
    if (typeof subject !== "string" || !subject.trim() || subject.trim().length > 120) {
      return jsonResponse({ error: "Enter a subject of 120 characters or fewer" }, 400);
    }
    if (typeof message !== "string" || !message.trim() || message.trim().length > 2000) {
      return jsonResponse({ error: "Enter a message of 2,000 characters or fewer" }, 400);
    }

    const formspreeFormId = Deno.env.get("FORMSPREE_FORM_ID");
    if (!formspreeFormId) {
      console.error("Contact support Formspree form ID is not configured");
      return jsonResponse({ error: "Support email is not configured" }, 503);
    }

    const response = await fetch(`https://formspree.io/f/${formspreeFormId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `Momentunes Support: ${subject.trim()}`,
        _replyto: user.email,
        message: message.trim(),
        userId: user.id,
      }),
    });

    if (!response.ok) {
      console.error("Formspree contact-support error", response.status, await response.text());
      return jsonResponse({ error: "Could not deliver support request" }, 502);
    }

    return jsonResponse({ sent: true });
  } catch (error) {
    console.error("contact-support error", error);
    return jsonResponse({ error: "Could not send support request" }, 500);
  }
});
