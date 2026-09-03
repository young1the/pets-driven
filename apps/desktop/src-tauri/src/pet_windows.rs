use serde::Deserialize;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::pet_assets::validate_asset_id;

/// The single-window overlay's label. Deliberately not under the `pet-window-`
/// prefix that `close_all_pet_windows` sweeps: the host calls that very command
/// when it *switches into* this mode, to clear away the per-pet windows it is
/// replacing, and a label in the sweep would destroy the overlay it is opening
/// in the same breath. The overlay is closed explicitly instead — by the host
/// that knows whether it still has pets to draw.
pub(crate) const PET_OVERLAY_LABEL: &str = "pet-overlay";

const PET_WINDOW_PLAYGROUND_MAX_WINDOWS: u8 = 7;
const PET_WINDOW_PLAYGROUND_FIXTURES: [(&str, &str); 7] = [
    ("pet-a", "cato"),
    ("pet-b", "otto"),
    ("pet-c", "mochi"),
    ("pet-d", "fenn"),
    ("pet-e", "bloop"),
    ("pet-f", "pip"),
    ("pet-g", "cato"),
];

fn pet_window_playground_count(count: Option<u8>) -> u8 {
    count
        .unwrap_or(1)
        .clamp(1, PET_WINDOW_PLAYGROUND_MAX_WINDOWS)
}

fn pet_window_playground_label(index: u8) -> String {
    format!("pet-window-playground-{index}")
}

fn pet_window_playground_pet_id(index: u8) -> &'static str {
    PET_WINDOW_PLAYGROUND_FIXTURES
        .get(usize::from(index.saturating_sub(1)))
        .map(|fixture| fixture.0)
        .unwrap_or("pet-a")
}

fn pet_window_playground_asset_id(index: u8) -> &'static str {
    PET_WINDOW_PLAYGROUND_FIXTURES
        .get(usize::from(index.saturating_sub(1)))
        .map(|fixture| fixture.1)
        .unwrap_or("cato")
}

/// Overlay windows load their own lean entry, never `index.html`: loading the
/// main window's bundle in every pet webview is what made a dozen deployed pets
/// cost hundreds of megabytes.
pub(crate) const PET_OVERLAY_ENTRY: &str = "pet-window.html";

fn pet_window_playground_url(index: u8) -> String {
    format!(
        "{PET_OVERLAY_ENTRY}?surface=pet-window&petId={}&assetId={}&windowIndex={index}",
        pet_window_playground_pet_id(index),
        pet_window_playground_asset_id(index),
    )
}

#[tauri::command]
pub(crate) async fn open_pet_window_playground(
    app: tauri::AppHandle,
    count: Option<u8>,
) -> Result<(), String> {
    let count = pet_window_playground_count(count);

    for index in 1..=count {
        let label = pet_window_playground_label(index);

        if let Some(window) = app.get_webview_window(&label) {
            window
                .show()
                .map_err(|error| format!("Could not show {label}: {error}"))?;
            continue;
        }

        WebviewWindowBuilder::new(
            &app,
            label.clone(),
            WebviewUrl::App(pet_window_playground_url(index).into()),
        )
        .title(format!("Pet Window {index}"))
        .inner_size(192.0, 268.0)
        .position(120.0 + f64::from(index.saturating_sub(1)) * 220.0, 120.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|error| format!("Could not create {label}: {error}"))?;
    }

    Ok(())
}

/// Create one adopted pet's overlay window, or no-op if it already exists.
///
/// Shared by the single-pet command and the batch opener so both build the
/// window identically. The window is created hidden; the simulation shows it on
/// its first placement (see place_pet_windows) so it never flashes at the origin.
fn build_adopted_pet_window(
    app: &tauri::AppHandle,
    pet_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    validate_asset_id(pet_id).map_err(|_| "Invalid pet id".to_string())?;
    validate_asset_id(asset_id)?;

    let label = format!("pet-window-{pet_id}");

    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    let url = format!(
        "{PET_OVERLAY_ENTRY}?surface=pet-window&petId={pet_id}&assetId={asset_id}&windowIndex=1"
    );

    WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::App(url.into()))
        .title("Pet Window")
        .inner_size(192.0, 268.0)
        .position(120.0, 120.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|error| format!("Could not create {label}: {error}"))?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn open_adopted_pet_window(
    app: tauri::AppHandle,
    pet_id: String,
    asset_id: String,
) -> Result<(), String> {
    build_adopted_pet_window(&app, &pet_id, &asset_id)
}

/// One pet's window request for the batch opener.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AdoptedPetWindowSpec {
    pet_id: String,
    asset_id: String,
}

/// Open every home pet's overlay window in one shell call.
///
/// "Show all" used to invoke open_adopted_pet_window once per pet, so a large
/// roster paid a full IPC round trip per window on the main thread and visibly
/// stuttered — the same per-pet-IPC problem place_pet_windows already solved for
/// movement. The host now hands the whole batch over once and the windows are
/// built natively in a single hop. One pet's failure is collected and reported
/// rather than aborting the rest of the batch.
#[tauri::command]
pub(crate) async fn open_adopted_pet_windows(
    app: tauri::AppHandle,
    specs: Vec<AdoptedPetWindowSpec>,
) -> Result<(), String> {
    let mut errors = Vec::new();

    for spec in specs {
        if let Err(error) = build_adopted_pet_window(&app, &spec.pet_id, &spec.asset_id) {
            errors.push(error);
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

/// One pet's screen placement for a single simulation frame.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetWindowPlacement {
    pet_id: String,
    x: f64,
    y: f64,
}

/// Move every moving pet's overlay window in one call.
///
/// The host used to reach each pet window over IPC with its frame, wait for
/// that webview to run JS, and have it call back into the shell to move itself
/// — two round trips per pet per frame, so a dozen pets cost roughly 1500 IPC
/// hops a second and the app visibly stuttered. The host now sends the whole
/// batch here once per frame and the moves happen natively.
///
/// A window is created hidden and shown on its first placement, so it never
/// flashes at the origin before the simulation has told it where to stand.
///
/// Returns the pets whose window did not exist yet. The host skips pets that
/// have not moved since their last placement, so without this a window that
/// finished creating just after its first batch went out could sit hidden
/// forever behind a pet that happened to stand still.
#[tauri::command]
pub(crate) async fn place_pet_windows(
    app: tauri::AppHandle,
    placements: Vec<PetWindowPlacement>,
) -> Result<Vec<String>, String> {
    let mut unplaced = Vec::new();

    for placement in placements {
        let Some(window) = app.get_webview_window(&format!("pet-window-{}", placement.pet_id))
        else {
            unplaced.push(placement.pet_id);
            continue;
        };

        window
            .set_position(LogicalPosition::new(placement.x, placement.y))
            .map_err(|error| format!("Could not place {}: {error}", placement.pet_id))?;

        if !window.is_visible().unwrap_or(true) {
            window
                .show()
                .map_err(|error| format!("Could not show {}: {error}", placement.pet_id))?;
        }
    }

    Ok(unplaced)
}

/// The overlay's lean entry, on the surface route the single window renders.
fn pet_overlay_url() -> String {
    format!("{PET_OVERLAY_ENTRY}?surface=pet-overlay")
}

/// Open (or re-fit) the single window every pet is drawn inside.
///
/// The counterpart to `build_adopted_pet_window`: one transparent, borderless,
/// always-on-top window covering the whole desktop instead of one small window
/// per pet. It is created hidden and made click-through *before* it is ever
/// shown — a full-desktop window that takes the mouse swallows every click
/// meant for whatever is underneath it, so it must never exist visibly in that
/// state, not even for the frame between build and the first host command.
/// From then on the host owns the switch; see `set_pet_overlay_interactive`.
///
/// Called again on every world rebuild, which is what re-fits it when the
/// monitor layout changes.
///
/// The size asked for here is deliberately *larger than the desktop* — the
/// overlay adds a cell of slack on every side so a pet at the edge of a monitor
/// can still draw its bubble (see `petOverlayWindowRect`) — and Windows refuses
/// that by default: `WM_WINDOWPOSCHANGING` clamps every window to the virtual
/// screen plus a border's worth of slack, so the overlay came out roughly a
/// screen tall while the host still addressed it as the full rect. Everything
/// below the clamped edge was cut off, which is exactly where pets stand: they
/// walked off the bottom of the window and vanished. Raising the limit is what
/// `set_max_size` does — it is what tao answers `WM_GETMINMAXINFO` with — and it
/// only takes effect once the window's state is attached, i.e. after creation,
/// so the size is applied again below rather than left to the builder.
#[tauri::command]
pub(crate) async fn open_pet_overlay_window(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let position = LogicalPosition::new(x, y);
    let size = LogicalSize::new(width, height);

    if let Some(window) = app.get_webview_window(PET_OVERLAY_LABEL) {
        window
            .set_max_size(Some(size))
            .map_err(|error| format!("Could not lift the pet overlay's size limit: {error}"))?;
        window
            .set_position(position)
            .map_err(|error| format!("Could not place the pet overlay: {error}"))?;
        window
            .set_size(size)
            .map_err(|error| format!("Could not size the pet overlay: {error}"))?;
        window
            .show()
            .map_err(|error| format!("Could not show the pet overlay: {error}"))?;

        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        PET_OVERLAY_LABEL,
        WebviewUrl::App(pet_overlay_url().into()),
    )
    .title("Pets")
    .inner_size(width, height)
    .max_inner_size(width, height)
    .position(x, y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false)
    .visible(false)
    .focused(false)
    .build()
    .map_err(|error| format!("Could not create the pet overlay: {error}"))?;

    // The window was created clamped: the constraint above is only answered from
    // the window state, which is attached after the native window exists.
    window
        .set_size(size)
        .map_err(|error| format!("Could not size the pet overlay: {error}"))?;
    window
        .set_position(position)
        .map_err(|error| format!("Could not place the pet overlay: {error}"))?;

    window
        .set_ignore_cursor_events(true)
        .map_err(|error| format!("Could not make the pet overlay click-through: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Could not show the pet overlay: {error}"))?;

    Ok(())
}

/// Hand the mouse to the overlay, or back to the desktop underneath it.
///
/// The host calls this from its own hit test — the overlay cannot do it itself,
/// because a click-through window is not told where the cursor is. Missing is
/// not an error: the host toggles this on cursor movement and the window may
/// already be gone.
#[tauri::command]
pub(crate) async fn set_pet_overlay_interactive(
    app: tauri::AppHandle,
    interactive: bool,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(PET_OVERLAY_LABEL) else {
        return Ok(());
    };

    window
        .set_ignore_cursor_events(!interactive)
        .map_err(|error| format!("Could not set the pet overlay's cursor mode: {error}"))
}

#[tauri::command]
pub(crate) async fn close_pet_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PET_OVERLAY_LABEL) {
        window
            .destroy()
            .map_err(|error| format!("Could not close the pet overlay: {error}"))?;
    }

    Ok(())
}

// ── Trinket overlay windows ────────────────────────────────────────────────
//
// A trinket is a world entity that is not a pet, so it needs its own overlay
// window: small, transparent, click-through, and owned entirely by the
// simulation. Unlike a pet window there is no frame stream — a trinket never
// changes appearance and never moves once it lands — so the host reconciles the
// whole set in one call and the window itself renders straight from its URL.

const ITEM_WINDOW_LABEL_PREFIX: &str = "item-window-";
/// The pet context menu's size, kept in step with MENU_WINDOW_SIZE in
/// pet-context-menu-view.tsx. The view sets its own size once it mounts; these
/// are what the window is born at, and what the edge-clamp below measures with,
/// so a menu opened near the bottom of a screen flips by its real height.
const MENU_WINDOW_WIDTH: f64 = 192.0;
const MENU_WINDOW_HEIGHT: f64 = 237.0;
const ITEM_WINDOW_SIZE: f64 = 64.0;


/// One trinket's screen placement for a single simulation frame.
///
/// Trinkets and props share this overlay because on screen they are the same
/// thing: one glyph in one tiny always-on-top square for one non-pet entity.
/// The difference is that a prop moves, which costs nothing extra here — the
/// reconcile below already repositions a window it has rather than rebuilding
/// it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemWindowSpec {
    item_id: String,
    kind: String,
    /// Whether this overlay takes the mouse or lets it fall through to the
    /// desktop. Sent per window rather than derived from `kind`, because it is
    /// the engine that knows — it is a `CanDrag` on the entity — and a copy of
    /// "which kinds are grabbable" kept over here is a copy that falls behind.
    grabbable: bool,
    x: f64,
    y: f64,
}

fn item_window_label(item_id: &str) -> String {
    format!("{ITEM_WINDOW_LABEL_PREFIX}{item_id}")
}

fn item_window_url(item_id: &str, kind: &str) -> String {
    format!("{PET_OVERLAY_ENTRY}?surface=item-window&itemId={item_id}&kind={kind}")
}

/// Reconcile the trinket overlays to exactly the set the simulation reports.
///
/// Windows are created for new drops, moved for ones that are still there, and
/// destroyed for anything the world no longer has — which is how a collected or
/// faded trinket disappears. One batched call per change, the same shape as
/// place_pet_windows, so a drop never costs a round trip per window.
#[tauri::command]
pub(crate) async fn sync_item_windows(
    app: tauri::AppHandle,
    items: Vec<ItemWindowSpec>,
) -> Result<(), String> {
    let mut wanted = Vec::new();

    for item in items {
        validate_asset_id(&item.item_id).map_err(|_| "Invalid item id".to_string())?;
        // `kind` is interpolated into the window URL below without escaping, so
        // it is checked before it goes in — but checked for *shape*, not for
        // membership of a list.
        //
        // A list is what this used to be: a hand-kept copy of `WorldPropKind` +
        // `PetItemKind`, with an unknown kind skipped rather than fatal so that
        // one unrecognised overlay could not take the rest of the desktop with
        // it. That is a sound failure mode for the wrong check. Nothing linked
        // the two lists, this one fell behind the moment a prop kind was added,
        // and the result was an obstacle that kept its body and its collision
        // and simply never got a window — an invisible hurdle the pet tripped
        // over. The shell does not draw these and has no business knowing what
        // they are; the engine's own types are what close the set, and the
        // overlay's route is what turns a kind into a picture.
        //
        // What the shell is entitled to check is that the string cannot break
        // out of the URL, and the id rule already says exactly that: ASCII
        // alphanumerics, hyphen and underscore, so no `&`, `#`, `/` or `?`.
        validate_asset_id(&item.kind).map_err(|_| "Invalid item kind".to_string())?;

        let label = item_window_label(&item.item_id);
        wanted.push(label.clone());

        let position = LogicalPosition::new(item.x, item.y);
        // A trinket is scenery, not a target: its clicks belong to whatever is
        // behind it on the desktop. A prop the user can pick up is a target —
        // the engine gives it `CanDrag`, and this window is how a pointer ever
        // reaches it. Which is which comes over on the spec, from that very
        // component, rather than from a second list kept here.
        let click_through = !item.grabbable;

        if let Some(window) = app.get_webview_window(&label) {
            window
                .set_position(position)
                .map_err(|error| format!("Could not place {label}: {error}"))?;
            // Re-asserted on every reconcile rather than only at creation. A
            // window that outlives a change to this rule would otherwise keep
            // whatever it was born with — which is precisely what happened
            // while a dev session hot-reloaded the frontend under a ball whose
            // window had been created click-through, leaving a surface that
            // rendered the grab cursor and never received a pointer.
            window.set_ignore_cursor_events(click_through).ok();
            continue;
        }

        let window = WebviewWindowBuilder::new(
            &app,
            label.clone(),
            WebviewUrl::App(item_window_url(&item.item_id, &item.kind).into()),
        )
        .title("Trinket")
        .inner_size(ITEM_WINDOW_SIZE, ITEM_WINDOW_SIZE)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .build()
        .map_err(|error| format!("Could not create {label}: {error}"))?;

        // Placed through the same `set_position` the reconcile above uses, and
        // deliberately not through the builder's `.position()`. The two do not
        // agree on units, so a window took one place when it was created and a
        // different one the first time it moved. Nobody could see that on a
        // trinket, which never moves — but the ball is a *target*: the host
        // hit-tests a click by turning the pointer's screen position into a
        // world position, so a window sitting where the world does not think it
        // is means clicking the ball you can see misses the ball that exists.
        // It fixed itself the moment a pet kicked it, which is exactly the
        // clue that found this.
        window
            .set_position(position)
            .map_err(|error| format!("Could not place {label}: {error}"))?;

        window.set_ignore_cursor_events(click_through).ok();
    }

    for (label, window) in app.webview_windows() {
        if label.starts_with(ITEM_WINDOW_LABEL_PREFIX) && !wanted.contains(&label) {
            window
                .destroy()
                .map_err(|error| format!("Could not close {label}: {error}"))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn close_all_item_windows(app: tauri::AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with(ITEM_WINDOW_LABEL_PREFIX) {
            window
                .destroy()
                .map_err(|error| format!("Could not close {label}: {error}"))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn close_all_pet_windows(app: tauri::AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with("pet-window-") {
            window
                .destroy()
                .map_err(|error| format!("Could not close {label}: {error}"))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn close_adopted_pet_window(
    app: tauri::AppHandle,
    pet_id: String,
) -> Result<(), String> {
    validate_asset_id(&pet_id).map_err(|_| "Invalid pet id".to_string())?;

    let label = format!("pet-window-{pet_id}");

    if let Some(window) = app.get_webview_window(&label) {
        window
            .destroy()
            .map_err(|error| format!("Could not close {label}: {error}"))?;
    }

    let menu_label = format!("pet-context-menu-{pet_id}");

    if let Some(menu_window) = app.get_webview_window(&menu_label) {
        menu_window.destroy().ok();
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn open_pet_context_menu(
    app: tauri::AppHandle,
    pet_id: String,
    url: String,
    local_x: f64,
    local_y: f64,
) -> Result<(), String> {
    validate_asset_id(&pet_id).map_err(|_| "Invalid pet id".to_string())?;

    let label = format!("pet-context-menu-{pet_id}");

    // Derive physical screen position from the source window's outer position so
    // the context menu lands on the correct monitor in multi-monitor setups.
    // local_x/y are CSS pixels relative to that window's content area
    // (clientX/clientY). The source is the pet's own window, or the single-window
    // overlay when the pet does not have one — the arithmetic is the same either
    // way, since both report where their content area starts on screen.
    let source_window = app
        .get_webview_window(&format!("pet-window-{pet_id}"))
        .or_else(|| app.get_webview_window(PET_OVERLAY_LABEL));
    let (mut phys_x, mut phys_y) = match &source_window {
        Some(pet_win) => {
            let scale = pet_win.scale_factor().unwrap_or(1.0);
            match pet_win.outer_position() {
                Ok(pos) => (
                    pos.x + (local_x * scale) as i32,
                    pos.y + (local_y * scale) as i32,
                ),
                Err(_) => (local_x as i32, local_y as i32),
            }
        }
        None => (local_x as i32, local_y as i32),
    };

    // Clamp so the menu stays within the monitor the click landed on. Resolved
    // from the point rather than from the source window, which only agree in
    // window-per-pet mode: the single-window overlay spans every monitor, so
    // asking *it* which monitor it is on answers for the desktop, not the pet.
    if let Some(pet_win) = &source_window {
        let monitor = pet_win
            .monitor_from_point(f64::from(phys_x), f64::from(phys_y))
            .ok()
            .flatten()
            .or_else(|| pet_win.current_monitor().ok().flatten());

        if let Some(monitor) = monitor {
            let scale = monitor.scale_factor();
            let menu_w = (MENU_WINDOW_WIDTH * scale) as i32;
            let menu_h = (MENU_WINDOW_HEIGHT * scale) as i32;
            let pos = monitor.position();
            let size = monitor.size();
            let right = pos.x + size.width as i32;
            let bottom = pos.y + size.height as i32;
            if phys_x + menu_w > right {
                phys_x -= menu_w;
            }
            if phys_y + menu_h > bottom {
                phys_y -= menu_h;
            }
        }
    }

    let physical_position =
        tauri::Position::Physical(tauri::PhysicalPosition::new(phys_x, phys_y));

    // Reuse an existing hidden window rather than cold-booting a new WebView2
    // instance — navigation within an existing process is much faster than creation.
    if let Some(existing) = app.get_webview_window(&label) {
        let safe_url = url.replace('\'', "%27");
        existing
            .eval(&format!("window.location.replace('/{safe_url}')"))
            .ok();
        existing.set_position(physical_position).ok();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(url.into()))
        .title("Pet Menu")
        .inner_size(MENU_WINDOW_WIDTH, MENU_WINDOW_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|error| format!("Could not create {label}: {error}"))?;

    win.set_position(physical_position)
        .map_err(|error| format!("Could not position {label}: {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_window_playground_count_defaults_to_one_and_clamps_to_fixture_count() {
        assert_eq!(pet_window_playground_count(None), 1);
        assert_eq!(pet_window_playground_count(Some(0)), 1);
        assert_eq!(pet_window_playground_count(Some(3)), 3);
        assert_eq!(pet_window_playground_count(Some(9)), 7);
    }

    #[test]
    fn pet_window_playground_labels_are_stable() {
        assert_eq!(pet_window_playground_label(3), "pet-window-playground-3");
    }

    #[test]
    fn pet_overlay_url_routes_to_the_overlay_surface() {
        assert_eq!(pet_overlay_url(), "pet-window.html?surface=pet-overlay");
    }

    #[test]
    fn pet_overlay_label_is_outside_the_swept_pet_window_prefix() {
        assert!(!PET_OVERLAY_LABEL.starts_with("pet-window-"));
    }

    #[test]
    fn item_window_label_and_url_are_stable() {
        assert_eq!(
            item_window_label("item-wings-3"),
            "item-window-item-wings-3"
        );
        assert_eq!(
            item_window_url("item-wings-3", "wings"),
            "pet-window.html?surface=item-window&itemId=item-wings-3&kind=wings"
        );
    }

    #[test]
    fn a_kind_is_checked_for_shape_and_not_for_membership() {
        // The shell keeps no list of kinds. It draws none of them — the overlay
        // route does, from the engine's own catalogue — so the only thing it is
        // entitled to check is that the string cannot break out of the query it
        // gets interpolated into.
        for kind in ["wings", "claws", "ball", "hurdle", "hurdle-tall", "book-stack"] {
            assert!(validate_asset_id(kind).is_ok(), "{kind} should be usable");
        }

        // The point of the rule: a kind added to the engine tomorrow works here
        // today. A list meant the opposite — an obstacle whose kind had not
        // been copied over kept its body and its collision and never got a
        // window, which on screen is an invisible hurdle the pet trips over.
        assert!(validate_asset_id("a-kind-added-later").is_ok());

        for injected in [
            "hurdle&surface=pet-window",
            "hurdle#x",
            "../index.html",
            "hurdle?a=b",
            "",
        ] {
            assert!(
                validate_asset_id(injected).is_err(),
                "{injected:?} must not reach the URL"
            );
        }
    }

    #[test]
    fn pet_window_playground_url_routes_to_pet_window_surface() {
        assert_eq!(
            pet_window_playground_url(2),
            "pet-window.html?surface=pet-window&petId=pet-b&assetId=otto&windowIndex=2"
        );
        assert_eq!(
            pet_window_playground_url(7),
            "pet-window.html?surface=pet-window&petId=pet-g&assetId=cato&windowIndex=7"
        );
    }
}
