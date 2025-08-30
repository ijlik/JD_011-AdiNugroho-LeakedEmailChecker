const scanBtn = document.getElementById("scanBtn");
const status = document.getElementById("status");
const resultsList = document.getElementById("resultsList");

// Load previous results when popup opens
document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = tab.url;
  
  // Get stored results for this tab
  const stored = await chrome.storage.local.get(`popup_results_${tabUrl}`);
  const savedData = stored[`popup_results_${tabUrl}`];
  
  if (savedData && savedData.results && savedData.emails) {
    // Show previous results
    displayResults(savedData.emails, savedData.results);
    status.textContent = "Showing previous scan results. Click 'Rescan' to scan again.";
    scanBtn.textContent = "Rescan page for emails";
  }
});

async function displayResults(emails, results) {
  resultsList.innerHTML = "";
  emails.forEach(e => {
    const r = results[e];
    console.log(`Email ${e}:`, r); // Debug log for each email
    const li = document.createElement("li");
    li.innerHTML = `<strong>${e}</strong><br>${r && r.success && r.breaches_found > 0 ? `⚠️ ${r.breaches_found} breach(es)` : "✅ No known leaks" } <button data-email="${e}" class="detailsBtn">Details</button>`;
    resultsList.appendChild(li);
  });
  
  // add click handlers
  document.querySelectorAll(".detailsBtn").forEach(b => {
    b.addEventListener("click", (ev) => {
      const email = ev.target.dataset.email;
      // open details page (extension page)
      chrome.tabs.create({ url: chrome.runtime.getURL(`result.html?email=${encodeURIComponent(email)}`) });
    });
  });
}

scanBtn.addEventListener("click", async () => {
  resultsList.innerHTML = "";
  status.textContent = "Scanning page...";
  scanBtn.textContent = "Scan page for emails";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // run script to extract visible emails
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Email validation function (same as background.js)
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
      
      // find text nodes with email-like text and validate them
      const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
      const found = new Set();
      function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const m = node.textContent.match(EMAIL);
          if (m) {
            // Validate each found email before adding
            m.forEach(e => {
              if (isValidEmail(e)) {
                found.add(e);
              }
            });
          }
        } else {
          for (let child of node.childNodes) {
            // skip script/style
            if (child.nodeName === "SCRIPT" || child.nodeName === "STYLE") continue;
            walk(child);
          }
        }
      }
      walk(document.body);
      return Array.from(found);
    }
  }, async (frames) => {
    const emails = frames && frames[0] && frames[0].result ? frames[0].result : [];
    if (!emails.length) {
      status.textContent = "No emails found on the page.";
      scanBtn.textContent = "Scan page for emails";
      return;
    }
    status.textContent = `Found ${emails.length} email(s). Checking...`;
    // bulk check via background
    chrome.runtime.sendMessage({ type: "bulk-check-emails", emails }, async (res) => {
      console.log("Bulk check response:", res); // Debug log
      if (!res || !res.results) {
        status.textContent = "Error checking emails.";
        return;
      }
      
      const results = res.results;
      
      // Save results to storage for this tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabUrl = tab.url;
      const saveData = {
        emails: emails,
        results: results,
        timestamp: Date.now()
      };
      const storageKey = `popup_results_${tabUrl}`;
      const storageObj = {};
      storageObj[storageKey] = saveData;
      await chrome.storage.local.set(storageObj);
      
      // Display results
      displayResults(emails, results);
      status.textContent = "Done. Click Details for more info.";
      scanBtn.textContent = "Rescan page for emails";
    });
  });
});