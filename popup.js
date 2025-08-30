const scanBtn = document.getElementById("scanBtn");
const resetBtn = document.getElementById("resetBtn");
const status = document.getElementById("status");
const resultsList = document.getElementById("resultsList");

// Debouncing utilities to prevent rapid clicks
let isScanning = false;
let detailsClickDebounce = new Set(); // Track which emails are being processed
const DEBOUNCE_DELAY = 500; // 500ms debounce

// Queue management for real-time updates
let currentResults = {};
let allEmails = [];
let processingQueue = false;

function debounceDetailsClick(email, callback) {
  if (detailsClickDebounce.has(email)) {
    return; // Already processing this email
  }
  
  detailsClickDebounce.add(email);
  callback();
  
  setTimeout(() => {
    detailsClickDebounce.delete(email);
  }, DEBOUNCE_DELAY);
}

// Listen for real-time updates via storage polling when queue is active
let pollInterval = null;

function startPollingForUpdates(tabUrl) {
  if (pollInterval) return; // Already polling
  
  console.log('Starting polling for updates, tabUrl:', tabUrl);
  
  pollInterval = setInterval(async () => {
    if (!processingQueue) {
      console.log('Processing queue finished, stopping polling');
      stopPollingForUpdates();
      return;
    }
    
    console.log('Polling for updates...');
    const storageKey = `popup_results_${tabUrl}`;
    const stored = await chrome.storage.local.get(storageKey);
    const data = stored[storageKey];
    
    console.log('Polled data:', data);
    
    if (data && data.results) {
      // Check for updates
      let hasUpdates = false;
      for (const email of allEmails) {
        const oldResult = JSON.stringify(currentResults[email]);
        const newResult = JSON.stringify(data.results[email]);
        if (oldResult !== newResult) {
          console.log(`Update detected for ${email}:`, data.results[email]);
          hasUpdates = true;
          currentResults[email] = data.results[email];
          updateEmailDisplay(email, data.results[email]);
        }
      }
      
      if (hasUpdates) {
        // Update progress status
        const pending = allEmails.filter(e => 
          !currentResults[e] || currentResults[e].status === 'pending'
        );
        
        console.log(`Pending emails: ${pending.length}/${allEmails.length}`);
        
        if (pending.length === 0) {
          status.textContent = `Done. All ${allEmails.length} emails checked. Click Details for more info.`;
          processingQueue = false;
          isScanning = false;
          scanBtn.disabled = false;
          scanBtn.textContent = "Rescan page for emails";
          resetBtn.style.display = "none";
          stopPollingForUpdates();
        } else {
          status.textContent = `Checking emails... ${allEmails.length - pending.length}/${allEmails.length} completed`;
        }
      }
    }
  }, 1000); // Poll every second
}

function stopPollingForUpdates() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Listen for queue progress updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'queue-progress-update') {
    const { email, result, allEmails: messageAllEmails } = message;
    
    // Update our current results
    currentResults[email] = result;
    
    // Update the display
    updateEmailDisplay(email, result);
    
    // Check if all emails are processed
    const pending = messageAllEmails.filter(e => 
      !currentResults[e] || currentResults[e].status === 'pending'
    );
    
    if (pending.length === 0) {
      status.textContent = `Done. All ${messageAllEmails.length} emails checked. Click Details for more info.`;
      processingQueue = false;
      isScanning = false;
      scanBtn.disabled = false;
      scanBtn.textContent = "Rescan page for emails";
      stopPollingForUpdates();
    } else {
      status.textContent = `Checking emails... ${messageAllEmails.length - pending.length}/${messageAllEmails.length} completed`;
    }
  }
});

// Load previous results when popup opens
document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = tab.url;
  
  // Get stored results for this tab
  const stored = await chrome.storage.local.get(`popup_results_${tabUrl}`);
  const savedData = stored[`popup_results_${tabUrl}`];
  
  if (savedData && savedData.results && savedData.emails) {
    // Show previous results
    currentResults = savedData.results;
    allEmails = savedData.emails;
    displayResults(savedData.emails, savedData.results);
    
    // Check if there are pending emails (processing in progress)
    const pending = savedData.emails.filter(e => 
      !savedData.results[e] || savedData.results[e].status === 'pending'
    );
    
    if (pending.length > 0) {
      // Processing is ongoing
      status.textContent = `Processing... ${savedData.emails.length - pending.length}/${savedData.emails.length} completed`;
      processingQueue = true;
      isScanning = true;
      scanBtn.disabled = true;
      scanBtn.textContent = "Processing...";
      resetBtn.style.display = "inline-block"; // Show reset button when stuck
      startPollingForUpdates(tabUrl);
    } else {
      // All done
      status.textContent = "Showing previous scan results. Click 'Rescan' to scan again.";
      scanBtn.textContent = "Rescan page for emails";
      resetBtn.style.display = "none";
    }
  }
});

function getEmailStatus(email, result) {
  if (!result) return { status: 'pending', icon: '⏳', text: 'Pending...' };
  if (result.error) return { status: 'error', icon: '❌', text: `Error: ${result.message}` };
  if (result.status === 'pending') return { status: 'pending', icon: '⏳', text: 'Queued for checking...' };
  
  // Valid result
  if (result.success && result.breaches_found > 0) {
    return { status: 'leaked', icon: '⚠️', text: `${result.breaches_found} breach(es) found` };
  } else {
    return { status: 'safe', icon: '✅', text: 'No known leaks' };
  }
}

function updateEmailDisplay(email, result) {
  const emailElement = document.querySelector(`[data-email="${email}"]`);
  if (!emailElement) return;
  
  const statusInfo = getEmailStatus(email, result);
  const li = emailElement.closest('li');
  
  li.innerHTML = `
    <strong>${email}</strong><br>
    <span class="status-${statusInfo.status}">
      ${statusInfo.icon} ${statusInfo.text}
    </span>
    ${statusInfo.status !== 'pending' && statusInfo.status !== 'error' ? 
      `<button data-email="${email}" class="detailsBtn">Details</button>` : 
      ''
    }
  `;
  
  // Re-add click handlers if details button exists
  const newDetailsBtn = li.querySelector('.detailsBtn');
  if (newDetailsBtn) {
    addDetailsClickHandler(newDetailsBtn);
  }
}

async function displayResults(emails, results) {
  resultsList.innerHTML = "";
  allEmails = emails;
  currentResults = results;
  
  emails.forEach(email => {
    const result = results[email];
    const statusInfo = getEmailStatus(email, result);
    
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${email}</strong><br>
      <span class="status-${statusInfo.status}">
        ${statusInfo.icon} ${statusInfo.text}
      </span>
      ${statusInfo.status !== 'pending' && statusInfo.status !== 'error' ? 
        `<button data-email="${email}" class="detailsBtn">Details</button>` : 
        ''
      }
    `;
    resultsList.appendChild(li);
  });
  
  // Add click handlers for all details buttons
  document.querySelectorAll(".detailsBtn").forEach(addDetailsClickHandler);
}

function addDetailsClickHandler(btn) {
  btn.addEventListener("click", (e) => {
    const email = e.target.getAttribute("data-email");
    
    debounceDetailsClick(email, () => {
      // Visual feedback
      e.target.style.opacity = "0.5";
      e.target.disabled = true;
      e.target.textContent = "Opening...";
      
      const detailsUrl = chrome.runtime.getURL(`result.html?email=${encodeURIComponent(email)}`);
      chrome.runtime.sendMessage({ 
        type: "open-details-tab", 
        url: detailsUrl 
      });
      
      // Reset button after delay
      setTimeout(() => {
        e.target.style.opacity = "1";
        e.target.disabled = false;
        e.target.textContent = "Details";
      }, 2000);
    });
  });
}

async function displayResults(emails, results) {
  resultsList.innerHTML = "";
  emails.forEach(e => {
    const r = results[e];
    console.log(`Email ${e}:`, r); // Debug log for each email
    const li = document.createElement("li");
    li.innerHTML = `<strong>${e}</strong><br>${r && r.success && r.breaches_found > 0 ? `⚠️ ${r.breaches_found} breach(es)` : "✅ No known leaks" } <button data-email="${e}" class="detailsBtn">Details</button>`;
    resultsList.appendChild(li);
  });
  
  // add click handlers with debouncing
  document.querySelectorAll(".detailsBtn").forEach(b => {
    b.addEventListener("click", (ev) => {
      const email = ev.target.dataset.email;
      
      // Debounce to prevent multiple tabs for same email
      debounceDetailsClick(email, () => {
        // Disable button temporarily
        ev.target.disabled = true;
        ev.target.textContent = "Opening...";
        
        // open details page (extension page)
        chrome.tabs.create({ url: chrome.runtime.getURL(`result.html?email=${encodeURIComponent(email)}`) });
        
        // Re-enable button after delay
        setTimeout(() => {
          ev.target.disabled = false;
          ev.target.textContent = "Details";
        }, DEBOUNCE_DELAY);
      });
    });
  });
}

scanBtn.addEventListener("click", async () => {
  // Prevent multiple simultaneous scans
  if (isScanning) {
    return;
  }
  
  isScanning = true;
  scanBtn.disabled = true;
  resetBtn.style.display = "inline-block"; // Show reset button during processing
  resultsList.innerHTML = "";
  status.textContent = "Scanning page...";
  scanBtn.textContent = "Scanning...";
  
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
    const allFoundEmails = frames && frames[0] && frames[0].result ? frames[0].result : [];
    if (!allFoundEmails.length) {
      status.textContent = "No emails found on the page.";
      scanBtn.textContent = "Scan page for emails";
      // Re-enable scan button
      isScanning = false;
      scanBtn.disabled = false;
      return;
    }
    
    // Show all emails found
    allEmails = allFoundEmails;
    status.textContent = `Found ${allFoundEmails.length} email(s). Starting queue processing (10 emails per minute)...`;
    
    // Initialize results with pending status
    currentResults = {};
    allFoundEmails.forEach(email => {
      currentResults[email] = { status: 'pending', message: 'Queued for checking...' };
    });
    
    // Display initial results with pending status
    displayResults(allFoundEmails, currentResults);
    processingQueue = true;
    
    // bulk check via background with queue system
    chrome.runtime.sendMessage({ type: "bulk-check-emails", emails: allFoundEmails }, async (res) => {
      console.log("Bulk check initial response:", res); // Debug log
      if (!res || res.error) {
        status.textContent = res ? res.message : "Error checking emails.";
        // Re-enable scan button on error
        isScanning = false;
        scanBtn.disabled = false;
        scanBtn.textContent = "Scan page for emails";
        processingQueue = false;
        return;
      }
      
      // Initial response contains pending results, real updates come via storage polling
      if (res.queueStatus === 'started') {
        status.textContent = `Queue started. Processing ${allFoundEmails.length} emails at 10 per minute...`;
        
        // Start polling for updates
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabUrl = tab.url;
        startPollingForUpdates(tabUrl);
        
        // Save initial state to storage
        const saveData = {
          emails: allFoundEmails,
          results: currentResults,
          timestamp: Date.now()
        };
        const storageKey = `popup_results_${tabUrl}`;
        const storageObj = {};
        storageObj[storageKey] = saveData;
        await chrome.storage.local.set(storageObj);
      }
    });
  });
});

// Reset button handler
resetBtn.addEventListener("click", async () => {
  console.log("Reset button clicked - clearing state");
  
  // Stop polling
  stopPollingForUpdates();
  
  // Reset state
  isScanning = false;
  processingQueue = false;
  currentResults = {};
  allEmails = [];
  
  // Clear UI
  resultsList.innerHTML = "";
  status.textContent = "Reset complete. Click scan to find emails.";
  scanBtn.disabled = false;
  scanBtn.textContent = "Scan page for emails";
  resetBtn.style.display = "none";
  
  // Clear storage for current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    const storageKey = `popup_results_${tab.url}`;
    await chrome.storage.local.remove(storageKey);
    console.log(`Cleared storage for key: ${storageKey}`);
  }
});