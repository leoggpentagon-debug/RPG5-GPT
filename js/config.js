// Separate RPG5-GPT frontend. The old RPG6/Gemini API remains disabled.
window.RPG6_CONFIG = Object.freeze({
  mode: "rpg5-gpt-disconnected",
  supabaseUrl: "",
  publishableKey: "",
  edgeFunction: "",
});

// Public client configuration only. No service_role or OpenAI credentials.
window.RPG5_GPT_CONFIG = Object.freeze({
  deployment: "github-pages",
  supabaseUrl: "https://ltubfxamcrfogwmidsup.supabase.co",
  publishableKey: "sb_publishable_0QIldokYIxZSD7ElfvvW2Q_KLP8fkmQ",
  gatewayUrl: "https://ltubfxamcrfogwmidsup.supabase.co/functions/v1/rpg5-packet-bridge",
  gatewayProtocolVersion: 1,
  access: "supabase-auth",
});
