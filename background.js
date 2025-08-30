const API_BASE = "https://email-check.bitlion.io/api/search";
// const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_TTL_MS = 1 * 1000; // 1 second

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,
  INTERVAL_MS: 60 * 1000, // 1 minute
  requestQueue: [],
  processing: false,
  requestCount: 0,
  lastReset: Date.now()
};

// Email validation helper function
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  // Basic email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) return false;
  if (email.length > 320) return false; // RFC 5321 limit
  
  const localPart = email.split('@')[0];
  if (localPart.length > 64) return false; // RFC 5321 limit
  
  return true;
}

// Rate limiting and queue management
function resetRateLimit() {
  const now = Date.now();
  if (now - RATE_LIMIT.lastReset >= RATE_LIMIT.INTERVAL_MS) {
    RATE_LIMIT.requestCount = 0;
    RATE_LIMIT.lastReset = now;
  }
}

function canMakeRequest() {
  resetRateLimit();
  return RATE_LIMIT.requestCount < RATE_LIMIT.MAX_REQUESTS_PER_MINUTE;
}

function processQueue() {
  if (RATE_LIMIT.processing || RATE_LIMIT.requestQueue.length === 0) {
    return;
  }
  
  RATE_LIMIT.processing = true;
  
  const processNext = async () => {
    if (RATE_LIMIT.requestQueue.length === 0) {
      RATE_LIMIT.processing = false;
      return;
    }
    
    if (!canMakeRequest()) {
      // Wait until next minute to process more
      const timeToWait = RATE_LIMIT.INTERVAL_MS - (Date.now() - RATE_LIMIT.lastReset);
      setTimeout(processNext, timeToWait);
      return;
    }
    
    const { email, resolve, reject, sendUpdate } = RATE_LIMIT.requestQueue.shift();
    RATE_LIMIT.requestCount++;
    
    try {
      const result = await callApi(email);
      resolve(result);
      // Notify popup of the update
      if (sendUpdate) {
        sendUpdate(email, result);
      }
    } catch (error) {
      reject(error);
      if (sendUpdate) {
        sendUpdate(email, { error: true, message: error.message });
      }
    }
    
    // Process next item with a small delay
    setTimeout(processNext, 100);
  };
  
  processNext();
}

function queueEmailCheck(email, sendUpdate) {
  return new Promise((resolve, reject) => {
    RATE_LIMIT.requestQueue.push({ email, resolve, reject, sendUpdate });
    processQueue();
  });
}

// create context menu - initially hidden
chrome.runtime.onInstalled.addListener(() => {
  // Don't create context menu on install - it will be created dynamically
});

// Handle dynamic context menu creation based on selection
let currentContextMenuId = null;

function createContextMenuForEmail() {
  if (currentContextMenuId) return; // Already exists
  
  chrome.contextMenus.create({
    id: "check-email-selection",
    title: "Check if leaked",
    contexts: ["selection"]
  }, () => {
    if (!chrome.runtime.lastError) {
      currentContextMenuId = "check-email-selection";
    }
  });
}

function removeContextMenu() {
  if (!currentContextMenuId) return; // Already removed
  
  chrome.contextMenus.remove(currentContextMenuId, () => {
    currentContextMenuId = null;
  });
}

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
  
  // Validate email format - if not valid, silently ignore
  if (!email || !isValidEmail(email)) {
    return; // Don't show any notification, just ignore
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
    // msg.emails: array, sender: popup tab info
    (async () => {
      try {
        const results = {};
        const emailStatuses = {};
        
        // Initialize all emails as pending
        for (const email of msg.emails) {
          results[email] = { status: 'pending', message: 'Queued for checking...' };
          emailStatuses[email] = 'pending';
        }
        
        // Send initial response with all emails pending
        sendResponse({ 
          results: results, 
          allEmails: msg.emails,
          queueStatus: 'started' 
        });
        
        // Function to update storage with progress
        const updateProgress = async (email, result) => {
          try {
            // Get current tab to determine storage key
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
              const tabUrl = tabs[0].url;
              const storageKey = `popup_results_${tabUrl}`;
              const stored = await chrome.storage.local.get(storageKey);
              
              if (stored[storageKey]) {
                const data = stored[storageKey];
                data.results[email] = result.error ? 
                  { error: true, message: result.message } : 
                  result.data;
                data.timestamp = Date.now();
                
                const storageObj = {};
                storageObj[storageKey] = data;
                await chrome.storage.local.set(storageObj);
                
                // Broadcast update to any listening popups
                chrome.runtime.sendMessage({
                  type: 'queue-progress-update',
                  email: email,
                  result: result.error ? { error: true, message: result.message } : result.data,
                  allEmails: msg.emails,
                  tabUrl: tabUrl
                }).catch(() => {
                  // Popup might be closed, that's OK
                });
              }
            }
          } catch (error) {
            console.error('Error updating progress:', error);
          }
        };
        
        // Queue all emails for processing
        for (const email of msg.emails) {
          queueEmailCheck(email, updateProgress).then(result => {
            results[email] = result.error ? 
              { error: true, message: result.message } : 
              result.data;
            emailStatuses[email] = 'completed';
          }).catch(error => {
            results[email] = { error: true, message: error.message };
            emailStatuses[email] = 'error';
          });
        }
        
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

  if (msg && msg.type === "selection-changed") {
    // Handle selection change for dynamic context menu
    if (msg.hasSelection && isValidEmail(msg.text)) {
      createContextMenuForEmail();
    } else {
      removeContextMenu();
    }
    return true;
  }
});