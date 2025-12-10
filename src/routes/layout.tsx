import { component$, Slot, useStyles$ } from "@builder.io/qwik";

import Header from "../components/starter/header/header";
import Footer from "../components/starter/footer/footer";

import styles from "./styles.css?inline";

export default component$(() => {
  useStyles$(styles);
  return (
    <>
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </>
  );
});
