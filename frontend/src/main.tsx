import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";

createRoot(document.getElementById("root")!).render(<App />);

// Hide boot splash once React has mounted (next frame to avoid flash)
requestAnimationFrame(() => {
  const splash = document.getElementById("boot-splash");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 300);
  }
});
