/*
 * scroll.js - run inside a browser page (orca eval) by scan.zsh before extracting.
 * Scrolls down the page in steps so lazy-loaded sections and scroll-triggered
 * animations render, then returns to the top. Stops after 40 steps (endless feeds).
 */
(async () => {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const height = () => document.documentElement.scrollHeight;
  let y = 0;
  let steps = 0;
  while (y + innerHeight < height() && steps < 40) {
    y += Math.round(innerHeight * 0.8);
    scrollTo(0, y);
    await pause(250);
    steps++;
  }
  await pause(400);
  scrollTo(0, 0);
  await pause(400);
  return JSON.stringify({ height: height(), steps });
})()
