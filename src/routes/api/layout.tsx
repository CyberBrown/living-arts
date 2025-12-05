import { component$, Slot } from "@builder.io/qwik";

// Empty layout for API routes - no HTML wrapper
export default component$(() => {
  return <Slot />;
});
