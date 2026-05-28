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

**External Terminal Channel**:
A **Terminal Channel** that is owned by a terminal outside the pets-driven app.
_Avoid_: unmanaged terminal

**Workspace**:
A root project plus the agent directories and launch settings used to run pets-driven work.
_Avoid_: project, repo

**Working Directory**:
The filesystem directory that acts as the identity boundary for one **Pet**.
_Avoid_: cwd, folder

**Execution Environment**:
A saved launch configuration for starting an **Agent Source** from a specific working directory.
_Avoid_: terminal, shell

**Pet Profile**:
The personality, speech behavior, and visual asset settings for a **Pet**.
_Avoid_: character, config

**Instruction File**:
The per-pet `AGENTS.md` that defines working instructions for the bound **Agent Source**.
_Avoid_: prompt, system prompt

## Relationships

- A **Pet** is bound to exactly one **Working Directory**.
- A **Working Directory** has exactly one **Pet**.
- A **Pet** represents events from the active **Agent Source** running in its **Working Directory**.
- A **Working Directory** has at most one active **Agent Source**.
- A **Pet** has at most one active **Terminal Channel**.
- A **Terminal Channel** belongs to exactly one **Working Directory**.
- A **Terminal Channel** may be owned by the pets-driven app or by an external terminal.
- An **Agent Source** belongs to exactly one **Execution Environment**.
- A **Workspace** contains one or more **Execution Environments**.
- A **Pet** has exactly one **Pet Profile**.
- An **Execution Environment** may provide one **Instruction File**.

## Example dialogue

> **Dev:** "When the agent in this directory finishes, which pet should ask for attention?"
> **Domain expert:** "The event comes from the **Agent Source**, and the bound **Pet** decides how to present it using its **Pet Profile**."

## Flagged ambiguities

- "pet (agent)" was used to mean both **Pet** and **Agent Source**; resolved: these are distinct concepts connected by a binding.
- "terminal" may mean an **Agent Source**, **Terminal Channel**, or **Execution Environment**; resolved: a **Pet** has one terminal-facing channel, and duplicate launches focus that channel instead of opening another.
