# Remotion Service Demo Video Design

## Purpose

Create a 45-60 second Remotion demo video for the service introduction page. The video should combine a short product introduction with concrete UI-based usage scenes, so a first-time visitor understands that Pets-Driven turns AI agent work into visible desktop pets.

The video should feel like a product demo, not a purely conceptual animation. It will use UI components that already exist in the repository, then layer Remotion-controlled camera movement, cursor motion, captions, and callouts on top.

## Audience

The primary audience is a developer who is curious about AI agents but has not seen Pets-Driven before. They should leave the video understanding three things:

- A pet can be summoned from the desktop main window.
- A pet represents a bound working directory and can activate its terminal channel.
- Multiple pets can live on the desktop and interact while representing ongoing work.

## Chosen Approach

Use a hybrid "real product UI plus Remotion overlay" style.

The underlying scenes should be composed from implemented React UI where practical:

- `HomeSection` and `PetShowcaseCard` for the desktop main window and card deployment moment.
- `PetWindowView`, `PetSprite`, and pet status presentation styles for the summoned pet.
- Existing simulation and pet rendering primitives for the multi-pet desktop interaction scene.
- Existing design-system assets, typography, colors, pet portraits, status cards, and terminal-like UI surfaces.

Remotion should own the sequence timing, camera framing, zooms, cursor choreography, short captions, and callout labels.

## Runtime Format

- Duration: 45-60 seconds.
- Recommended target: 60 seconds.
- Aspect ratio: 16:9.
- Default resolution: 1920x1080.
- Intended usage: embedded on the service introduction page.
- Audio is optional for the first implementation; the visual story must work silently.

## Storyboard

### Scene 1: Product Context

Approximate timing: 0-5 seconds.

Show the Pets-Driven product identity and the desktop main window. The viewer should immediately see a real application surface rather than a marketing-only hero.

Primary UI:

- Main window frame.
- `HomeSection` with the pet card fan.
- Pets-Driven mark or wordmark.

Caption:

> Your agents, visible on your desktop.

### Scene 2: Summon a Pet

Approximate timing: 5-18 seconds.

Show a cursor grabbing one pet card in the main window and dragging it upward to deploy it onto the desktop. The card should visibly lift from the fan, cross the deploy threshold, and resolve into a pet on the desktop.

Primary UI:

- `HomeSection` drag visual state.
- `PetShowcaseCard`.
- A pet sprite or pet window appearing after deployment.

Callout:

> Drag a pet card to summon it.

### Scene 3: Activate the Terminal Channel

Approximate timing: 18-32 seconds.

Show the summoned pet on the desktop. The cursor double-clicks the pet body. The pet reacts, and a terminal-like surface becomes active or focused.

Primary UI:

- `PetWindowView`-style pet surface.
- `PetSprite`.
- Pet status card with pet name and working directory.
- Terminal-like panel using existing terminal preview styling or an equivalent product surface.

Callouts:

> Double-click the pet.

> Terminal channel activated.

### Scene 4: Bound Agent Ready

Approximate timing: 32-42 seconds.

Briefly show that the terminal channel belongs to the pet's working directory. This should make the pet-agent relationship clear without turning into a long terminal tutorial.

Primary UI:

- Terminal preview or terminal surface.
- Working directory label.
- Pet status card near the pet.

Caption:

> The bound agent is ready.

### Scene 5: Multi-Pet Desktop Surface

Approximate timing: 42-58 seconds.

Show several pets moving around the desktop surface at the same time. They should feel alive and independent, with simple interaction such as approaching, avoiding, bumping, or status changes.

Primary UI:

- Multiple `PetSprite` instances.
- Existing simulation-style movement.
- Status overlays or compact labels.

Callout:

> Each pet carries one working directory.

### Scene 6: Closing Moment

Approximate timing: 58-60 seconds.

End with a short product identity frame and a small pack of pets.

Caption:

> Send the pack.

## Component Boundaries

### Video Composition

The Remotion composition should be the top-level timeline. It should not depend on browser scroll events, live pointer events, Tauri APIs, or real system windows.

Responsibilities:

- Define scene timing.
- Position product UI panels.
- Animate cursor movement and camera focus.
- Render captions and callouts.
- Coordinate transitions between product scenes.

### Product UI Scene Adapters

Some existing components are interactive or Tauri-bound. The video should wrap or adapt them into deterministic presentation scenes where needed.

Responsibilities:

- Provide static or time-driven props.
- Recreate drag, summon, double-click, and focus states without requiring real pointer input.
- Keep visual styling aligned with existing product UI.

### Pet Simulation Scene

The multi-pet segment should use existing pet rendering and simulation concepts, but the video timeline must remain deterministic.

Responsibilities:

- Render multiple pets with predictable positions.
- Show simple movement and interaction.
- Avoid random behavior unless seeded.

### Caption and Callout Layer

Captions and callouts should be Remotion-specific overlays, separate from product UI components.

Responsibilities:

- Explain the action in short product-demo language.
- Avoid long instructional text.
- Keep all text readable at 1920x1080 and when scaled down in the landing page embed.

## Data Flow

The first implementation should use deterministic fixture data rather than live app state.

Suggested fixture data:

- A pack with three or more pets.
- At least one pet assigned to a working directory.
- One deployed pet used for the terminal activation scene.
- A simulated terminal channel state for the focused pet.
- Multi-pet positions and animation intents driven by frame number or a seeded simulation.

The Remotion timeline should convert the current frame into scene progress values. Scene adapters should consume those values and render the appropriate product state.

## Visual Direction

The video should look like a polished product demo:

- Product UI remains credible and close to the actual app.
- Camera motion and zooms guide attention.
- Cursor animation makes the user actions obvious.
- Captions and callouts clarify meaning without covering important UI.
- The palette and typography should follow the design system.

The video should avoid becoming a separate illustrated explainer that hides the product UI.

## Error Handling and Fallbacks

The Remotion render should not depend on runtime Tauri APIs. Any Tauri-specific behavior from `PetWindowView` should be represented through a browser-safe adapter.

Asset loading should use repository assets where possible. If a pet asset fails to load during local preview, the composition should fall back to an existing fallback pet sprite rather than rendering an empty scene.

The first implementation may skip audio. Missing audio must not block the viewer from understanding the story.

## Testing and Verification

The implementation plan should include:

- A Remotion package/version check.
- Type checking for new Remotion files where possible.
- A composition discovery command, such as `remotion compositions`, once the entry point exists.
- A short still-frame or render smoke test for at least one frame from each scene.
- Manual visual QA at 1920x1080 to confirm text is readable, assets render, and no UI overlaps key actions.

Known current baseline issue:

- `@pets-driven/web` typecheck currently fails on existing design-system pet PNG module resolution. This is not part of the video design, but the implementation plan should account for it when choosing verification commands.

## Out of Scope

- Recording the actual desktop application through Tauri.
- Adding production terminal integration.
- Changing the service's runtime interaction model.
- Reworking the existing landing page copy.
- Adding voiceover or sound design in the first pass.

