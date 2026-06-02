# Product Pet Window Playground Design

## Goal

Build the first product-integrated Pet Window path so the management surface can open real Tauri/native desktop overlay windows and render Codex-compatible pets above the desktop. This slice is for native window behavior verification, not a separate harness and not yet the full Simulation Host flow.

## Scope

The management surface gets compact controls to open one Pet Window, open three Pet Windows, and close the Pet Windows created by this slice. Each Pet Window hosts one visible Pet in its own transparent, undecorated, always-on-top Tauri `WebviewWindow`, uses the real Codex spritesheet loader with bundled Patamon fallback, and renders a single atlas frame or lightweight animation on a transparent page.

This slice includes a first approximate hit-region routing path in the webview: body clicks and drags are reported as body actions, overlay clicks are reported as overlay actions, overlay drags do not start body dragging, and transparent page areas ask the native window to ignore cursor events so the desktop behind can receive input. The exact OS-level behavior must still be manually verified in Tauri because browser-only tests cannot prove click-through.

## Architecture

Rust owns native Pet Window creation through explicit commands invoked by the management surface. The created windows load the same `index.html` bundle with query parameters that route React into a Pet Window view instead of the management view.

The frontend adds a small `pet-window` feature area responsible for resolving query parameters, loading the spritesheet, drawing the atlas frame to a canvas, and classifying pointer coordinates against approximate body and overlay masks. The body and overlay classification stays in pure TypeScript so Vitest can cover the routing rules before the native window is wired in.

Native click-through is toggled from the Pet Window webview with Tauri's `setIgnoreCursorEvents`. The implementation will start conservative: pointer movement over a known body or overlay mask enables cursor events; movement outside those masks disables cursor events so transparent window pixels pass through.

## Out Of Scope

This slice does not connect Pet Windows to the Simulation Host, publish world snapshots, persist window state, implement full context menus, or solve alpha-perfect per-frame hit testing. Multi-pet motion smoothness will be checked by opening multiple independent Pet Windows, but shared world collision remains a later slice.

## Verification

Automated checks cover route selection, window command payload shape, pet-window rendering setup, and hit-region classification. Native verification must run through Tauri and manually check that transparent pixels pass through, body clicks and drags are recognized, overlay clicks are separate, and three Pet Windows can be opened without interfering with normal desktop work.
