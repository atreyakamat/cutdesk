"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { IconButton } from "./IconButton";

type Theme = "light" | "dark";

function effectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Re-reads the theme whenever the OS setting changes or the data-theme attribute is set. */
function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** Flips the app between light and dark and remembers the choice. Defaults to the system setting until used. */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, effectiveTheme, () => "light");

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    // The MutationObserver in subscribe() picks this up and re-renders.
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("cutdesk-theme", next);
    } catch {
      // Private browsing or disabled storage: the choice just won't persist.
    }
  };

  return (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    />
  );
}
