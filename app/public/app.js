document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const appVersionBadge = document.getElementById("app-version-badge");
  const failureRateVal = document.getElementById("failure-rate-val");
  const failureMeterFill = document.getElementById("failure-meter-fill");
  const podHostname = document.getElementById("pod-hostname");
  const serverUptime = document.getElementById("server-uptime");

  const btnSendOrder = document.getElementById("btn-send-order");
  const btnToggleAuto = document.getElementById("btn-toggle-auto");
  const textAutoBtn = document.getElementById("text-auto-btn");
  const iconAutoPlay = document.getElementById("icon-auto-play");
  const btnResetStats = document.getElementById("btn-reset-stats");
  const trafficRateSlider = document.getElementById("traffic-rate-slider");
  const rateDisplay = document.getElementById("rate-display");

  const statTotal = document.getElementById("stat-total-requests");
  const statSuccess = document.getElementById("stat-success-count");
  const statFailure = document.getElementById("stat-failure-count");
  const statSuccessRate = document.getElementById("stat-success-rate");
  const healthBarFill = document.getElementById("health-bar-fill");
  const logsTbody = document.getElementById("logs-tbody");

  // State
  let stats = {
    total: 0,
    success: 0,
    failure: 0,
  };
  let isAutoRunning = false;
  let autoIntervalId = null;
  let hasLogs = false;

  // 1. Fetch server metadata via /api/info
  async function fetchServerInfo() {
    try {
      const res = await fetch("/api/info");
      if (!res.ok) return;
      const data = await res.json();

      // Version badge styling
      const version = data.version || "v1";
      appVersionBadge.textContent = version.toUpperCase();
      appVersionBadge.className = `version-badge ${version.toLowerCase() === "v2" ? "version-v2" : "version-v1"}`;

      // Failure Rate
      const fRate = (data.failureRate || 0) * 100;
      failureRateVal.textContent = `${fRate.toFixed(0)}%`;
      failureMeterFill.style.width = `${Math.min(fRate, 100)}%`;

      // Hostname & Uptime
      podHostname.textContent = data.hostname || "local";
      const uptimeSec = data.uptime || 0;
      const mins = Math.floor(uptimeSec / 60);
      const secs = uptimeSec % 60;
      serverUptime.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    } catch (err) {
      console.warn("Error fetching /api/info:", err);
    }
  }

  // 2. Send Order Request to /api/orders
  async function sendOrderRequest() {
    const startTime = performance.now();
    const timeStr = new Date().toLocaleTimeString();

    stats.total++;
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const data = await res.json();

      if (res.ok) {
        stats.success++;
        appendLogEntry({
          time: timeStr,
          method: "POST /api/orders",
          status: res.status,
          version: data.version || "unknown",
          latency: `${latencyMs}ms`,
          detail: `Order ${data.orderId || "OK"} ($${data.amount || "0.00"})`,
          isSuccess: true,
        });
      } else {
        stats.failure++;
        appendLogEntry({
          time: timeStr,
          method: "POST /api/orders",
          status: res.status,
          version: data.version || "unknown",
          latency: `${latencyMs}ms`,
          detail: data.error || "Order fulfillment failed",
          isSuccess: false,
        });
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      stats.failure++;
      appendLogEntry({
        time: timeStr,
        method: "POST /api/orders",
        status: "NET_ERR",
        version: "--",
        latency: `${latencyMs}ms`,
        detail: err.message || "Network error",
        isSuccess: false,
      });
    }

    updateStatsDisplay();
  }

  // 3. Append row to live logs table
  function appendLogEntry({ time, method, status, version, latency, detail, isSuccess }) {
    if (!hasLogs) {
      logsTbody.innerHTML = "";
      hasLogs = true;
    }

    const tr = document.createElement("tr");
    const statusClass = isSuccess ? "badge-201" : "badge-500";

    tr.innerHTML = `
      <td>${time}</td>
      <td><code>${method}</code></td>
      <td><span class="badge-status ${statusClass}">${status}</span></td>
      <td><strong>${version}</strong></td>
      <td>${latency}</td>
      <td>${detail}</td>
    `;

    logsTbody.insertBefore(tr, logsTbody.firstChild);

    // Keep max 50 entries
    if (logsTbody.children.length > 50) {
      logsTbody.removeChild(logsTbody.lastChild);
    }
  }

  // 4. Update Stats metrics
  function updateStatsDisplay() {
    statTotal.textContent = stats.total;
    statSuccess.textContent = stats.success;
    statFailure.textContent = stats.failure;

    const rate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 100.0;
    statSuccessRate.textContent = `${rate}%`;
    healthBarFill.style.width = `${rate}%`;

    if (rate >= 95) {
      healthBarFill.style.background = "var(--accent-emerald)";
      statSuccessRate.style.color = "var(--accent-emerald)";
    } else if (rate >= 75) {
      healthBarFill.style.background = "var(--accent-amber)";
      statSuccessRate.style.color = "var(--accent-amber)";
    } else {
      healthBarFill.style.background = "var(--accent-rose)";
      statSuccessRate.style.color = "var(--accent-rose)";
    }
  }

  // 5. Auto Traffic Generator
  function startAutoTraffic() {
    const rate = parseInt(trafficRateSlider.value, 10) || 2;
    const intervalMs = Math.floor(1000 / rate);

    if (autoIntervalId) clearInterval(autoIntervalId);
    autoIntervalId = setInterval(() => {
      sendOrderRequest();
    }, intervalMs);

    isAutoRunning = true;
    btnToggleAuto.classList.add("active");
    textAutoBtn.textContent = "Stop Auto Traffic";
    iconAutoPlay.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  }

  function stopAutoTraffic() {
    if (autoIntervalId) {
      clearInterval(autoIntervalId);
      autoIntervalId = null;
    }
    isAutoRunning = false;
    btnToggleAuto.classList.remove("active");
    textAutoBtn.textContent = "Start Auto Traffic";
    iconAutoPlay.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  }

  // Event Listeners
  btnSendOrder.addEventListener("click", () => {
    sendOrderRequest();
  });

  btnToggleAuto.addEventListener("click", () => {
    if (isAutoRunning) {
      stopAutoTraffic();
    } else {
      startAutoTraffic();
    }
  });

  trafficRateSlider.addEventListener("input", (e) => {
    const val = e.target.value;
    rateDisplay.textContent = `${val} req/s`;
    if (isAutoRunning) {
      startAutoTraffic(); // Restart with new frequency
    }
  });

  btnResetStats.addEventListener("click", () => {
    stats = { total: 0, success: 0, failure: 0 };
    updateStatsDisplay();
    logsTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">Stats reset. Ready for new traffic requests.</td>
      </tr>
    `;
    hasLogs = false;
  });

  // Polling server info every 3 seconds
  fetchServerInfo();
  setInterval(fetchServerInfo, 3000);
});
