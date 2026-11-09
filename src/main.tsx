import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/globals.css";
import "./styles/shell.css";
import "./styles/editor.css";
import "./styles/controls.css";
import "./styles/pages.css";
import "./styles/reference.css";
import "./styles/manuscript-native.css";
import "./styles/manuscript-inspector.css";
import "./styles/ci-book.css";
import "./styles/verse-editor.css";
import "./styles/paper-surfaces.css";
import "./styles/library-paper.css";
import "./styles/reading-paper.css";
import "./styles/notes-paper.css";
import "./styles/app-navigation.css";
import "./styles/home-paper.css";
import "./styles/primary-pages.css";
import "./styles/publication-launcher.css";
import "./styles/typography.css";
import "./styles/launch.css";
import { playLaunch } from "./app/playLaunch";

playLaunch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
