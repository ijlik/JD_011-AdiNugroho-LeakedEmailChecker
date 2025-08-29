const API_BASE = "https://email-check.bitlion.io/api/search";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "check-email-selection",
    title: "Check if leaked",
    contexts: ["selection", "link", "editable"]
  });
});

// helper: get cache
async function getCached(email) {
  const data = await chrome.storage.local.get(email);
  if (!data[email]) return null;
  const { result, ts } = data[email];
  if (Date.now() - ts < CACHE_TTL_MS) return result;
  return null;
}

async function setCache(email, result) {
  const payload = { result, ts: Date.now() };
  const obj = {};
  obj[email] = payload;
  await chrome.storage.local.set(obj);
}

async function callApi(email) {
  // Try cached
  const cached = await getCached(email);
  if (cached) return { source: "cache", data: cached };

  // fetch via proxy
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    await setCache(email, data);
    return { source: "network", data };
  } catch (err) {
    console.error("callApi error", err);
    return { error: true, message: err.message };
  }
}

// context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let email = info.selectionText || "";
  if (!email && info.linkUrl && info.linkUrl.startsWith("mailto:")) {
    email = info.linkUrl.replace(/^mailto:/i, "");
  }
  email = email && email.trim();
  if (!email) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Leaked Email Checker",
      message: "No email detected to check."
    });
    return;
  }

  const result = await callApi(email);
  // send result to content script so it can show popup near selection
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "context-check-result", email, result });
  } else {
    // fallback notify
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: `Check result for ${email}`,
      message: result.error ? result.message : (result.data.success ? `${result.data.breaches_found} breach(es) found` : "No breaches found")
    });
  }
});

// handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "check-email") {
    callApi(msg.email).then(res => sendResponse(res));
    return true; // async
  }

  if (msg && msg.type === "bulk-check-emails") {
    // msg.emails: array
    (async () => {
      const out = {};
      for (const e of msg.emails) {
        out[e] = (await callApi(e)).data;
      }
      sendResponse({ results: out });
    })();
    return true;
  }
});