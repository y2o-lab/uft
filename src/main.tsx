import App from "./App.svelte";
import "./styles.css";

const target = document.getElementById("root");
if (!target) throw new Error("Application root was not found");
new App({ target });
