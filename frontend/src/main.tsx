import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { CaptureProvider } from "./hooks/useCapture";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <CaptureProvider>
        <App />
      </CaptureProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
