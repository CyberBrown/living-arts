import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import {
  routeAction$,
  routeLoader$,
  Form,
  type DocumentHead,
} from "@builder.io/qwik-city";
import type { Env } from "../workflows/video-production";

interface Project {
  id: string;
  prompt: string;
  status: string;
  duration: number;
  output_url: string | null;
  created_at: string;
}

export const useProjects = routeLoader$<Project[]>(async ({ platform }) => {
  const env = platform.env as Env;
  if (!env.DB) {
    return [];
  }
  const result = await env.DB.prepare(
    "SELECT id, prompt, status, duration, output_url, created_at FROM projects ORDER BY created_at DESC LIMIT 20"
  ).all<Project>();
  return result.results || [];
});

export const useCreateProject = routeAction$(async (data, { platform }) => {
  const env = platform.env as Env;
  const projectId = crypto.randomUUID();
  const prompt = data.prompt as string;
  const duration = parseInt(data.duration as string, 10);

  // Insert project into database
  await env.DB.prepare(
    "INSERT INTO projects (id, prompt, status, duration) VALUES (?, ?, 'pending', ?)"
  ).bind(projectId, prompt, duration).run();

  // Trigger the workflow
  const instance = await env.VIDEO_WORKFLOW.create({
    id: projectId,
    params: {
      projectId,
      prompt,
      duration,
    },
  });

  // Update status to processing
  await env.DB.prepare(
    "UPDATE projects SET status = 'processing' WHERE id = ?"
  ).bind(projectId).run();

  return {
    success: true,
    projectId,
    instanceId: instance.id,
  };
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
          const result = await res.json();
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
                  }}
                >
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
                            : project.status.includes("error")
                              ? "#ef4444"
                              : "#eab308",
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
                </div>
                {project.output_url && (
                  <a
                    href={project.output_url}
                    target="_blank"
                    class="button button-small"
                  >
                    View
                  </a>
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
