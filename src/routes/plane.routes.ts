import { Hono } from "hono";
import { Env } from "../config/env";
import { PlaneClient } from "../plane/client";

export const planeRoutes = new Hono<{ Bindings: Env }>();

// Sync / Inspect Plane users
planeRoutes.get("/users", async (c) => {
  if (!c.env.PLANE_API_KEY) {
    return c.json({ error: "No PLANE_API_KEY" }, 500);
  }

  const plane = new PlaneClient(
    c.env.PLANE_API_KEY,
    c.env.PLANE_API_HOST_URL,
    c.env.PLANE_WORKSPACE_SLUG
  );

  const projectId =
    c.env.PLANE_DEFAULT_PROJECT_ID || "e92f7ba8-0db9-487f-a21c-13712d226eb8";

  try {
    const projectMembers = await plane.getProjectMembers(projectId);
    const workspaceMembers = await plane.getWorkspaceMembers();
    return c.json({
      project_members_count: projectMembers.length,
      project_members: projectMembers.map((m) => ({
        id: m.id,
        email: m.email,
        display_name: m.display_name,
        name: `${m.first_name || ""} ${m.last_name || ""}`.trim(),
      })),
      workspace_members_count: workspaceMembers.length,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
