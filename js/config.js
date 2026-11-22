// RPG5-GPT: isolated frontend. Legacy Gemini/RPG6 API calls are disabled.
// Configure supported ChatGPT access only after separate verification.
window.RPG6_CONFIG = Object.freeze({
  mode: 'rpg5-gpt-disconnected',
  supabaseUrl: '',
  publishableKey: '',
  edgeFunction: '',
});

// Remote GitHub Pages mode. Empty until the approved OAuth integration
// and a secure, authenticated backend are available.
// The browser must never contain ChatGPT OAuth credentials.
window.RPG5_GPT_CONFIG = Object.freeze({
  deployment: "github-pages-remote",
  gatewayUrl: "",
  gatewayProtocolVersion: 1,
  access: "approval-required",
});
