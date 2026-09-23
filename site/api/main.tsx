import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/fonts";
import "../shared/brand.css";
import "./api.css";

import { ApiReference } from "./ApiReference";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiReference />
  </StrictMode>,
);
