const API_BASE = "https://email-check.bitlion.io/api/search";
// const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_TTL_MS = 1 * 1000; // 1 second

// Email validation helper function
function isValidEmail(email) {
  // Basic email regex that matches most valid email formats
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Check basic format
  if (!emailRegex.test(email)) {
    return false;
  }
  
  // Check length limits
  if (email.length > 320) { // RFC 5321 limit
    return false;
  }
  
  // Check local part length (before @)
  const localPart = email.split('@')[0];
  if (localPart.length > 64) { // RFC 5321 limit
    return false;
  }
  
  return true;
}

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
  
  // Check if selection is empty
  if (!email) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Leaked Email Checker",
      message: "No text selected to check."
    });
    return;
  }
  
  // Validate email format
  if (!isValidEmail(email)) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Leaked Email Checker",
      message: `"${email.length > 50 ? email.substring(0, 47) + '...' : email}" is not a valid email address.`
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