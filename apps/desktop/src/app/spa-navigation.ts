// Fixture switching used to call `window.location.assign(url)`, which does a
// full page reload — the entire Tauri/Vite dev bundle re-fetches and
// re-parses just to swap a query param. `pushSearchParams` updates the URL
// via the History API instead; callers pair it with a re-render trigger
// (see `main.tsx`'s `navVersion`) so React remounts the fixture-driven
// subtree in place, without a navigation.
export function pushSearchParams(mutate: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  mutate(params);
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.pushState(window.history.state, "", url);
}
