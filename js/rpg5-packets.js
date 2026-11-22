// RPG5-GPT: receive verified, byte-preserved JSON from Supabase.
// No OpenAI API calls, Gemini calls, or RPG5 canon writes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const cfg = window.RPG5_GPT_CONFIG || {};
const $ = id => document.getElementById(id);
const status = $("gpt-remote-status");
const emailField = $("bridge-email");
const signIn = $("bridge-sign-in");
const signOut = $("bridge-sign-out");
const refresh = $("gpt-remote-check");
const rawView = $("bridge-json");
const packetLabel = $("bridge-last-packet");
const authPanel = $("bridge-auth");
const CURSOR_KEY = "rpg5_gpt_bridge_cursor_v1";

function say(message, kind = "waiting") {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = kind;
}
const cursor = () => {
  const value = sessionStorage.getItem(CURSOR_KEY) || "0";
  return /^[0-9]{1,16}$/.test(value) ? value : "0";
};
async function hash(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
function paragraph(parent, content, cls) {
  if (typeof content !== "string" || !content.trim()) return;
  const p = document.createElement("p");
  p.textContent = content;
  if (cls) p.className = cls;
  parent.append(p);
}
function showScene(packet, kind) {
  if (kind === "test") return; // A transport test is not a game event.
  const reply = packet && typeof packet.reply === "object" && packet.reply ? packet.reply : packet;
  const page = $("story-page");
  if (!page || !reply || typeof reply !== "object") return;
  const content = document.createDocumentFragment();
  paragraph(content, reply.narration || reply.scene_text || packet.narration, "story-narration");
  const dialogue = Array.isArray(reply.dialogue) ? reply.dialogue :
    Array.isArray(reply.lines) ? reply.lines : [];
  for (const line of dialogue) {
    if (!line || typeof line !== "object") continue;
    const speaker = String(line.speaker || line.name || line.character_id || "Персонаж");
    const words = String(line.text || line.line || "");
    if (!words) continue;
    const p = document.createElement("p");
    p.className = "story-dialogue";
    const name = document.createElement("strong");
    name.textContent = speaker + ": ";
    p.append(name, document.createTextNode(words));
    content.append(p);
  }
  const choices = Array.isArray(reply.choices) ? reply.choices : [];
  if (choices.length) {
    const list = document.createElement("div");
    list.className = "bridge-choices-preview";
    for (const choice of choices) {
      const label = typeof choice === "string" ? choice : choice?.label || choice?.text;
      paragraph(list, label, "bridge-choice-preview");
    }
    content.append(list);
  }
  if (!content.childNodes.length)
    paragraph(content, "Пакет получен. Полный JSON доступен в служебном меню.", "story-narration");
  page.replaceChildren(content);
  const scene = reply.scene_state || packet.scene_state || packet.scene || {};
  if (scene && typeof scene === "object") {
    if (scene.scene_number != null) $("scene-title").textContent = "Сцена " + scene.scene_number;
    if (scene.location_detail) $("scene-location").textContent = scene.location_detail;
    if (scene.day != null) $("world-day").textContent = "День " + scene.day;
    if (scene.time_label) $("world-time").textContent = scene.time_label;
  }
}

if (!(status && signIn && signOut && refresh && cfg.supabaseUrl && cfg.publishableKey && cfg.gatewayUrl)) {
  say("Ошибка: параметры подключения пакетов не настроены.", "error");
} else {
  const sb = createClient(cfg.supabaseUrl, cfg.publishableKey, {
    auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: "implicit", storage: window.sessionStorage,
    },
  });
  let busy = false, connected = false;
  async function getSession() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    connected = Boolean(data.session?.access_token);
    if (authPanel) authPanel.hidden = connected;
    signOut.hidden = !connected;
    refresh.disabled = !connected;
    return data.session;
  }
  async function poll() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const session = await getSession();
      if (!session) {
        say("Войди через Supabase Auth, чтобы получать игровые JSON-пакеты.");
        return;
      }
      const url = new URL(cfg.gatewayUrl);
      url.searchParams.set("after", cursor());
      const res = await fetch(url.toString(), {
        method: "GET", mode: "cors", cache: "no-store", credentials: "omit",
        headers: { "Authorization": "Bearer " + session.access_token, "apikey": cfg.publishableKey },
      });
      if (res.status === 204) { say("Подключено. Ожидаю JSON-пакет от Пятницы.", "ready"); return; }
      if (res.status === 401 || res.status === 403) {
        say("Доступ отклонён. Проверь учётную запись Supabase Auth.", "error"); return;
      }
      if (!res.ok) throw Error("HTTP " + res.status);
      const exactJson = await res.text();
      const expected = res.headers.get("X-Packet-Sha256") || "";
      const sequence = res.headers.get("X-Packet-Sequence") || "";
      const kind = res.headers.get("X-Packet-Kind") || "scene";
      if (!expected || !/^[0-9]{1,16}$/.test(sequence))
        throw Error("Не получены данные для проверки целостности.");
      if ((await hash(exactJson)) !== expected.toLowerCase())
        throw Error("SHA-256 пакета не совпала.");
      const packet = JSON.parse(exactJson);
      if (!packet || typeof packet !== "object" || Array.isArray(packet))
        throw Error("Ожидался JSON-объект.");
      rawView.textContent = exactJson; // The full JSON, never a shortened excerpt.
      packetLabel.textContent = "№" + sequence + " · целостность проверена · " + exactJson.length + " символов";
      showScene(packet, kind);
      sessionStorage.setItem(CURSOR_KEY, sequence);
      say("Пакет №" + sequence + " получен полностью. SHA-256 совпала.", "ready");
    } catch (e) {
      say("Ошибка приёма JSON: " + String(e?.message || e), "error");
    } finally { busy = false; }
  }
  signIn.addEventListener("click", async () => {
    const email = emailField?.value?.trim() || "";
    if (!email.includes("@")) { say("Введи почту существующей учётной записи Supabase Auth.", "error"); return; }
    signIn.disabled = true;
    try {
      const redirect = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOtp({
        email, options: { shouldCreateUser: false, emailRedirectTo: redirect },
      });
      if (error) throw error;
      say("Письмо отправлено. Перейди по ссылке из письма.");
    } catch (e) { say("Ошибка отправки письма: " + String(e?.message || e), "error"); }
    finally { signIn.disabled = false; }
  });
  signOut.addEventListener("click", async () => {
    await sb.auth.signOut();
    connected = false;
    if (authPanel) authPanel.hidden = false;
    signOut.hidden = true;
    refresh.disabled = true;
    say("Выход выполнен.");
  });
  refresh.addEventListener("click", () => { void poll(); });
  sb.auth.onAuthStateChange(() => { void getSession().then(s => { if (s) void poll(); }); });
  void getSession().then(s => { if (s) void poll(); else say("Ожидаю вход через Supabase Auth."); })
    .catch(e => say("Ошибка авторизации: " + String(e?.message || e), "error"));
  setInterval(() => { if (connected && !document.hidden) void poll(); }, 8000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && connected) void poll(); });
}
