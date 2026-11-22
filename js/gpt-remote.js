// RPG5-GPT: Remote-only readiness test; no OAuth tokens or API keys in the browser.
(() => {
  "use strict";
  const cfg = window.RPG5_GPT_CONFIG || {};
  const status = document.getElementById("gpt-remote-status");
  const button = document.getElementById("gpt-remote-check");
  if (!status || !button) return;

  function setState(message, state = "waiting") {
    status.dataset.state = state;
    status.textContent = message;
  }

  async function checkGateway() {
    const configured = typeof cfg.gatewayUrl === "string" ? cfg.gatewayUrl.trim() : "";
    if (!configured) {
      setState("GitHub Pages готов для публикации интерфейса. Серверный шлюз и разрешение OpenAI для удалённого использования ChatGPT Plus ещё не настроены.");
      return;
    }
    let url;
    try {
      url = new URL(configured);
      if (url.protocol !== "https:" || url.username || url.password || url.hash)
        throw new Error("Адрес шлюза должен быть HTTPS без встроенных учётных данных.");
      url.searchParams.set("op", "health");
    } catch (err) {
      setState("Ошибка конфигурации шлюза: " + String(err.message || err), "error");
      return;
    }

    const aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 10000);
    button.disabled = true;
    setState("Проверяю готовность удалённого сервера…");
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: { "Accept": "application/json" },
        signal: aborter.signal,
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (data?.service !== "rpg5-gpt" || Number(data?.api_version) !== 1)
        throw new Error("Получен ответ не от ожидаемого RPG5-GPT шлюза.");
      if (data?.auth_ready !== true || data?.plan_usage_ready !== true) {
        setState("Сервер доступен, но авторизация OpenAI и использование подписки ещё не подтверждены.");
        return;
      }
      setState("Сервер сообщил о готовности авторизации. Для включения игровых ходов ещё нужна проверка авторизованного запроса.", "ready");
    } catch (err) {
      setState("Нет подтверждённого соединения со шлюзом: " + String(err.message || err), "error");
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
    }
  }

  button.addEventListener("click", () => { void checkGateway(); });
  void checkGateway();
})();
