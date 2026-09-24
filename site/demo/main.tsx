import "@baselayer/autocomplete/react/styles.css";

import "../shared/fonts";
import "../shared/brand.css";
import "./demo.css";

import { mount } from "../shared/mount";
import { SiteHeader } from "../shared/SiteHeader";
import { App } from "./App";

mount(
  <>
    <SiteHeader current="demo" />
    <App />
  </>,
);
