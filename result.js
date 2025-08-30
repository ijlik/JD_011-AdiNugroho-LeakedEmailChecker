async function fetchDetails(email) {
  const res = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "check-email", email }, r => resolve(r));
  });
  return res;
}

(async () => {
  const params = new URLSearchParams(location.search);
  const email = params.get("email");
  document.getElementById("emailTitle").textContent = `Oh no — Your email "${email}" is in a data breach!`;
  const r = await fetchDetails(email);
  const area = document.getElementById("detailArea");
  if (!r) return area.textContent = "No response.";
  if (r.error) return area.textContent = "Error: " + r.message;
  const data = r.data;
  if (!data || !data.success || data.breaches_found === 0) {
    document.getElementById("emailTitle").textContent = `Good news — Your email "${email}" was not found in any data breaches!`;
    area.innerHTML = "<p>No known breaches for this email.</p>";
    return;
  }
  
  // Add subtitle
  area.innerHTML = `<p class="subtitle">Breaches you were pwned in</p>`;
  
  const breaches = data.data || [];
  const breachesContainer = document.createElement("div");
  breachesContainer.className = "breaches-container";
  
  breaches.forEach(b => {
    const breachCard = document.createElement("div");
    breachCard.className = "breach-card";
    
    const breachDate = new Date(b.breach_date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
    
    const description = b.description || "No description available";
    const compromisedData = b.data_classes?.join(", ") || "Unknown";
    
    breachCard.innerHTML = `
      <div class="breach-logo">
        <img src="${b.logo_path || 'icons/icon48.png'}" alt="${b.title || b.name}" onerror="this.src='icons/icon48.png'">
      </div>
      <div class="breach-content">
        <div class="breach-header">
          <strong>In ${breachDate}, the ${b.title || b.name} ${b.domain ? `service` : 'platform'} suffered a data breach${b.domain ? ` of their ${b.domain} service` : ''}.</strong>
        </div>
        <div class="breach-description">
          ${description}
        </div>
        <div class="breach-data">
          <strong>Compromised data:</strong> ${compromisedData}
        </div>
      </div>
    `;
    breachesContainer.appendChild(breachCard);
  });
  
  area.appendChild(breachesContainer);
  
  // actionable advice
  const advice = document.createElement("div");
  advice.className = "recommendations";
  advice.innerHTML = `<h3>Recommended actions</h3>
    <ol>
      <li>Change your password on affected services and any reuse across sites.</li>
      <li>Enable 2-factor authentication (2FA) where possible.</li>
      <li>Use a password manager to create unique passwords.</li>
      <li>Monitor accounts for suspicious activity.</li>
    </ol>`;
  area.appendChild(advice);
})();
