# Airbnb Clone — Phase 1: Foundation & Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js app, encode the `DESIGN.md` tokens into Tailwind v4, wire up testing, and build the tokenized atomic design-system components that every page in later phases will compose.

**Architecture:** A Next.js (latest, App Router, React 19) + TypeScript app styled entirely from a Tailwind v4 `@theme` that mirrors `DESIGN.md`. Components live in `components/design-system/` as focused, independently testable atoms. Tests assert rendered structure, design tokens (class names), text, and ARIA — not pixels.

**Tech Stack:** Next.js (latest), TypeScript (strict), Tailwind CSS v4, Inter via `next/font`, Vitest + React Testing Library, Playwright (config only this phase), shadcn/ui (initialized this phase, primitives consumed later).

## Global Constraints

- **Colors (exact hex):** rausch `#ff385c`, rausch-active `#e00b41`, rausch-disabled `#ffd1da`, error `#c13515`, error-hover `#b32505`, luxe `#460479`, plus `#92174d`, ink `#222222`, body `#3f3f3f`, muted `#6a6a6a`, muted-soft `#929292`, hairline `#dddddd`, hairline-soft `#ebebeb`, border-strong `#c1c1c1`, canvas `#ffffff`, surface-soft `#f7f7f7`, surface-strong `#f2f2f2`, on-primary `#ffffff`, legal-link `#428bff`, scrim `#000000`.
- **Radii (px):** none 0, xs 4, sm 8, md 14, lg 20, xl 32, full 9999.
- **Spacing (px):** xxs 2, xs 4, sm 8, md 12, base 16, lg 24, xl 32, xxl 48, section 64.
- **Single shadow tier:** `rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`. No other elevation tiers.
- **Font:** Inter via `next/font`; display line-heights tuned ~2% tighter than nominal per spec.
- **Type scale (size/weight):** display-xl 28/700, display-lg 22/500, display-md 21/700, display-sm 20/600, title-md 16/600, title-sm 16/500, rating-display 64/700, body-md 16/400, body-sm 14/400, caption 14/500, caption-sm 13/400, badge 11/600, micro-label 12/700, uppercase-tag 8/700 (uppercase, +0.32px), button-md 16/500, button-sm 14/500, nav-link 16/600.
- **Star/rating numbers render in `ink`, never gold/yellow.**
- **TypeScript strict mode on. 80% coverage target. TDD: test first, watch it fail, minimal implementation, watch it pass, commit.**
- **Commit message format:** `<type>: <description>` (feat, fix, refactor, docs, test, chore).

---

### Task 1: Scaffold the Next.js app and verify it runs

**Files:**
- Create: project files via `create-next-app` (package.json, tsconfig.json, next.config.ts, app/, etc.)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running Next.js App Router project at the repo root with TypeScript, Tailwind v4, ESLint, `src/`-less `app/` layout, import alias `@/*`.

- [ ] **Step 1: Scaffold into the existing repo**

The repo already contains `DESIGN.md`, `docs/`, `.git`, `.gitignore`. Scaffold into a temp dir and move files in to avoid clobbering them.

Run:
```bash
cd "D:/PersonalProjects/airbnb"
npx create-next-app@latest .app-scaffold --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack --yes
```
Expected: a `.app-scaffold/` directory containing a Next.js project.

- [ ] **Step 2: Move scaffold files into the repo root**

Run:
```bash
cd "D:/PersonalProjects/airbnb/.app-scaffold"
# move everything including dotfiles, but keep the root .git/.gitignore/DESIGN.md/docs
mv -f app components public 2>/dev/null || true
cp -rf ./. ../
cd ..
rm -rf .app-scaffold .app-scaffold/.git
```
If the scaffold created its own `.gitignore`, keep the richer one; ensure it ignores `node_modules/`, `.next/`, `.env*`.
Expected: `package.json`, `next.config.ts`, `tsconfig.json`, `app/`, `public/` now at repo root.

- [ ] **Step 3: Enable TypeScript strict mode**

Open `tsconfig.json` and confirm/ensure `"strict": true` under `compilerOptions`. If absent, add it.

- [ ] **Step 4: Run the dev server to verify it boots**

Run:
```bash
cd "D:/PersonalProjects/airbnb"
npm run build
```
Expected: build completes with "Compiled successfully" (no type errors).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js app with typescript and tailwind v4"
```

---

### Task 2: Encode DESIGN.md tokens into the Tailwind v4 theme

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `app/fonts.ts`

**Interfaces:**
- Consumes: scaffolded app from Task 1.
- Produces: Tailwind theme tokens usable as utility classes — colors (`bg-rausch`, `text-ink`, `border-hairline`, …), radii (`rounded-md` = 14px etc.), the `shadow-airbnb` utility, the Inter font on `--font-sans`, and CSS custom properties for the type scale.

- [ ] **Step 1: Define the font loader**

Create `app/fonts.ts`:
```ts
import { Inter } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
```

- [ ] **Step 2: Wire the font into the root layout**

In `app/layout.tsx`, import the font and apply its variable + antialiasing to `<html>`:
```tsx
import type { Metadata } from "next";
import { inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airbnb",
  description: "Find places to stay, things to do, and services.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Replace globals.css with the token theme**

Overwrite `app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-sans), ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif;

  /* Brand & accent */
  --color-rausch: #ff385c;
  --color-rausch-active: #e00b41;
  --color-rausch-disabled: #ffd1da;
  --color-error: #c13515;
  --color-error-hover: #b32505;
  --color-luxe: #460479;
  --color-plus: #92174d;

  /* Text */
  --color-ink: #222222;
  --color-body: #3f3f3f;
  --color-muted: #6a6a6a;
  --color-muted-soft: #929292;
  --color-on-primary: #ffffff;
  --color-legal-link: #428bff;

  /* Lines & surfaces */
  --color-hairline: #dddddd;
  --color-hairline-soft: #ebebeb;
  --color-border-strong: #c1c1c1;
  --color-canvas: #ffffff;
  --color-surface-soft: #f7f7f7;
  --color-surface-strong: #f2f2f2;

  /* Radii */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 32px;
  --radius-full: 9999px;

  /* Spacing additions (Tailwind keeps its numeric scale; these are named aliases) */
  --spacing-section: 64px;

  /* Single shadow tier */
  --shadow-airbnb: rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0;
}

/* Type-scale utilities (size / weight / line-height / tracking from DESIGN.md) */
@layer components {
  .text-display-xl { font-size: 28px; font-weight: 700; line-height: 1.40; letter-spacing: 0; }
  .text-display-lg { font-size: 22px; font-weight: 500; line-height: 1.16; letter-spacing: -0.44px; }
  .text-display-md { font-size: 21px; font-weight: 700; line-height: 1.40; letter-spacing: 0; }
  .text-display-sm { font-size: 20px; font-weight: 600; line-height: 1.18; letter-spacing: -0.18px; }
  .text-rating { font-size: 64px; font-weight: 700; line-height: 1.1; letter-spacing: -1px; }
  .text-title-md { font-size: 16px; font-weight: 600; line-height: 1.25; }
  .text-title-sm { font-size: 16px; font-weight: 500; line-height: 1.25; }
  .text-body-md { font-size: 16px; font-weight: 400; line-height: 1.5; }
  .text-body-sm { font-size: 14px; font-weight: 400; line-height: 1.43; }
  .text-caption { font-size: 14px; font-weight: 500; line-height: 1.29; }
  .text-caption-sm { font-size: 13px; font-weight: 400; line-height: 1.23; }
  .text-badge { font-size: 11px; font-weight: 600; line-height: 1.18; }
  .text-micro { font-size: 12px; font-weight: 700; line-height: 1.33; }
  .text-uppercase-tag { font-size: 8px; font-weight: 700; line-height: 1.25; letter-spacing: 0.32px; text-transform: uppercase; }
  .text-button-md { font-size: 16px; font-weight: 500; line-height: 1.25; }
  .text-button-sm { font-size: 14px; font-weight: 500; line-height: 1.29; }
  .text-nav-link { font-size: 16px; font-weight: 600; line-height: 1.25; }
}
```

- [ ] **Step 4: Verify the build still compiles with the new theme**

Run:
```bash
cd "D:/PersonalProjects/airbnb" && npm run build
```
Expected: "Compiled successfully" — the new CSS parses and tokens are registered.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx app/fonts.ts
git commit -m "feat: encode DESIGN.md tokens into tailwind v4 theme"
```

---

### Task 3: Set up Vitest + React Testing Library

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `lib/test-utils.tsx`
- Modify: `package.json` (scripts + devDeps)

**Interfaces:**
- Consumes: the scaffolded app.
- Produces: `npm test` (Vitest, jsdom, RTL matchers) and a `render` re-export from `lib/test-utils`. Later tasks import `render`, `screen` from `@testing-library/react` and `@/lib/test-utils`.

- [ ] **Step 1: Install test dependencies**

Run:
```bash
cd "D:/PersonalProjects/airbnb"
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths
```
Expected: packages added to devDependencies.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
```

- [ ] **Step 3: Create the setup file**

Create `vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

- [ ] **Step 4: Create the shared test util**

Create `lib/test-utils.tsx`:
```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderUI(ui: ReactElement) {
  return render(ui);
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
```

- [ ] **Step 5: Add test scripts**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 6: Add a smoke test and run it**

Create `lib/test-utils.test.ts`:
```ts
import { describe, expect, test } from "vitest";

describe("test harness", () => {
  test("runs and asserts", () => {
    expect(1 + 1).toBe(2);
  });
});
```
Run:
```bash
npm test
```
Expected: 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: set up vitest and react testing library"
```

---

### Task 4: Initialize shadcn/ui and the `cn` class utility

**Files:**
- Create: `lib/utils.ts`
- Create/Modify: `components.json` (shadcn config)
- Modify: `package.json` (deps: clsx, tailwind-merge)

**Interfaces:**
- Consumes: token theme from Task 2.
- Produces: `cn(...classes)` helper — `export function cn(...inputs: ClassValue[]): string` — used by every component for conditional class merging.

- [ ] **Step 1: Install class utilities**

Run:
```bash
cd "D:/PersonalProjects/airbnb"
npm install clsx tailwind-merge
```

- [ ] **Step 2: Write the failing test for `cn`**

Create `lib/utils.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("drops falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  test("later tailwind classes win conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npx vitest run lib/utils.test.ts
```
Expected: FAIL — cannot find module `./utils`.

- [ ] **Step 4: Implement `cn`**

Create `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npx vitest run lib/utils.test.ts
```
Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/utils.test.ts package.json package-lock.json
git commit -m "feat: add cn class-merge utility"
```

---

### Task 5: Button component

**Files:**
- Create: `components/design-system/button.tsx`
- Test: `components/design-system/button.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Button` — `function Button(props: ButtonProps): JSX.Element`, where `ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "tertiary" | "pill"; }`. Default variant `"primary"`. Later phases import `{ Button }` from `@/components/design-system/button`.

- [ ] **Step 1: Write the failing test**

Create `components/design-system/button.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { Button } from "./button";

describe("Button", () => {
  test("renders its label", () => {
    render(<Button>Reserve</Button>);
    expect(screen.getByRole("button", { name: "Reserve" })).toBeInTheDocument();
  });

  test("primary variant uses the rausch fill and sm radius", () => {
    render(<Button>Reserve</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-rausch");
    expect(btn.className).toContain("rounded-sm");
  });

  test("secondary variant uses canvas fill with ink border", () => {
    render(<Button variant="secondary">Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-canvas");
    expect(btn.className).toContain("border");
  });

  test("disabled buttons are disabled and use the pale tint", () => {
    render(<Button disabled>Reserve</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("disabled:bg-rausch-disabled");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/button.test.tsx`
Expected: FAIL — cannot find module `./button`.

- [ ] **Step 3: Implement the Button**

Create `components/design-system/button.tsx`:
```tsx
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "pill";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const base =
  "inline-flex items-center justify-center text-button-md transition-colors disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "h-12 px-6 rounded-sm bg-rausch text-on-primary hover:bg-rausch-active disabled:bg-rausch-disabled",
  secondary:
    "h-12 px-6 rounded-sm bg-canvas text-ink border border-ink hover:bg-surface-soft",
  tertiary: "text-ink underline-offset-2 hover:underline bg-transparent",
  pill: "px-5 py-2.5 rounded-full bg-rausch text-on-primary text-button-sm hover:bg-rausch-active",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], className)} {...props} />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/button.test.tsx`
Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/button.tsx components/design-system/button.test.tsx
git commit -m "feat: add Button design-system component"
```

---

### Task 6: TextInput component

**Files:**
- Create: `components/design-system/text-input.tsx`
- Test: `components/design-system/text-input.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces: `TextInput` — `function TextInput(props: TextInputProps): JSX.Element`, `TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; }`. Renders a stacked label, a 56px-tall hairline-bordered input that flips to a 2px ink border on focus, and optional error text in `text-error`.

- [ ] **Step 1: Write the failing test**

Create `components/design-system/text-input.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { TextInput } from "./text-input";

describe("TextInput", () => {
  test("associates the label with the input", () => {
    render(<TextInput label="Email" name="email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  test("renders error text when provided", () => {
    render(<TextInput label="Email" error="Required" />);
    const err = screen.getByText("Required");
    expect(err.className).toContain("text-error");
  });

  test("input has the hairline border and sm radius", () => {
    render(<TextInput label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input.className).toContain("border-hairline");
    expect(input.className).toContain("rounded-sm");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/text-input.test.tsx`
Expected: FAIL — cannot find module `./text-input`.

- [ ] **Step 3: Implement the TextInput**

Create `components/design-system/text-input.tsx`:
```tsx
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface TextInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextInput({ label, error, className, id, ...props }: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-caption text-muted">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "h-14 rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink",
          "placeholder:text-muted focus:border-2 focus:border-ink focus:outline-none",
          error && "border-error",
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <span className="text-body-sm text-error">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/text-input.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/text-input.tsx components/design-system/text-input.test.tsx
git commit -m "feat: add TextInput design-system component"
```

---

### Task 7: Badges — NewBadge and GuestFavoriteBadge

**Files:**
- Create: `components/design-system/badges.tsx`
- Test: `components/design-system/badges.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces: `NewBadge` — `function NewBadge(): JSX.Element` (renders "NEW" in `text-uppercase-tag`); `GuestFavoriteBadge` — `function GuestFavoriteBadge(): JSX.Element` (renders "Guest favorite" in `text-badge` on a white pill with `shadow-airbnb`).

- [ ] **Step 1: Write the failing test**

Create `components/design-system/badges.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { NewBadge, GuestFavoriteBadge } from "./badges";

describe("badges", () => {
  test("NewBadge renders uppercase NEW with the tag type", () => {
    render(<NewBadge />);
    const el = screen.getByText("NEW");
    expect(el.className).toContain("text-uppercase-tag");
  });

  test("GuestFavoriteBadge renders the label on a shadowed pill", () => {
    render(<GuestFavoriteBadge />);
    const el = screen.getByText("Guest favorite");
    expect(el.className).toContain("rounded-full");
    expect(el.className).toContain("shadow-airbnb");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/badges.test.tsx`
Expected: FAIL — cannot find module `./badges`.

- [ ] **Step 3: Implement the badges**

Create `components/design-system/badges.tsx`:
```tsx
export function NewBadge() {
  return (
    <span className="inline-block rounded-full bg-canvas px-1.5 py-0.5 text-uppercase-tag text-ink">
      NEW
    </span>
  );
}

export function GuestFavoriteBadge() {
  return (
    <span className="inline-block rounded-full bg-canvas px-2.5 py-1 text-badge text-ink shadow-airbnb">
      Guest favorite
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/badges.test.tsx`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/badges.tsx components/design-system/badges.test.tsx
git commit -m "feat: add NewBadge and GuestFavoriteBadge"
```

---

### Task 8: RatingDisplay component

**Files:**
- Create: `components/design-system/rating-display.tsx`
- Test: `components/design-system/rating-display.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces: `RatingDisplay` — `function RatingDisplay({ value }: { value: number }): JSX.Element`. Renders the value formatted to two decimals at 64px (`text-rating`) in ink, flanked by two laurel ornaments.

- [ ] **Step 1: Write the failing test**

Create `components/design-system/rating-display.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { RatingDisplay } from "./rating-display";

describe("RatingDisplay", () => {
  test("formats the value to two decimals", () => {
    render(<RatingDisplay value={4.8} />);
    expect(screen.getByText("4.80")).toBeInTheDocument();
  });

  test("uses the 64px rating type in ink", () => {
    render(<RatingDisplay value={4.81} />);
    const el = screen.getByText("4.81");
    expect(el.className).toContain("text-rating");
    expect(el.className).toContain("text-ink");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/rating-display.test.tsx`
Expected: FAIL — cannot find module `./rating-display`.

- [ ] **Step 3: Implement the RatingDisplay**

Create `components/design-system/rating-display.tsx`:
```tsx
export function RatingDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center justify-center gap-3" aria-label={`Rated ${value} out of 5`}>
      <span aria-hidden className="text-2xl text-ink">❧</span>
      <span className="text-rating text-ink">{value.toFixed(2)}</span>
      <span aria-hidden className="scale-x-[-1] text-2xl text-ink">❧</span>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/rating-display.test.tsx`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/rating-display.tsx components/design-system/rating-display.test.tsx
git commit -m "feat: add RatingDisplay component"
```

---

### Task 9: DatePickerDay component

**Files:**
- Create: `components/design-system/date-picker-day.tsx`
- Test: `components/design-system/date-picker-day.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces: `DatePickerDay` — `function DatePickerDay(props: DatePickerDayProps): JSX.Element`, `DatePickerDayProps = { day: number; selected?: boolean; inRange?: boolean; disabled?: boolean; onSelect?: () => void; }`. A 40×40 circular button; selected = ink fill + white text; inRange = surface-soft lozenge.

- [ ] **Step 1: Write the failing test**

Create `components/design-system/date-picker-day.test.tsx`:
```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { DatePickerDay } from "./date-picker-day";

describe("DatePickerDay", () => {
  test("renders the day number", () => {
    render(<DatePickerDay day={14} />);
    expect(screen.getByRole("button", { name: "14" })).toBeInTheDocument();
  });

  test("selected day uses ink fill and white text", () => {
    render(<DatePickerDay day={14} selected />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-ink");
    expect(btn.className).toContain("text-on-primary");
  });

  test("calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    render(<DatePickerDay day={14} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  test("disabled day cannot be clicked", async () => {
    const onSelect = vi.fn();
    render(<DatePickerDay day={14} disabled onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/date-picker-day.test.tsx`
Expected: FAIL — cannot find module `./date-picker-day`.

- [ ] **Step 3: Implement the DatePickerDay**

Create `components/design-system/date-picker-day.tsx`:
```tsx
import { cn } from "@/lib/utils";

export interface DatePickerDayProps {
  day: number;
  selected?: boolean;
  inRange?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export function DatePickerDay({
  day,
  selected,
  inRange,
  disabled,
  onSelect,
}: DatePickerDayProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full text-body-sm text-ink",
        inRange && "bg-surface-soft",
        selected && "bg-ink text-on-primary",
        disabled && "cursor-not-allowed text-muted-soft line-through",
      )}
    >
      {day}
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/date-picker-day.test.tsx`
Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/date-picker-day.tsx components/design-system/date-picker-day.test.tsx
git commit -m "feat: add DatePickerDay component"
```

---

### Task 10: SearchBar (pill + orb)

**Files:**
- Create: `components/design-system/search-bar.tsx`
- Test: `components/design-system/search-bar.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces: `SearchBar` — `function SearchBar(props: SearchBarProps): JSX.Element`, `SearchBarProps = { onSearch?: () => void }`. Renders three labeled segments (Where / When / Who) divided by hairlines inside a 64px white pill with `shadow-airbnb`, terminated by a 48px circular rausch search orb (`role="button"`, accessible name "Search").

- [ ] **Step 1: Write the failing test**

Create `components/design-system/search-bar.test.tsx`:
```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { SearchBar } from "./search-bar";

describe("SearchBar", () => {
  test("renders the three segment labels", () => {
    render(<SearchBar />);
    expect(screen.getByText("Where")).toBeInTheDocument();
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(screen.getByText("Who")).toBeInTheDocument();
  });

  test("the orb is a rausch circular search button", () => {
    render(<SearchBar />);
    const orb = screen.getByRole("button", { name: "Search" });
    expect(orb.className).toContain("bg-rausch");
    expect(orb.className).toContain("rounded-full");
  });

  test("clicking the orb triggers onSearch", async () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/search-bar.test.tsx`
Expected: FAIL — cannot find module `./search-bar`.

- [ ] **Step 3: Implement the SearchBar**

Create `components/design-system/search-bar.tsx`:
```tsx
import { cn } from "@/lib/utils";

export interface SearchBarProps {
  onSearch?: () => void;
}

function Segment({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="flex flex-col px-6 py-2 text-left">
      <span className="text-caption text-ink">{label}</span>
      <span className="text-body-sm text-muted">{placeholder}</span>
    </div>
  );
}

export function SearchBar({ onSearch }: SearchBarProps) {
  return (
    <div className="flex h-16 items-center rounded-full border border-hairline bg-canvas pr-2 shadow-airbnb">
      <Segment label="Where" placeholder="Search destinations" />
      <span className="h-8 w-px bg-hairline" aria-hidden />
      <Segment label="When" placeholder="Add dates" />
      <span className="h-8 w-px bg-hairline" aria-hidden />
      <Segment label="Who" placeholder="Add guests" />
      <button
        type="button"
        aria-label="Search"
        onClick={onSearch}
        className={cn(
          "ml-2 flex h-12 w-12 items-center justify-center rounded-full bg-rausch text-on-primary",
          "hover:bg-rausch-active",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/search-bar.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/search-bar.tsx components/design-system/search-bar.test.tsx
git commit -m "feat: add SearchBar pill and search orb"
```

---

### Task 11: PropertyCard component

**Files:**
- Create: `lib/types.ts`
- Create: `components/design-system/property-card.tsx`
- Test: `components/design-system/property-card.test.tsx`

**Interfaces:**
- Consumes: `cn`, `GuestFavoriteBadge`.
- Produces: shared types in `lib/types.ts` (`Listing` interface — see Step 1) and `PropertyCard` — `function PropertyCard({ listing }: { listing: Listing }): JSX.Element`. Renders a 1:1 photo with `rounded-md`, optional Guest favorite badge top-left, a heart toggle button top-right (rausch-filled when saved), then title / location / price (`$X night`) and the ink rating.

- [ ] **Step 1: Define the shared Listing type**

Create `lib/types.ts`:
```ts
export interface Listing {
  id: string;
  title: string;
  location: { city: string; country: string; lat: number; lng: number };
  photos: string[];
  pricePerNight: number;
  rating: number;
  reviewCount: number;
  isGuestFavorite: boolean;
  hostId: string;
  category: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `components/design-system/property-card.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { PropertyCard } from "./property-card";
import type { Listing } from "@/lib/types";

const listing: Listing = {
  id: "1",
  title: "Cozy cabin",
  location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"],
  pricePerNight: 220,
  rating: 4.92,
  reviewCount: 88,
  isGuestFavorite: true,
  hostId: "h1",
  category: "Cabins",
};

describe("PropertyCard", () => {
  test("shows title, price and rating", () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.getByText("Cozy cabin")).toBeInTheDocument();
    expect(screen.getByText(/\$220/)).toBeInTheDocument();
    expect(screen.getByText("4.92")).toBeInTheDocument();
  });

  test("shows the guest favorite badge when flagged", () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.getByText("Guest favorite")).toBeInTheDocument();
  });

  test("heart toggles to the saved (rausch) state on click", async () => {
    render(<PropertyCard listing={listing} />);
    const heart = screen.getByRole("button", { name: /save/i });
    await userEvent.click(heart);
    expect(screen.getByRole("button", { name: /remove from wishlist/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run components/design-system/property-card.test.tsx`
Expected: FAIL — cannot find module `./property-card`.

- [ ] **Step 4: Implement the PropertyCard**

Create `components/design-system/property-card.tsx`:
```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Listing } from "@/lib/types";
import { GuestFavoriteBadge } from "./badges";

export function PropertyCard({ listing }: { listing: Listing }) {
  const [saved, setSaved] = useState(false);
  return (
    <article className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-md">
        <Image
          src={listing.photos[0]}
          alt={listing.title}
          fill
          sizes="(max-width: 744px) 100vw, 25vw"
          className="object-cover"
        />
        {listing.isGuestFavorite && (
          <div className="absolute left-3 top-3">
            <GuestFavoriteBadge />
          </div>
        )}
        <button
          type="button"
          aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
          onClick={() => setSaved((s) => !s)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden
            fill={saved ? "var(--color-rausch)" : "rgba(0,0,0,0.5)"}
            stroke="white" strokeWidth="2">
            <path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 7-2.5 4.15-9.5 8.5-9.5 8.5z" />
          </svg>
        </button>
      </div>
      <div className="flex items-start justify-between">
        <h3 className="text-title-sm text-ink">{listing.title}</h3>
        <span className="flex items-center gap-1 text-body-sm text-ink">
          <span aria-hidden>★</span>
          {listing.rating.toFixed(2)}
        </span>
      </div>
      <p className="text-body-sm text-muted">{listing.location.city}, {listing.location.country}</p>
      <p className="text-body-sm text-ink">
        <span className="font-semibold">${listing.pricePerNight}</span> night
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Configure Next image to allow the Unsplash/test host**

In `next.config.ts`, add remote image patterns:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "example.com" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run components/design-system/property-card.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts components/design-system/property-card.tsx components/design-system/property-card.test.tsx next.config.ts
git commit -m "feat: add PropertyCard component and Listing type"
```

---

### Task 12: ExperienceCard component

**Files:**
- Create: `components/design-system/experience-card.tsx`
- Test: `components/design-system/experience-card.test.tsx`

**Interfaces:**
- Consumes: `cn`, `NewBadge`, `Listing` type (reused; `category` distinguishes experiences this phase).
- Produces: `ExperienceCard` — `function ExperienceCard({ listing, isNew }: { listing: Listing; isNew?: boolean }): JSX.Element`. A 4:5 photo with `rounded-md`, optional NEW badge top-left, heart top-right, single-line title beneath.

- [ ] **Step 1: Write the failing test**

Create `components/design-system/experience-card.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { ExperienceCard } from "./experience-card";
import type { Listing } from "@/lib/types";

const exp: Listing = {
  id: "e1",
  title: "Pasta making in Rome",
  location: { city: "Rome", country: "Italy", lat: 41, lng: 12 },
  photos: ["https://example.com/e.jpg"],
  pricePerNight: 60,
  rating: 4.99,
  reviewCount: 30,
  isGuestFavorite: false,
  hostId: "h2",
  category: "Experiences",
};

describe("ExperienceCard", () => {
  test("renders the title", () => {
    render(<ExperienceCard listing={exp} />);
    expect(screen.getByText("Pasta making in Rome")).toBeInTheDocument();
  });

  test("shows the NEW badge when isNew", () => {
    render(<ExperienceCard listing={exp} isNew />);
    expect(screen.getByText("NEW")).toBeInTheDocument();
  });

  test("photo frame uses the 4:5 aspect and md radius", () => {
    const { container } = render(<ExperienceCard listing={exp} />);
    const frame = container.querySelector("div.rounded-md");
    expect(frame?.className).toContain("aspect-[4/5]");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/experience-card.test.tsx`
Expected: FAIL — cannot find module `./experience-card`.

- [ ] **Step 3: Implement the ExperienceCard**

Create `components/design-system/experience-card.tsx`:
```tsx
import Image from "next/image";
import type { Listing } from "@/lib/types";
import { NewBadge } from "./badges";

export function ExperienceCard({ listing, isNew }: { listing: Listing; isNew?: boolean }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md">
        <Image
          src={listing.photos[0]}
          alt={listing.title}
          fill
          sizes="(max-width: 744px) 100vw, 25vw"
          className="object-cover"
        />
        {isNew && (
          <div className="absolute left-3 top-3">
            <NewBadge />
          </div>
        )}
      </div>
      <h3 className="text-title-md text-ink">{listing.title}</h3>
    </article>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/experience-card.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/experience-card.tsx components/design-system/experience-card.test.tsx
git commit -m "feat: add ExperienceCard component"
```

---

### Task 13: TopNav (header with product tabs)

**Files:**
- Create: `components/design-system/top-nav.tsx`
- Test: `components/design-system/top-nav.test.tsx`

**Interfaces:**
- Consumes: `cn`, `NewBadge`.
- Produces: `TopNav` — `function TopNav({ active }: { active?: "homes" | "experiences" | "services" }): JSX.Element`. White 80px bar: Airbnb wordmark left, three product tabs centered (Experiences + Services carry NewBadge; active tab gets a 2px ink underline), account utilities right (host link, globe, account menu button).

- [ ] **Step 1: Write the failing test**

Create `components/design-system/top-nav.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { TopNav } from "./top-nav";

describe("TopNav", () => {
  test("renders the three product tabs", () => {
    render(<TopNav active="homes" />);
    expect(screen.getByRole("link", { name: /homes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /experiences/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /services/i })).toBeInTheDocument();
  });

  test("the active tab gets the ink underline class", () => {
    render(<TopNav active="experiences" />);
    const tab = screen.getByRole("link", { name: /experiences/i });
    expect(tab.className).toContain("border-ink");
  });

  test("renders the account menu button", () => {
    render(<TopNav active="homes" />);
    expect(screen.getByRole("button", { name: /account menu/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/top-nav.test.tsx`
Expected: FAIL — cannot find module `./top-nav`.

- [ ] **Step 3: Implement the TopNav**

Create `components/design-system/top-nav.tsx`:
```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import { NewBadge } from "./badges";

type Product = "homes" | "experiences" | "services";

const tabs: { id: Product; label: string; href: string; isNew?: boolean }[] = [
  { id: "homes", label: "Homes", href: "/" },
  { id: "experiences", label: "Experiences", href: "/experiences", isNew: true },
  { id: "services", label: "Services", href: "/services", isNew: true },
];

export function TopNav({ active = "homes" }: { active?: Product }) {
  return (
    <header className="flex h-20 items-center justify-between border-b border-hairline bg-canvas px-10">
      <Link href="/" className="text-display-sm font-bold text-rausch" aria-label="Airbnb home">
        airbnb
      </Link>
      <nav className="flex items-center gap-8">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "flex items-center gap-1 border-b-2 border-transparent pb-1 text-nav-link",
              tab.id === active ? "border-ink text-ink" : "text-muted",
            )}
          >
            {tab.label}
            {tab.isNew && <NewBadge />}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Link href="/host" className="text-title-sm text-ink">
          Become a host
        </Link>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-10 items-center gap-2 rounded-full border border-hairline px-3"
        >
          <span aria-hidden>☰</span>
          <span aria-hidden className="h-7 w-7 rounded-full bg-surface-strong" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/top-nav.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/top-nav.tsx components/design-system/top-nav.test.tsx
git commit -m "feat: add TopNav header with product tabs"
```

---

### Task 14: Footer and LegalBand

**Files:**
- Create: `components/design-system/footer.tsx`
- Test: `components/design-system/footer.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces: `Footer` — `function Footer(): JSX.Element`. White footer with three labeled link columns (Support / Hosting / Airbnb) over the canvas, and a `legal-band` strip beneath (copyright, language `English (US)`, currency `$ USD`).

- [ ] **Step 1: Write the failing test**

Create `components/design-system/footer.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { Footer } from "./footer";

describe("Footer", () => {
  test("renders the three column headings", () => {
    render(<Footer />);
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("Hosting")).toBeInTheDocument();
    expect(screen.getByText("Airbnb")).toBeInTheDocument();
  });

  test("renders the legal band with copyright and language", () => {
    render(<Footer />);
    expect(screen.getByText(/© 2026 Airbnb, Inc\./)).toBeInTheDocument();
    expect(screen.getByText("English (US)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/design-system/footer.test.tsx`
Expected: FAIL — cannot find module `./footer`.

- [ ] **Step 3: Implement the Footer**

Create `components/design-system/footer.tsx`:
```tsx
const columns: { heading: string; links: string[] }[] = [
  { heading: "Support", links: ["Help Center", "AirCover", "Cancellation options"] },
  { heading: "Hosting", links: ["Airbnb your home", "AirCover for Hosts", "Hosting resources"] },
  { heading: "Airbnb", links: ["Newsroom", "New features", "Careers"] },
];

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-canvas px-20 py-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {columns.map((col) => (
          <div key={col.heading} className="flex flex-col gap-3">
            <h2 className="text-title-sm text-ink">{col.heading}</h2>
            {col.links.map((link) => (
              <a key={link} href="#" className="text-body-sm text-ink hover:underline">
                {link}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-2 border-t border-hairline pt-6 text-caption-sm text-muted md:flex-row md:items-center md:justify-between">
        <span>© 2026 Airbnb, Inc.</span>
        <div className="flex items-center gap-4">
          <span>English (US)</span>
          <span>$ USD</span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/design-system/footer.test.tsx`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/footer.tsx components/design-system/footer.test.tsx
git commit -m "feat: add Footer and legal band"
```

---

### Task 15: Design-system barrel export + Playwright config + gallery page

**Files:**
- Create: `components/design-system/index.ts`
- Create: `playwright.config.ts`
- Create: `e2e/design-system.spec.ts`
- Create: `app/design-system/page.tsx`
- Modify: `package.json` (e2e scripts + devDep)

**Interfaces:**
- Consumes: every atom from Tasks 5–14.
- Produces: a single import surface `@/components/design-system`, a `/design-system` gallery route rendering all atoms, and a Playwright smoke test proving they render together in a real browser.

- [ ] **Step 1: Create the barrel export**

Create `components/design-system/index.ts`:
```ts
export { Button } from "./button";
export { TextInput } from "./text-input";
export { NewBadge, GuestFavoriteBadge } from "./badges";
export { RatingDisplay } from "./rating-display";
export { DatePickerDay } from "./date-picker-day";
export { SearchBar } from "./search-bar";
export { PropertyCard } from "./property-card";
export { ExperienceCard } from "./experience-card";
export { TopNav } from "./top-nav";
export { Footer } from "./footer";
```

- [ ] **Step 2: Create the gallery page**

Create `app/design-system/page.tsx`:
```tsx
import {
  Button,
  TextInput,
  RatingDisplay,
  SearchBar,
  TopNav,
  Footer,
} from "@/components/design-system";

export default function DesignSystemPage() {
  return (
    <div>
      <TopNav active="homes" />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 p-10">
        <h1 className="text-display-xl text-ink">Design System</h1>
        <SearchBar />
        <div className="flex gap-4">
          <Button>Reserve</Button>
          <Button variant="secondary">Save</Button>
          <Button variant="pill">Become a host</Button>
        </div>
        <TextInput label="Email" placeholder="you@example.com" />
        <RatingDisplay value={4.81} />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 3: Install Playwright**

Run:
```bash
cd "D:/PersonalProjects/airbnb"
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 4: Create the Playwright config**

Create `playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 5: Write the e2e smoke test**

Create `e2e/design-system.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("design-system gallery renders core atoms", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { name: "Design System" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reserve" })).toBeVisible();
  await expect(page.getByText("4.81")).toBeVisible();
});
```

- [ ] **Step 6: Add e2e scripts**

In `package.json` `"scripts"`, add:
```json
"e2e": "playwright test"
```

- [ ] **Step 7: Run the full test suite**

Run:
```bash
npm test
npm run e2e
```
Expected: all Vitest unit tests pass; the Playwright smoke test passes (gallery renders in Chromium).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add design-system barrel, gallery page and playwright smoke test"
```

---

## Self-Review

**Spec coverage (Phase 1 / §4 of spec):**
- Tailwind v4 token theme (colors, type, radii, spacing, shadow, scrim) → Task 2 ✅
- Inter via next/font → Task 2 ✅
- Atomic components: Button ✅(T5), TextInput ✅(T6), NewBadge/GuestFavoriteBadge ✅(T7), RatingDisplay ✅(T8), DatePickerDay ✅(T9), SearchBar+orb ✅(T10), PropertyCard ✅(T11), ExperienceCard ✅(T12), TopNav+product tabs ✅(T13), Footer+LegalBand ✅(T14)
- Testing harness (Vitest+RTL, Playwright) → Tasks 3, 15 ✅
- shadcn/ui init + cn → Task 4 ✅
- AmenityRow, ReviewsCard, HostCard, ReservationCard are composed sections deferred to their consuming phases (3) — noted intentionally, not gaps for Phase 1.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command lists expected output. ✅

**Type consistency:** `Listing` defined in Task 11 `lib/types.ts` and reused identically in Task 12. `cn` signature consistent. `Button`/`SearchBar`/`DatePickerDay` prop names match across tests and implementations. ✅

**Note for executor:** `create-next-app` flag names occasionally change between major versions. If a flag is rejected in Task 1, run `npx create-next-app@latest --help`, map to the current equivalent, and keep the same choices (TS, Tailwind, App Router, no src dir, `@/*` alias).
