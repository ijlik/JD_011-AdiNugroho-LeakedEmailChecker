const scanBtn = document.getElementById("scanBtn");
const status = document.getElementById("status");
const resultsList = document.getElementById("resultsList");

scanBtn.addEventListener("click", async () => {
  resultsList.innerHTML = "";
  status.textContent = "Scanning page...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // run script to extract visible emails
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // find text nodes with email-like text (simple)
      const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
      const found = new Set();
      function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const m = node.textContent.match(EMAIL);
          if (m) m.forEach(e => found.add(e));
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
      return;
    }
    status.textContent = `Found ${emails.length} email(s). Checking...`;
    // bulk check via background
    chrome.runtime.sendMessage({ type: "bulk-check-emails", emails }, (res) => {
      console.log("Bulk check response:", res); // Debug log
      if (!res || !res.results) {
        status.textContent = "Error checking emails.";
        return;
      }
      resultsList.innerHTML = "";
      const results = res.results;
      emails.forEach(e => {
        const r = results[e];
        console.log(`Email ${e}:`, r); // Debug log for each email
        const li = document.createElement("li");
        li.innerHTML = `<strong>${e}</strong><br>${r && r.success && r.breaches_found > 0 ? `⚠️ ${r.breaches_found} breach(es)` : "✅ No known leaks" } <button data-email="${e}" class="detailsBtn">Details</button>`;
        resultsList.appendChild(li);
      });
      status.textContent = "Done. Click Details for more info.";
      // add click handlers
      document.querySelectorAll(".detailsBtn").forEach(b => {
        b.addEventListener("click", (ev) => {
          const email = ev.target.dataset.email;
          // open details page (extension page)
          chrome.tabs.create({ url: chrome.runtime.getURL(`result.html?email=${encodeURIComponent(email)}`) });
        });
      });
    });
  });
});