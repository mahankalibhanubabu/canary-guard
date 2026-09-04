const express = require("express");
const client = require("prom-client");
const os = require("os");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// Environment-driven runtime configuration
const version = process.env.APP_VERSION || "v1";
const failureRate = Number(process.env.FAILURE_RATE || 0);

// Initialize Prometheus Registry
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "canaryguard_" });

// Custom Prometheus Metrics
const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests processed",
  labelNames: ["method", "route", "status_code", "version"],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code", "version"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

// Middleware for JSON parsing and static assets
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Telemetry & Metrics Middleware
app.use((req, res, next) => {
  const start = process.hrtime();

  res.on("finish", () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;

    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status_code: res.statusCode,
      version: version,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route: route,
        status_code: res.statusCode,
        version: version,
      },
      durationInSeconds
    );
  });

  next();
});

// Health check endpoint for Kubernetes liveness & readiness probes
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    version: version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Prometheus scraping endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// Metadata endpoint for frontend dashboard
app.get("/api/info", (req, res) => {
  res.json({
    version: version,
    failureRate: failureRate,
    hostname: os.hostname(),
    uptime: Math.floor(process.uptime()),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || "development",
  });
});

// Simulated business logic with controlled failure injection
function handleOrderRequest(req, res) {
  // Simulate slight realistic processing latency (10ms - 50ms)
  const delayMs = Math.floor(Math.random() * 40) + 10;

  setTimeout(() => {
    const randomVal = Math.random();
    const isFailure = randomVal < failureRate;

    if (isFailure) {
      return res.status(500).json({
        success: false,
        error: "Internal Server Error: Order fulfillment failed",
        code: "ERR_ORDER_PROCESSING_FAILURE",
        version: version,
        failureRate: failureRate,
        timestamp: new Date().toISOString(),
      });
    }

    const orderId = "ORD-" + Math.floor(100000 + Math.random() * 900000);
    return res.status(201).json({
      success: true,
      orderId: orderId,
      amount: (Math.random() * 100 + 10).toFixed(2),
      currency: "USD",
      item: "Cloud Canary Shield Subscription",
      version: version,
      timestamp: new Date().toISOString(),
    });
  }, delayMs);
}

app.get("/api/orders", handleOrderRequest);
app.post("/api/orders", handleOrderRequest);
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    version: version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(port, () => {
  console.log(`=========================================`);
  console.log(` CanaryGuard Progressive Delivery Demo `);
  console.log(` Port:         ${port}`);
  console.log(` Version:      ${version}`);
  console.log(` Failure Rate: ${failureRate * 100}%`);
  console.log(` Hostname:     ${os.hostname()}`);
  console.log(`=========================================`);
});
