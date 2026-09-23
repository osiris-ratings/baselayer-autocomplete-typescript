import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@baselayer/autocomplete/react/styles.css";

import "../shared/fonts";
import "../shared/brand.css";
import "./demo.css";

import { SiteFooter } from "../shared/SiteFooter";
import { SiteHeader } from "../shared/SiteHeader";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SiteHeader current="demo" />
    <App />
    <SiteFooter />
  </StrictMode>,
);
