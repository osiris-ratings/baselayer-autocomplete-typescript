import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/fonts";
import "../shared/brand.css";
import "./home.css";

import { Home } from "./Home";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
