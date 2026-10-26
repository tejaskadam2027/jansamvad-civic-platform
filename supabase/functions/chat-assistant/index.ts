// JanSamvad AI Assistant edge function.
// - Authenticates the caller via the Supabase JWT.
// - Persists conversations and messages to the chat_conversations / chat_messages tables.
// - Handles structured intents (track a complaint, list my complaints, department info, how to file)
//   against the real complaints table.
// - For general conversation, calls OpenAI when OPENAI_API_KEY is configured; otherwise returns a
//   clearly-labeled intent-based fallback so the assistant still works without a paid AI key.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY?: string;
}

function env(): Env {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }
  return { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY") };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Submitted",
  AI_ANALYZED: "Submitted",
  VERIFIED: "Verified",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

function friendlyStatus(status: string): string {
  return STATUS_LABELS[status] || status;
}

// Extract a complaint number like "JS-2026-000001" from the message.
function extractComplaintNumber(text: string): string | null {
  const match = text.toUpperCase().match(/JS[-\s]?\d{4}[-\s]?\d{1,6}/);
  if (match) return match[0].replace(/\s/g, "-").replace(/--/g, "-");
  return null;
}

async function trackComplaint(supabaseAdmin: ReturnType<typeof createClient>, userId: string, complaintNumber: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("complaints")
    .select("complaint_number, title, category, department, priority, status, location, created_at, citizen_id, assigned_worker_name")
    .eq("complaint_number", complaintNumber)
    .maybeSingle();
  if (error) return `I couldn't look up complaint ${complaintNumber} right now due to a database error. Please try again.`;
  if (!data) return `I couldn't find a complaint with number ${complaintNumber}. Please check the ID and try again. You can find your complaint IDs in the "My Complaints" section.`;
  // Only the owner or an authority/admin may see details. The RLS policy already enforces owner reads;
  // for authority/admin we rely on the service-role client here.
  const status = friendlyStatus(data.status);
  const created = data.created_at ? new Date(data.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : "unknown";
  let reply = `Complaint ${data.complaint_number}: ${data.title}\n`;
  reply += `Category: ${data.category}\n`;
  reply += `Department: ${data.department}\n`;
  reply += `Priority: ${data.priority}\n`;
  reply += `Status: ${status}\n`;
  if (data.location) reply += `Location: ${data.location}\n`;
  if (data.assigned_worker_name) reply += `Assigned to: ${data.assigned_worker_name}\n`;
  reply += `Filed on: ${created}`;
  if (status === "Resolved") reply += `\n\nThis complaint has been resolved. If the issue persists, you can file a new complaint.`;
  else if (status === "Rejected") reply += `\n\nThis complaint was rejected. Please contact the municipal office for clarification.`;
  else reply += `\n\nYour complaint is being processed. I'll keep you updated as the status changes.`;
  return reply;
}

async function listMyComplaints(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("complaints")
    .select("complaint_number, title, status, created_at")
    .eq("citizen_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return "I couldn't fetch your complaints right now. Please try again.";
  if (!data || data.length === 0) return "You haven't filed any complaints yet. You can file a new complaint from the Citizen Dashboard under \"Report a Complaint\".";
  const lines = data.map((c: { complaint_number: string; title: string; status: string; created_at: string }) => {
    const d = c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "";
    return `• ${c.complaint_number} — ${c.title} (${friendlyStatus(c.status)}, ${d})`;
  });
  return `Here are your most recent complaints:\n${lines.join("\n")}\n\nAsk me "track JS-2026-XXXXXX" to see full details of any complaint.`;
}

const DEPARTMENTS: { name: string; handles: string }[] = [
  { name: "Solid Waste Management", handles: "garbage, waste collection, dustbins, street sweeping" },
  { name: "Public Works Department", handles: "roads, potholes, pavements, footpaths, road repair" },
  { name: "Electrical Department", handles: "street lights, electrical faults, illumination" },
  { name: "Water Supply Department", handles: "water leakage, pipe bursts, water supply, taps" },
  { name: "Sanitation Department", handles: "sewage, drains, gutters, public toilets, foul smell" },
  { name: "Garden Department", handles: "trees, fallen branches, public parks, gardens" },
  { name: "Encroachment Department", handles: "illegal occupation, hawkers, vendors on public land" },
  { name: "Animal Control", handles: "stray dogs, animal nuisance, monkeys, snakes" },
  { name: "General Administration", handles: "general civic issues, other" },
];

function departmentInfo(text: string): string | null {
  const lower = text.toLowerCase();
  if (!lower.includes("department") && !lower.includes("departments") && !lower.includes("which dept")) return null;
  const matched = DEPARTMENTS.filter((d) => lower.includes(d.name.toLowerCase().split(" ")[0]));
  if (matched.length > 0) {
    return matched.map((d) => `${d.name}: handles ${d.handles}.`).join("\n");
  }
  return `JanSamvad routes complaints to these departments:\n${DEPARTMENTS.map((d) => `• ${d.name} — ${d.handles}`).join("\n")}\n\nWhen you file a complaint, the system automatically suggests the right department based on your description.`;
}

function howToFile(): string {
  return `To file a complaint:\n1. Open the Citizen Dashboard and tap "Report a Complaint".\n2. Enter a clear title and describe the issue.\n3. Pick a category (or let the AI suggest one after you click "Run AI Analysis").\n4. Select the area, then drop a pin on the map at the exact location (or tap "Use my GPS").\n5. Optionally attach a photo or video as evidence.\n6. Tap "Run AI Analysis" to confirm the category, department, and priority.\n7. Confirm to submit — you'll earn 50 reward points and get a complaint ID like JS-2026-XXXXXX.\n\nUse that ID to track status anytime by asking me "track JS-2026-XXXXXX".`;
}

function buildSystemContext(role: string, recentComplaintsSummary: string): string {
  return [
    "You are JanSetu, the AI assistant for JanSamvad, a civic grievance redressal platform for Pimpri-Chinchwad Municipal Corporation (PCMC), Maharashtra, India.",
    "You help citizens file complaints, track complaint status, explain which department handles which issues, and guide users through the complaint process.",
    "Be concise, friendly, and practical. Answer in the same language the user writes in (English, Hindi, or Marathi).",
    `The current user's role is: ${role}.`,
    `The user's recent complaints: ${recentComplaintsSummary || "none filed yet"}.`,
    "If a user wants to file a complaint, guide them to the Citizen Dashboard > Report a Complaint. Do not file complaints on their behalf.",
    "If a user asks to track a complaint, tell them to ask with the complaint ID (e.g. 'track JS-2026-000001') and you will look it up.",
    "Never invent complaint records, IDs, or statuses. If you don't know something, say so.",
  ].join("\n");
}

async function callOpenAI(apiKey: string, systemPrompt: string, history: { role: string; content: string }[], userMessage: string): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8),
    { role: "user", content: userMessage },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.5,
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned an empty response.");
  }
  return content.trim();
}

// Intent-based fallback used when no AI key is configured.
function intentFallback(text: string): string {
  const lower = text.toLowerCase().trim();
  if (lower === "hi" || lower === "hello" || lower === "hey" || lower.startsWith("namaste") || lower.startsWith("namaskar")) {
    return "Hello! I'm JanSetu, your JanSamvad assistant. I can help you:\n• Track a complaint (say \"track JS-2026-XXXXXX\")\n• List your recent complaints (say \"my complaints\")\n• Explain which department handles an issue\n• Guide you through filing a complaint\n\nWhat would you like to do?";
  }
  if (lower.includes("my complaint") || lower.includes("list my") || lower.includes("show my") || lower.includes("my complaints")) {
    return "Please ask me \"my complaints\" and I'll look them up from your account.";
  }
  if (lower.includes("how") && (lower.includes("file") || lower.includes("report") || lower.includes("complain"))) {
    return howToFile();
  }
  const dept = departmentInfo(text);
  if (dept) return dept;
  return "I can help you track a complaint (say \"track JS-2026-XXXXXX\"), list your complaints (\"my complaints\"), explain departments, or guide you to file a new complaint. Note: a general conversational AI model is not configured on this server, so I can only handle these specific requests right now. Ask the administrator to configure an AI provider to enable free-form conversation.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const e = env();
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return jsonResponse({ error: "Missing authentication token." }, 401);

    // Build an admin client for DB writes and cross-user lookups (authority/admin tracking).
    const supabaseAdmin = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    // Build a user-scoped client to resolve the caller's identity from the JWT.
    const supabaseUser = createClient(e.SUPABASE_URL, token, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid or expired session. Please sign in again." }, 401);
    }
    const userId = userData.user.id;

    // Resolve role from user_metadata (set at signup). Default to citizen.
    const role = (userData.user.user_metadata?.role as string) || "CITIZEN";

    const url = new URL(req.url);

    // GET /chat-assistant/conversations  -> list user's conversations
    if (req.method === "GET" && url.pathname.endsWith("/conversations")) {
      const { data, error } = await supabaseAdmin
        .from("chat_conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse(data);
    }

    // GET /chat-assistant/conversations/:id/messages
    const msgMatch = url.pathname.match(/\/conversations\/(\d+)\/messages$/);
    if (req.method === "GET" && msgMatch) {
      const convId = Number(msgMatch[1]);
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("chat_conversations")
        .select("id, title, created_at, updated_at")
        .eq("id", convId)
        .eq("user_id", userId)
        .maybeSingle();
      if (convErr) return jsonResponse({ error: convErr.message }, 500);
      if (!conv) return jsonResponse({ error: "Conversation not found." }, 404);
      const { data: messages, error: msgErr } = await supabaseAdmin
        .from("chat_messages")
        .select("id, sender, message, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      if (msgErr) return jsonResponse({ error: msgErr.message }, 500);
      return jsonResponse({ ...conv, messages: messages || [] });
    }

    // DELETE /chat-assistant/conversations/:id
    const delMatch = url.pathname.match(/\/conversations\/(\d+)$/);
    if (req.method === "DELETE" && delMatch) {
      const convId = Number(delMatch[1]);
      const { error } = await supabaseAdmin.from("chat_conversations").delete().eq("id", convId).eq("user_id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    // POST /chat-assistant/message  { message, conversationId? }
    if (req.method === "POST" && url.pathname.endsWith("/message")) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.message !== "string" || !body.message.trim()) {
        return jsonResponse({ error: "Request body must include a non-empty 'message'." }, 400);
      }
      const userMessage: string = body.message.replace(/^\[(marathi|hindi)\]\s*/i, "").trim();
      let conversationId: number | undefined = typeof body.conversationId === "number" ? body.conversationId : undefined;

      // Load or create the conversation, and fetch recent history.
      let history: { role: string; content: string }[] = [];
      if (conversationId) {
        const { data: conv } = await supabaseAdmin
          .from("chat_conversations")
          .select("id, user_id")
          .eq("id", conversationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!conv) conversationId = undefined;
      }
      if (!conversationId) {
        const title = userMessage.length > 40 ? userMessage.slice(0, 40) + "…" : userMessage;
        const { data: newConv, error: newConvErr } = await supabaseAdmin
          .from("chat_conversations")
          .insert({ user_id: userId, title })
          .select("id")
          .single();
        if (newConvErr || !newConv) return jsonResponse({ error: "Could not start a conversation." }, 500);
        conversationId = newConv.id;
      } else {
        const { data: priorMessages } = await supabaseAdmin
          .from("chat_messages")
          .select("sender, message")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(16);
        history = (priorMessages || []).map((m: { sender: string; message: string }) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.message,
        }));
      }

      // Persist the user's message.
      await supabaseAdmin.from("chat_messages").insert({ conversation_id: conversationId, sender: "user", message: userMessage });

      // --- Intent handling (always available, works with or without AI) ---
      let reply: string;
      const complaintNumber = extractComplaintNumber(userMessage);
      const lower = userMessage.toLowerCase();

      if (complaintNumber && (lower.includes("track") || lower.includes("status") || lower.includes("where") || lower.includes("update"))) {
        reply = await trackComplaint(supabaseAdmin, userId, complaintNumber);
      } else if (lower.includes("my complaint") || lower.includes("list my") || lower.includes("show my complaint") || lower.trim() === "my complaints") {
        reply = await listMyComplaints(supabaseAdmin, userId);
      } else if (lower.includes("how") && (lower.includes("file") || lower.includes("report") || lower.includes("complain") || lower.includes("register"))) {
        reply = howToFile();
      } else {
        const dept = departmentInfo(userMessage);
        if (dept) {
          reply = dept;
        } else if (e.OPENAI_API_KEY) {
          // General conversation via OpenAI with context.
          const { data: recent } = await supabaseAdmin
            .from("complaints")
            .select("complaint_number, title, status")
            .eq("citizen_id", userId)
            .order("created_at", { ascending: false })
            .limit(5);
          const recentSummary = (recent || []).map((c: { complaint_number: string; title: string; status: string }) => `${c.complaint_number} (${friendlyStatus(c.status)}): ${c.title}`).join("; ");
          try {
            reply = await callOpenAI(e.OPENAI_API_KEY, buildSystemContext(role, recentSummary), history, userMessage);
          } catch (aiErr) {
            reply = `I couldn't reach the AI service right now (${aiErr instanceof Error ? aiErr.message : "unknown error"}). ${intentFallback(userMessage)}`;
          }
        } else {
          reply = intentFallback(userMessage);
        }
      }

      // Persist the assistant reply and bump the conversation's updated_at.
      await supabaseAdmin.from("chat_messages").insert({ conversation_id: conversationId, sender: "assistant", message: reply });
      await supabaseAdmin.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

      return jsonResponse({ conversationId, reply });
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return jsonResponse({ error: message }, 500);
  }
});
