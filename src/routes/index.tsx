import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import {
  routeAction$,
  routeLoader$,
  Form,
  type DocumentHead,
} from "@builder.io/qwik-city";

// Env type for Pages app
interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  VIDEO_WORKFLOW_URL: string;
}

interface Project {
  id: string;
  prompt: string;
  status: string;
  duration: number;
  workflow_id?: string;
  output_url: string | null;
  created_at: string;
}

export const useProjects = routeLoader$<Project[]>(async ({ platform }) => {
  const env = platform.env as Env;
  if (!env.DB) {
    return [];
  }
  const result = await env.DB.prepare(
    "SELECT id, prompt, status, duration, output_url, created_at, workflow_id FROM projects ORDER BY created_at DESC LIMIT 20"
  ).all<Project>();

  const projects = result.results || [];

  // For projects that are still processing, fetch workflow status
  const workflowUrl = env.VIDEO_WORKFLOW_URL || "https://video-workflow.solamp.workers.dev";
  for (const project of projects) {
    if (project.status === "processing" && project.workflow_id) {
      try {
        const statusResponse = await fetch(`${workflowUrl}/status/${project.id}`, {
          headers: { "Content-Type": "application/json" },
        });

        if (statusResponse.ok) {
          const workflowStatus = await statusResponse.json() as { status: string; data?: any };
          // Update project status from workflow if available
          if (workflowStatus.status) {
            project.status = workflowStatus.status;
          }
        }
      } catch (error) {
        // Silently continue if workflow status fetch fails
        console.error(`Failed to fetch status for project ${project.id}:`, error);
      }
    }
  }

  return projects;
});

export const useCreateProject = routeAction$(async (data, { platform }) => {
  const env = platform.env as Env;
  const projectId = crypto.randomUUID();
  const prompt = data.prompt as string;
  const duration = parseInt(data.duration as string, 10);

  // Insert project into database
  await env.DB.prepare(
    "INSERT INTO projects (id, prompt, status, duration) VALUES (?, ?, 'starting', ?)"
  ).bind(projectId, prompt, duration).run();

  try {
    // Trigger the workflow Worker via fetch
    const workflowUrl = env.VIDEO_WORKFLOW_URL || "https://video-workflow.solamp.workers.dev";
    const workflowResponse = await fetch(`${workflowUrl}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        prompt,
        duration,
      }),
    });

    if (!workflowResponse.ok) {
      // Update status to failed
      await env.DB.prepare(
        "UPDATE projects SET status = 'failed' WHERE id = ?"
      ).bind(projectId).run();

      return {
        success: false,
        error: "Failed to start workflow",
        projectId,
      };
    }

    const workflowResult = await workflowResponse.json() as { workflowId: string };

    // Update with workflow ID and status to processing
    await env.DB.prepare(
      "UPDATE projects SET workflow_id = ?, status = 'processing' WHERE id = ?"
    ).bind(workflowResult.workflowId, projectId).run();

    return {
      success: true,
      projectId,
      workflowId: workflowResult.workflowId,
    };
  } catch (error) {
    // Update status to failed on error
    await env.DB.prepare(
      "UPDATE projects SET status = 'failed' WHERE id = ?"
    ).bind(projectId).run();

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      projectId,
    };
  }
});

export default component$(() => {
  const initialProjects = useProjects();
  const createAction = useCreateProject();
  const selectedDuration = useSignal("60");
  const projects = useSignal<Project[]>(initialProjects.value);

  // Poll for updates when there are processing projects
  useVisibleTask$(({ track, cleanup }) => {
    track(() => createAction.value);

    const hasProcessing = () =>
      projects.value.some(
        (p) =>
          p.status !== "complete" &&
          p.status !== "error" &&
          p.status !== "pending"
      );

    const poll = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const result = await res.json() as Project[];
          projects.value = result;
        }
      } catch (e) {
        console.error("Failed to fetch projects:", e);
      }
    };

    // Fetch after project creation with a small delay to ensure DB write completes
    if (createAction.value?.success) {
      setTimeout(poll, 500);
    }

    // Set up polling interval - always poll to catch new projects
    const interval = setInterval(poll, 2000);

    cleanup(() => clearInterval(interval));
  });

  return (
    <>
      <div class="container container-center">
        <h1>
          <span class="highlight">Living</span> Arts
        </h1>
        <p style={{ fontSize: "1.2rem", marginTop: "1rem", color: "#9ca3af" }}>
          AI-Powered Educational Video Production
        </p>
      </div>

      <div role="presentation" class="ellipsis"></div>
      <div role="presentation" class="ellipsis ellipsis-purple"></div>

      <div class="container container-center">
        <div
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "2rem",
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: "12px",
          }}
        >
          <h3 style={{ marginBottom: "1.5rem" }}>Create New Video</h3>

          <Form action={createAction}>
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                for="prompt"
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  textAlign: "left",
                }}
              >
                Video Topic
              </label>
              <textarea
                id="prompt"
                name="prompt"
                required
                placeholder="Describe your educational video topic..."
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "1rem",
                  borderRadius: "8px",
                  border: "1px solid #374151",
                  background: "#1f2937",
                  color: "white",
                  fontSize: "1rem",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  textAlign: "left",
                }}
              >
                Target Duration
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                {[
                  { value: "60", label: "1 min" },
                  { value: "120", label: "2 min" },
                  { value: "180", label: "3 min" },
                  { value: "300", label: "5 min" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick$={() => (selectedDuration.value = option.value)}
                    style={{
                      padding: "0.75rem 1.5rem",
                      borderRadius: "8px",
                      border:
                        selectedDuration.value === option.value
                          ? "2px solid var(--qwik-light-blue)"
                          : "1px solid #374151",
                      background:
                        selectedDuration.value === option.value
                          ? "rgba(24, 180, 244, 0.2)"
                          : "#1f2937",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <input
                type="hidden"
                name="duration"
                value={selectedDuration.value}
              />
            </div>

            <button
              type="submit"
              disabled={createAction.isRunning}
              style={{
                width: "100%",
                opacity: createAction.isRunning ? 0.7 : 1,
              }}
            >
              {createAction.isRunning ? "Creating..." : "Generate Video"}
            </button>
          </Form>

          {createAction.value?.success && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                background: "rgba(34, 197, 94, 0.2)",
                borderRadius: "8px",
                color: "#22c55e",
              }}
            >
              Project created! ID: {createAction.value.projectId}
            </div>
          )}

          {createAction.value?.success === false && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                background: "rgba(239, 68, 68, 0.2)",
                borderRadius: "8px",
                color: "#ef4444",
              }}
            >
              Error: {createAction.value.error || "Failed to create project"}
            </div>
          )}
        </div>
      </div>

      <div class="container">
        <h3 style={{ textAlign: "center", marginBottom: "2rem" }}>
          Your Projects
        </h3>

        {projects.value.length === 0 ? (
          <p style={{ textAlign: "center", color: "#6b7280" }}>
            No projects yet. Create your first video above!
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "1rem",
              maxWidth: "800px",
              margin: "0 auto",
            }}
          >
            {projects.value.map((project) => (
              <div
                key={project.id}
                style={{
                  padding: "1.5rem",
                  background: "rgba(255, 255, 255, 0.05)",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div style={{ flex: 1, textAlign: "left" }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: "bold",
                      color: "white",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.prompt.substring(0, 50)}
                    {project.prompt.length > 50 ? "..." : ""}
                  </p>
                  <p
                    style={{
                      margin: "0.5rem 0 0",
                      fontSize: "0.875rem",
                      color: "#9ca3af",
                    }}
                  >
                    {new Date(project.created_at).toLocaleDateString()} -{" "}
                    {Math.floor(project.duration / 60)} min
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    minWidth: "140px",
                  }}
                >
                  {/* Progress indicator for processing states */}
                  {project.status !== "complete" &&
                   project.status !== "pending" &&
                   !project.status.includes("error") ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                      <div
                        style={{
                          width: "100%",
                          height: "6px",
                          background: "#374151",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            background: "linear-gradient(90deg, #18b6f6, #ac7ff4)",
                            borderRadius: "3px",
                            width: project.status === "starting" ? "10%" :
                                   project.status === "processing" ? "20%" :
                                   project.status === "script_generated" ? "40%" :
                                   project.status === "voiceover_generated" ? "60%" :
                                   project.status === "timeline_assembled" ? "80%" : "90%",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
                        {project.status === "starting" ? "Starting..." :
                         project.status === "processing" ? "Processing..." :
                         project.status === "script_generated" ? "Script done" :
                         project.status === "voiceover_generated" ? "Audio done" :
                         project.status === "timeline_assembled" ? "Rendering..." :
                         project.status.replace("_", " ")}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span
                        style={{
                          display: "inline-block",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background:
                            project.status === "complete"
                              ? "#22c55e"
                              : project.status === "pending"
                                ? "#6b7280"
                                : "#ef4444",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.875rem",
                          textTransform: "capitalize",
                        }}
                      >
                        {project.status.replace("_", " ")}
                      </span>
                    </>
                  )}
                </div>
                {project.output_url && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button
                      type="button"
                      class="button button-small"
                      onClick$={() => {
                        const modal = document.getElementById(`video-modal-${project.id}`);
                        if (modal) modal.style.display = "flex";
                      }}
                    >
                      Play
                    </button>
                    <a
                      href={project.output_url}
                      target="_blank"
                      class="button button-small button-dark"
                    >
                      Open
                    </a>
                  </div>
                )}
                {/* Video Modal */}
                {project.output_url && (
                  <div
                    id={`video-modal-${project.id}`}
                    onClick$={(e) => {
                      if ((e.target as HTMLElement).id === `video-modal-${project.id}`) {
                        (e.target as HTMLElement).style.display = "none";
                      }
                    }}
                    style={{
                      display: "none",
                      position: "fixed",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "rgba(0, 0, 0, 0.9)",
                      zIndex: 1000,
                      justifyContent: "center",
                      alignItems: "center",
                      padding: "2rem",
                    }}
                  >
                    <div style={{ position: "relative", maxWidth: "900px", width: "100%" }}>
                      <button
                        type="button"
                        onClick$={() => {
                          const modal = document.getElementById(`video-modal-${project.id}`);
                          if (modal) modal.style.display = "none";
                        }}
                        style={{
                          position: "absolute",
                          top: "-40px",
                          right: "0",
                          background: "transparent",
                          border: "none",
                          color: "white",
                          fontSize: "1.5rem",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                      <video
                        src={project.output_url}
                        controls
                        autoplay
                        style={{
                          width: "100%",
                          maxHeight: "80vh",
                          borderRadius: "8px",
                          background: "#000",
                        }}
                      />
                      <p style={{ marginTop: "1rem", color: "#9ca3af", fontSize: "0.875rem" }}>
                        {project.prompt}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: "Living Arts - AI Video Production",
  meta: [
    {
      name: "description",
      content:
        "AI-powered educational video production on Cloudflare Workers",
    },
  ],
};
