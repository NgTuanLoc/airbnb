// jsdom has no AnimationEvent, so React DOM, deciding as it loads, would listen for webkitAnimationEnd instead of
// animationend. Imported before React DOM (vitest.setup.ts), this makes onAnimationEnd hear animationend, as in browsers.
// Tests in the node environment have no window at all.
if (typeof window !== "undefined" && !("AnimationEvent" in window)) {
  Object.assign(window, { AnimationEvent: class AnimationEvent extends Event {} });
}
