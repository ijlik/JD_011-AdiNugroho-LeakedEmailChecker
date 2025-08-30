const API_BASE = "https://email-check.bitlion.io/api/search";
// const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_TTL_MS = 1 * 1000; // 1 second

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
  console.log(`Checking email: ${email}`); // Debug log
  // Try cached
  const cached = await getCached(email);
  if (cached) {
    console.log(`Cache hit for ${email}:`, cached); // Debug log
    return { source: "cache", data: cached };
  }

  // fetch via proxy
  try {
    console.log(`Making API call for ${email}`); // Debug log
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
    console.log(`API response for ${email}:`, data); // Debug log
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
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "context-check-result", email, result });
    } catch (err) {
      // If content script is not available, show notification instead
      console.log("Content script not available, showing notification instead");
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: `Check result for ${email}`,
        message: result.error ? result.message : (result.data.success ? `${result.data.breaches_found} breach(es) found` : "No breaches found")
      });
    }
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
    callApi(msg.email).then(res => {
      try {
        sendResponse(res);
      } catch (err) {
        console.error("Error sending response:", err);
      }
    }).catch(err => {
      console.error("Error in check-email:", err);
      try {
        sendResponse({ error: true, message: err.message });
      } catch (responseErr) {
        console.error("Error sending error response:", responseErr);
      }
    });
    return true; // async
  }

  if (msg && msg.type === "bulk-check-emails") {
    // msg.emails: array
    (async () => {
      try {
        const out = {};
        for (const e of msg.emails) {
          const result = await callApi(e);
          // Store the actual API response data, not the wrapper
          if (result.error) {
            out[e] = { error: true, message: result.message };
          } else {
            out[e] = result.data; // This contains the API response with success, breaches_found, etc.
          }
        }
        sendResponse({ results: out });
      } catch (err) {
        console.error("Error in bulk-check-emails:", err);
        try {
          sendResponse({ error: true, message: err.message });
        } catch (responseErr) {
          console.error("Error sending bulk error response:", responseErr);
        }
      }
    })();
    return true;
  }

  if (msg && msg.type === "open-details-tab") {
    // Open a new tab with the details page
    chrome.tabs.create({ url: msg.url });
    return true;
  }
});