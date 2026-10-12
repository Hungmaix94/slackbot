import { Hono } from "hono";
import { Env } from "./config/env";
import { slackRoutes } from "./routes/slack.routes";
import { syncRoutes } from "./routes/sync.routes";
import { planeRoutes } from "./routes/plane.routes";
import { testRoutes } from "./routes/test.routes";

const app = new Hono<{ Bindings: Env }>();

// 1. Health check & Root
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "mvl-slack-assistant",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (c) => {
  return c.text("MVL Assistant Slackbot (Cloudflare Edge Edition) is running!");
});

// 2. Mount modular routes
app.route("/slack", slackRoutes);
app.route("/sync", syncRoutes);
app.route("/plane", planeRoutes);
app.route("/test", testRoutes);

export default app;
