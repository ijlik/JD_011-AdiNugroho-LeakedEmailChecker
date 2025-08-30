const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
let inputDebounce = null;

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function createTooltip(text) {
  const el = document.createElement("div");
  el.className = "le-ch-tooltip";
  el.textContent = text;
  el.style.position = "absolute";
  el.style.zIndex = 2147483647;
  el.style.background = "#fff";
  el.style.border = "1px solid #ddd";
  el.style.padding = "6px 8px";
  el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  el.style.borderRadius = "6px";
  el.style.fontSize = "12px";
  return el;
}

function createClickableTooltip(text, email, breaches) {
  const el = document.createElement("div");
  el.className = "le-ch-tooltip";
  el.innerHTML = `${text} <span style="color: #2c5aa0; text-decoration: underline; cursor: pointer; font-weight: bold;">(Click for details)</span>`;
  el.style.position = "absolute";
  el.style.zIndex = 2147483647;
  el.style.background = "#fff";
  el.style.border = "1px solid #ddd";
  el.style.padding = "6px 8px";
  el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  el.style.borderRadius = "6px";
  el.style.fontSize = "12px";
  el.style.cursor = "pointer";
  el.style.userSelect = "none";
  
  // Add click handler
  el.addEventListener("click", () => {
    const detailsUrl = chrome.runtime.getURL(`result.html?email=${encodeURIComponent(email)}`);
    chrome.runtime.sendMessage({ 
      type: "open-details-tab", 
      url: detailsUrl 
    });
    el.remove();
  });
  
  // Add hover effect
  el.addEventListener("mouseenter", () => {
    el.style.background = "#f0f8ff";
    el.style.borderColor = "#2c5aa0";
  });
  
  el.addEventListener("mouseleave", () => {
    el.style.background = "#fff";
    el.style.borderColor = "#ddd";
  });
  
  return el;
}

function showNearbyTooltip(target, text) {
  removeTooltips();
  const rect = target.getBoundingClientRect();
  const tip = createTooltip(text);
  document.body.appendChild(tip);
  // simple positioning
  tip.style.left = window.scrollX + rect.left + "px";
  tip.style.top = window.scrollY + (rect.bottom + 6) + "px";
  tip.dataset.leTooltip = "1";
  setTimeout(() => tip.remove(), 6000);
}

function removeTooltips() {
  document.querySelectorAll('[data-le-tooltip]').forEach(n => n.remove());
}

// When user types into inputs
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (!t) return;
  const tag = t.tagName && t.tagName.toLowerCase();
  if (!(tag === "input" || tag === "textarea")) return;

  const type = t.getAttribute("type") || "";
  if (type && type !== "email" && type !== "text" && tag === "input") return;

  if (inputDebounce) clearTimeout(inputDebounce);
  inputDebounce = setTimeout(() => {
    const val = t.value && t.value.trim();
    if (val && isEmail(val)) {
      // send to background to check
      chrome.runtime.sendMessage({ type: "check-email", email: val }, (res) => {
        if (!res) return;
        if (res.error) {
          showNearbyTooltip(t, `Error checking: ${res.message}`);
          return;
        }
        const data = res.data;
        if (data && data.success && data.breaches_found > 0) {
          // Use clickable tooltip for breached emails
          removeTooltips();
          const rect = t.getBoundingClientRect();
          const tip = createClickableTooltip(`⚠️ Email leaked: ${data.breaches_found} breach(es).`, val, data.breaches_found);
          document.body.appendChild(tip);
          tip.style.left = window.scrollX + rect.left + "px";
          tip.style.top = window.scrollY + (rect.bottom + 6) + "px";
          tip.dataset.leTooltip = "1";
          setTimeout(() => tip.remove(), 8000); // Longer timeout for clickable tooltip
        } else {
          showNearbyTooltip(t, `✅ No known leaks found.`);
        }
      });
    }
  }, 700);
});

// Listen for context menu check result to show inline near selection
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "context-check-result") {
    // Try to find selection and show tooltip
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const el = document.createElement("div");
      el.className = "le-ch-context-popup";
      el.style.position = "absolute";
      el.style.zIndex = 2147483647;
      el.style.background = "#fff";
      el.style.border = "1px solid #ddd";
      el.style.padding = "6px 8px";
      el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
      el.style.borderRadius = "6px";
      el.style.fontSize = "12px";
      el.style.left = window.scrollX + rect.left + "px";
      el.style.top = window.scrollY + (rect.bottom + 6) + "px";
      if (msg.result.error) {
        el.textContent = `Error: ${msg.result.message}`;
      } else {
        const d = msg.result.data;
        const hasBreaches = d && d.success && d.breaches_found > 0;
        
        if (hasBreaches) {
          // Make it clickable for breached emails
          el.innerHTML = `⚠️ Leaked — ${d.breaches_found} breach(es) <span style="color: #2c5aa0; text-decoration: underline; cursor: pointer; font-weight: bold;">(Click for details)</span>`;
          el.style.cursor = "pointer";
          el.style.userSelect = "none";
          
          // Add click handler to open details page
          el.addEventListener("click", () => {
            const detailsUrl = chrome.runtime.getURL(`result.html?email=${encodeURIComponent(msg.email)}`);
            chrome.runtime.sendMessage({ 
              type: "open-details-tab", 
              url: detailsUrl 
            });
            el.remove(); // Remove tooltip after clicking
          });
          
          // Add hover effect
          el.addEventListener("mouseenter", () => {
            el.style.background = "#f0f8ff";
            el.style.borderColor = "#2c5aa0";
          });
          
          el.addEventListener("mouseleave", () => {
            el.style.background = "#fff";
            el.style.borderColor = "#ddd";
          });
        } else {
          el.textContent = "✅ No known leaks";
        }
      }
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 7000);
    } else {
      // fallback notify - check if email has breaches to make it actionable
      const hasBreaches = !msg.result.error && msg.result.data && msg.result.data.success && msg.result.data.breaches_found > 0;
      const message = msg.result.error ? msg.result.message : (hasBreaches ? `${msg.result.data.breaches_found} breach(es) found` : "No known leaks");
      
      if (hasBreaches) {
        // Show confirm dialog for breached emails
        const userWantsDetails = confirm(`${msg.email}: ${message}\n\nClick OK to view detailed breach information.`);
        if (userWantsDetails) {
          const detailsUrl = chrome.runtime.getURL(`result.html?email=${encodeURIComponent(msg.email)}`);
          chrome.runtime.sendMessage({ 
            type: "open-details-tab", 
            url: detailsUrl 
          });
        }
      } else {
        // Simple alert for non-breached emails
        alert(msg.email + ": " + message);
      }
    }
  }
});