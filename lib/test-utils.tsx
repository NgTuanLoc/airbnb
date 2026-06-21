import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderUI(ui: ReactElement) {
  return render(ui);
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
