// The splash belongs to the launch document, outside the router and React remounts.
export function playLaunch() {
  const paper = document.getElementById("launch-paper");
  const root = document.getElementById("root");
  if (!paper || !root) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motion = true;
  try { motion = localStorage.getItem("shifang.home.motion") !== "off"; } catch { /* Storage may be unavailable. */ }
  if (!motion || reduced.matches) {
    paper.remove();
    return;
  }

  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const entrance: Animation[] = [];
  const dismiss = () => {
    for (const animation of entrance) animation.cancel();
    uncover();
  };
  const uncover = () => {
    listeners.abort();
    window.clearTimeout(timeout);
    root.inert = false;
    paper.remove();
  };
  // A failed font load or interrupted animation must never hold the window open.
  const timeout = window.setTimeout(dismiss, 2400);
  root.inert = true;
  paper.hidden = false;
  paper.addEventListener("click", dismiss, options);
  paper.addEventListener("animationstart", event => {
    if (event.animationName !== "launch-reveal" || event.target !== paper) return;
    const home = root.querySelector(".home-scene");
    if (!home) return;
    // Start beneath the still-opaque paper. The landscape shows through first.
    const reveal = (selector: string, delay: number) => {
      for (const element of home.querySelectorAll(selector)) {
        entrance.push(element.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 540, delay, easing: "ease-out", fill: "backwards",
        }));
      }
    };
    reveal(".home-poem h1, .home-byline", 240);
    reveal(".home-verses", 430);
    reveal(".home-poem-switch, .home-continuations", 580);
  }, options);
  paper.addEventListener("animationend", event => {
    if (event.target !== paper) return;
    uncover();
    if (!entrance.length) return;
    const stop = () => entrance.forEach(animation => animation.cancel());
    reduced.addEventListener("change", stop, { once: true });
    void Promise.allSettled(entrance.map(animation => animation.finished))
      .then(() => reduced.removeEventListener("change", stop));
  }, options);
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") dismiss();
  }, options);
  reduced.addEventListener("change", event => { if (event.matches) dismiss(); }, options);
  void document.fonts.load('64px "Caizhang Title"', "采章").then(() => {
    if (paper.isConnected) paper.classList.add("is-playing");
  }, dismiss);
}
