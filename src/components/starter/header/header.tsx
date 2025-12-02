import { component$ } from "@builder.io/qwik";
import styles from "./header.module.css";

export default component$(() => {
  return (
    <header class={styles.header}>
      <div class={["container", styles.wrapper]}>
        <div class={styles.logo}>
          <a href="/" title="Living Arts">
            <span style={{ fontSize: "1.5rem", fontWeight: "bold", color: "white" }}>
              <span style={{ color: "var(--qwik-light-blue)" }}>Living</span> Arts
            </span>
          </a>
        </div>
        <ul>
          <li>
            <a href="/">Dashboard</a>
          </li>
          <li>
            <a href="https://github.com/CyberBrown/living-arts" target="_blank">
              GitHub
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
});
