# Pets-Driven

Pets-Driven is a development companion context where visible pets represent agent work without collapsing user-facing personality into terminal execution details.

## Language

**Pet**:
A user-facing companion that represents exactly one bound agent execution subject.
_Avoid_: agent, terminal

**Agent Source**:
An execution subject that emits task and attention events for a bound **Pet**.
_Avoid_: pet, process

**Terminal Channel**:
The single user-facing terminal connection between a **Pet** and its active **Agent Source**.
_Avoid_: session

**Agent Event Feed**:
The hook-driven event stream that lets a **Pet** express work state for its **Working Directory**.
_Avoid_: terminal channel

**Attention Hold**:
A user-acknowledged state where a **Pet** stops moving and shows an attention badge or ring after an event.
_Avoid_: terminal focus, notification only

**Review Hold**:
An **Attention Hold** created by a completed task that still requires the user to notice the result.
_Avoid_: idle completion

**External Terminal Channel**:
A **Terminal Channel** that is owned by a terminal outside the pets-driven app.
_Avoid_: unmanaged terminal

**Attach**:
The act of registering a terminal as the active **Terminal Channel** for a **Working Directory**.
_Avoid_: detect, auto-bind

**Attach Command**:
A command run inside an external terminal to attach it to the **Pet** for the current **Working Directory**.
_Avoid_: automatic terminal discovery

**Hook Bridge**:
The command or adapter that forwards agent hook events to pets-driven with their **Working Directory** context.
_Avoid_: trusted provider session identity

**Hook Setup**:
The service setting that installs or configures a **Hook Bridge** for agent event forwarding.
_Avoid_: attach side effect

**Workspace**:
A saved collection of explicitly chosen **Working Directories** that pets-driven manages together.
_Avoid_: parent folder, discovered project tree

**Working Directory**:
The filesystem directory that acts as the identity boundary for one **Pet**.
_Avoid_: cwd, folder

**Registered Working Directory**:
A **Working Directory** that the user has explicitly chosen for pets-driven management.
_Avoid_: discovered directory, child workspace

**Working Directory Creation**:
The user-initiated creation of a new **Working Directory** before registration.
_Avoid_: scaffold, clone

**Pet Birth**:
The moment a **Working Directory** becomes registered and its **Pet** starts existing.
_Avoid_: setup completion, agent creation

**Root Project**:
An optional reference or grouping label for related **Registered Working Directories**.
_Avoid_: execution boundary, permission boundary

**Execution Environment**:
A saved runtime boundary for a **Pet**, rooted in one **Registered Working Directory**.
_Avoid_: terminal, shell

**Launch Configuration**:
The command and terminal details used to start an **Agent Source** from an **Execution Environment**.
_Avoid_: execution environment

**Launch Readiness**:
Whether a **Pet** has enough saved launch information to open a **Terminal Channel**.
_Avoid_: configured, enabled

**Pet Profile**:
The personality, speech behavior, and visual asset settings for a **Pet**.
_Avoid_: character, config

**Pet Asset**:
The installed visual package and description chosen for a **Pet** at birth.
_Avoid_: sprite only, decoration

**Partner Asset Service**:
An external service that creates and installs **Pet Assets** for pets-driven to use.
_Avoid_: pets-driven asset generator

**Personality Catalog**:
The service-owned list of supported personality presets and tunable traits.
_Avoid_: asset personality, generated personality

**Skill-Assisted Personality Setup**:
An optional workflow where an agent skill helps map a **Pet Asset** description to entries in the **Personality Catalog**.
_Avoid_: automatic personality decision

**Pet Archive**:
A reversible state where a **Pet** is hidden and inactive without deleting its **Working Directory**.
_Avoid_: delete, uninstall

**Pet Visibility**:
A screen-level preference for whether a non-archived **Pet** is currently shown.
_Avoid_: archive, active state

**Pet Surface**:
The collection of desktop overlay windows where visible **Pets** live above the user's desktop.
_Avoid_: dashboard, playground page

**Pet Window**:
An individual desktop overlay window that hosts one visible **Pet**.
_Avoid_: full-screen overlay, dashboard window

**Simulation World**:
The single logical space that holds every visible **Pet**'s position and computes their motion and contact, regardless of how many **Pet Windows** or monitors exist.
_Avoid_: Pet Surface, monitor, screen

**Simulation Host**:
The single authority that runs the **Simulation World** and publishes each **Pet World Position** to the **Pet Windows**.
_Avoid_: per-window simulation, peer pets

**World Coordinate Space**:
The continuous coordinate plane of the **Simulation World**, spanning the entire virtual desktop across all monitors as one surface.
_Avoid_: per-monitor space, window-local space

**Pet World Position**:
A **Pet**'s location within the **World Coordinate Space**, which its **Pet Window** is projected onto the screen to follow.
_Avoid_: window position, screen coordinate

**Walkable Region**:
The union of monitor work areas within the **World Coordinate Space** that a **Pet** may occupy; areas covered by no monitor act as boundaries.
_Avoid_: bounding rectangle, full virtual-desktop rectangle

**Screen Floor**:
The bottom of each monitor's work area, above the taskbar, that a **Pet** stands and rests on under gravity.
_Avoid_: OS window edge, taskbar surface

**Management Surface**:
The service UI used for registration, settings, assets, personalities, hooks, archive, and history.
_Avoid_: pet habitat

**Direct Manipulation**:
Primary pointer interaction with a **Pet** body, used for drag-and-drop play.
_Avoid_: open terminal, open context

**Pet Context Menu**:
The secondary-click menu for commands and settings related to a **Pet**.
_Avoid_: left-click panel

**Pet Overlay Action**:
A clickable UI affordance attached to a **Pet**, such as a speech bubble or attention badge.
_Avoid_: pet body click

**Instruction File**:
The optional per-pet `AGENTS.md` that defines working instructions for the bound **Agent Source** when present.
_Avoid_: prompt, system prompt

## Relationships

- A **Pet** is bound to exactly one **Working Directory**.
- A **Working Directory** has exactly one **Pet**.
- A **Pet** represents events from the **Agent Event Feed** for its **Working Directory**.
- A **Working Directory** has at most one active **Agent Source**.
- A **Pet** has at most one active **Terminal Channel**.
- A **Terminal Channel** belongs to exactly one **Working Directory**.
- A **Terminal Channel** is optional and is not required for a **Pet** to express hook events.
- An **Agent Event Feed** belongs to exactly one **Working Directory**.
- **Attention Hold** is created by `waiting`, `failed`, and `completed` events from the **Agent Event Feed**.
- **Attention Hold** remains until the user acknowledges it through **Direct Manipulation** or a **Pet Overlay Action**.
- A completed task creates a **Review Hold** instead of automatically returning to idle.
- A **Terminal Channel** may be owned by the pets-driven app or by an external terminal.
- An **External Terminal Channel** becomes active only through **Attach**.
- **Attach** is initiated by running an **Attach Command** from the external terminal.
- An **Attach Command** from an unregistered **Working Directory** is ignored, does not create a **Pet**, and only reports that status in debug or verbose mode.
- When multiple **Attach Commands** target the same **Working Directory**, the last attach wins.
- A **Hook Bridge** identifies the relevant **Pet** by sending the event's **Working Directory** to pets-driven.
- pets-driven resolves hook events through the current **Working Directory** to **Pet** mapping instead of trusting provider session ids.
- **Hook Setup** is managed from service settings and is separate from **Attach**.
- In the MVP, **Hook Setup** is global and there is no per-directory hook enable or disable.
- An **Agent Source** belongs to exactly one **Execution Environment**.
- A **Workspace** contains one or more **Registered Working Directories**.
- A **Registered Working Directory** is created by choosing an existing **Working Directory** or by **Working Directory Creation**.
- **Pet Birth** happens immediately when a **Working Directory** becomes a **Registered Working Directory**.
- **Pet Birth** includes choosing one installed **Pet Asset**.
- pets-driven references **Pet Assets** in place and does not copy asset files into a **Working Directory**.
- **Pet Birth** assigns a default **Personality Catalog** entry that the user may change later.
- A **Registered Working Directory** has exactly one **Execution Environment**.
- An **Execution Environment** has exactly one **Pet**.
- An **Execution Environment** may have one **Launch Configuration**.
- A **Pet** has **Launch Readiness** independent from whether it has an active **Terminal Channel**.
- A **Pet** exists and can be interacted with even when it has no **Launch Configuration**.
- A **Registered Working Directory** may reference one **Root Project**.
- A **Pet** has exactly one **Pet Profile**.
- A **Pet Profile** is selected from the **Personality Catalog** and can be adjusted by the user.
- **Skill-Assisted Personality Setup** may suggest **Personality Catalog** settings but does not decide them for the service.
- **Pet Archive** preserves the **Registered Working Directory**, **Pet Profile**, **Pet Asset** reference, and **Launch Configuration**.
- **Pet Visibility** does not change **Pet Archive**, **Terminal Channel**, or **Agent Source** state.
- Visible **Pets** live in individual **Pet Windows** on the **Pet Surface**, while setup and settings live on the **Management Surface**.
- A **Pet Window** belongs to exactly one visible **Pet**.
- A **Pet Window** is sized to its **Pet** so the **Pet** body is the interactive area while the surrounding desktop stays interactive.
- A **Pet Window** grows only while a **Pet Overlay Action** is shown and otherwise stays sized to its **Pet**.
- There is exactly one **Simulation World** shared by all visible **Pets**.
- The **Simulation World** runs in exactly one **Simulation Host**, which publishes each **Pet World Position**; a **Pet Window** renders its **Pet** from those positions and does not run its own simulation.
- During **Direct Manipulation**, a **Pet Window** forwards pointer position to the **Simulation Host**, which moves the **Pet** to follow the cursor and restores gravity when the user releases.
- The **Simulation World** uses one **World Coordinate Space** that spans the whole virtual desktop as a single continuous plane.
- Each visible **Pet** has a **Pet World Position** in the **World Coordinate Space**.
- A **Pet Window** follows its **Pet** by projecting the **Pet World Position** onto virtual-desktop screen coordinates.
- **Pets** approach, contact, and react to each other within the single **Simulation World**, regardless of which monitor their **Pet Windows** appear on.
- **Pet** contact is computed only in the **Simulation World**; **Pet Windows** are OS windows and do not physically collide.
- **Pets** physically collide softly in the **Simulation World** rather than passing through each other.
- A **Pet World Position** is constrained to the **Walkable Region** so every **Pet Window** stays on a visible monitor.
- Regions of the **World Coordinate Space** covered by no monitor act as boundaries a **Pet** cannot enter.
- In the single-monitor MVP, the **Walkable Region** equals that monitor's work area, so no union computation is required.
- A **Pet** is subject to gravity and rests on the **Screen Floor** within the **Walkable Region**.
- The only surfaces in the MVP are screen edges; a **Pet** does not stand on real OS application windows.
- On multiple monitors the **Screen Floor** is stepped, with one floor per monitor work area.
- **Direct Manipulation** is separate from **Pet Context Menu** and **Pet Overlay Action**.
- **Terminal Channel** commands are reached through **Pet Context Menu** or attention-related **Pet Overlay Action**, not primary pet-body interaction.
- When a **Pet** lacks a **Launch Configuration**, terminal commands guide the user to launch settings or **Attach** instead of failing as an error.
- A **Registered Working Directory** may contain one **Instruction File**.

## Example dialogue

> **Dev:** "When the agent in this directory finishes, which pet should ask for attention?"
> **Domain expert:** "The event comes from the **Agent Source**, and the bound **Pet** decides how to present it using its **Pet Profile**."

## Flagged ambiguities

- "pet (agent)" was used to mean both **Pet** and **Agent Source**; resolved: these are distinct concepts connected by a binding.
- "terminal" may mean an **Agent Source**, **Terminal Channel**, or **Execution Environment**; resolved: a **Pet** has one terminal-facing channel, and duplicate launches focus that channel instead of opening another.
- "Workspace" was used as an implied parent folder; resolved: pets-driven manages explicitly **Registered Working Directories** so agent boundaries do not overlap by default.
- "Root Project" was used as a possible boundary; resolved: it is only an optional grouping reference, while execution, permissions, search, and instructions are scoped to the **Registered Working Directory**.
- "Working Directory Creation" was used near project setup; resolved: it creates an empty working boundary and does not scaffold application code.
- "AGENTS.md" was used as a possible app-owned setting; resolved: the real file in the **Registered Working Directory** is canonical when used, but the initial flow may ignore it.
- "Execution Environment" was used as launch command readiness; resolved: no **Execution Environment** means no **Pet**, while missing command details are modeled as missing **Launch Configuration**.
- "Pet Asset creation" was considered part of pets-driven; resolved: pets-driven selects installed assets and guides users to a **Partner Asset Service** for new asset creation.
- "Pet Asset installation" was considered app-owned; resolved: installed **Pet Assets** are referenced in place, not copied by pets-driven.
- "Fallback asset" was considered as a birth default; resolved: fallback is only a render safety net, while **Pet Birth** requires choosing an installed **Pet Asset**.
- "pet.json" was considered an automatic personality source; resolved: pets-driven presents a **Personality Catalog**, and skills may assist setup without making the service-owned decision.
- "hide" was considered similar to archive; resolved: **Pet Visibility** is screen presentation, while **Pet Archive** is lifecycle state.
- "pet click" was considered as context opening; resolved: primary pet-body interaction is **Direct Manipulation**, secondary click opens **Pet Context Menu**, and attached UI uses **Pet Overlay Action**.
- "main screen" was considered as a dashboard or playground page; resolved: visible pets primarily live in individual **Pet Windows** on the desktop **Pet Surface**, while administrative flows use the **Management Surface**.
- "Attach Command" was considered as a possible registration hint; resolved: attach only affects already registered directories and otherwise stays quiet unless debug or verbose mode is requested.
- "duplicate attach" was considered invalid; resolved: attach is an explicit user intent, so the last attach wins for the active **Terminal Channel**.
- "Claude hook identity" was considered a source of truth; resolved: hook events carry **Working Directory** context and pets-driven maps that to the **Pet**.
- "Terminal Channel" was considered required for hook expression; resolved: terminal linking is optional, while **Agent Event Feed** can still update pet expression.
- "monitor/world coordinate" was used interchangeably; resolved: one **Simulation World** runs on one **World Coordinate Space** spanning the virtual desktop, distinct from monitor or screen geometry, and **Pet Windows** are projections of **Pet World Positions**.
