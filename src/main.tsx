import { mount } from "svelte";
import App from "./App.svelte";
import "./styles.css";

const target = document.getElementById("root");
if (!target) throw new Error("Application root was not found");
mount(App, { target });

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(async () => {
        const origin = window.location.origin;
        const resources = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => new URL(url).origin === origin);
        await Promise.all(
          [...new Set(resources)].map((url) =>
            fetch(url).catch(() => undefined),
          ),
        );
      });
  });
}
