import { useState, type ReactNode } from "react";
import {
  BackIcon,
  Badge,
  BigQuoteSlide,
  Button,
  Card,
  ChatBubble,
  Checkbox,
  ClosingSlide,
  ComparisonSlide,
  ContentSlide,
  Dialog,
  FolderIcon,
  GearIcon,
  HomeIcon,
  IconButton,
  Input,
  PET_MOODS,
  PetAvatar,
  PetEmote,
  PetShowcaseCard,
  PetSpeechBubble,
  PlusIcon,
  Radio,
  RefreshIcon,
  SearchIcon,
  SectionSlide,
  SegmentedControl,
  Select,
  SlideHighlight,
  Switch,
  Tabs,
  Tag,
  TerminalPreview,
  TitleSlide,
  Toast,
  Tooltip,
  TrashIcon,
  WrenchIcon,
  type PetMood,
} from "../src/index";
import wordmark from "../src/assets/petsdriven-wordmark.svg";

/* A scalable placeholder for pet artwork (the real sprites live in the app). */
function Pet({ emoji, bg = "var(--lavender-200)" }: { emoji: string; bg?: string }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <circle cx="50" cy="50" r="48" fill={bg} />
      <text x="50" y="52" fontSize="52" textAnchor="middle" dominantBaseline="central">
        {emoji}
      </text>
    </svg>
  );
}

const PETS = ["🐱", "🦊", "🐹", "🫧", "🦉", "🐧"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gx-section">
      <h2>{title}</h2>
      <div className="gx-row">{children}</div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gx-cell">
      <span className="gx-label">{label}</span>
      <div className="gx-card">{children}</div>
    </div>
  );
}

function SlideCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gx-cell">
      <span className="gx-label">{label}</span>
      <div className="gx-slide">{children}</div>
    </div>
  );
}

export function Gallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [density, setDensity] = useState("cozy");

  return (
    <div className="gx-wrap">
      <h1 className="gx-h1">Pets-Driven Design System</h1>
      <p className="gx-sub">
        Every exported component, rendered from <code>@pets-driven/design-system</code>.
      </p>

      <Section title="Buttons">
        <Cell label="Variants">
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="mint">Mint</Button>
          <Button variant="neutral">Neutral</Button>
          <Button variant="ghost">Ghost</Button>
        </Cell>
        <Cell label="Sizes / state">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button iconLeft={<PlusIcon />}>Adopt</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </Cell>
        <Cell label="IconButton">
          <IconButton label="Add" variant="ghost">
            <PlusIcon />
          </IconButton>
          <IconButton label="Add" variant="soft">
            <PlusIcon />
          </IconButton>
          <IconButton label="Add" variant="solid">
            <PlusIcon />
          </IconButton>
        </Cell>
      </Section>

      <Section title="Icons">
        <Cell label="Line set">
          <HomeIcon size={22} />
          <GearIcon size={22} />
          <WrenchIcon size={22} />
          <PlusIcon size={22} />
          <BackIcon size={22} />
          <FolderIcon size={22} />
          <TrashIcon size={22} />
          <SearchIcon size={22} />
          <RefreshIcon size={22} />
        </Cell>
      </Section>

      <Section title="Forms">
        <Cell label="Input">
          <Input label="Pet name" placeholder="Mochi" />
          <Input label="Search" icon={<SearchIcon />} placeholder="Find a pet" />
          <Input label="Email" error hint="That doesn't look right" defaultValue="nope" />
        </Cell>
        <Cell label="Select">
          <Select label="Favourite pet" options={["Cato", "Fenn", "Mochi", "Bloop"]} />
        </Cell>
        <Cell label="Segmented control">
          <SegmentedControl
            value={density}
            onChange={setDensity}
            options={[
              { value: "cozy", label: "Cozy" },
              { value: "compact", label: "Compact" },
              { value: "roomy", label: "Roomy" },
            ]}
          />
        </Cell>
        <Cell label="Checkbox / Radio / Switch">
          <Checkbox label="Treats enabled" defaultChecked />
          <Radio name="g" label="Bob" defaultChecked />
          <Radio name="g" label="Wiggle" />
          <Switch label="Live updates" defaultChecked />
        </Cell>
      </Section>

      <Section title="Data display">
        <Cell label="Badge tones">
          <Badge tone="primary">Primary</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success" dot>
            Done
          </Badge>
          <Badge tone="warning">Warn</Badge>
          <Badge tone="danger" variant="solid">
            Error
          </Badge>
          <Badge tone="neutral">Neutral</Badge>
        </Cell>
        <Cell label="Tag">
          <Tag color="var(--blossom-500)">Cato</Tag>
          <Tag selected>Selected</Tag>
          <Tag onRemove={() => {}}>Removable</Tag>
        </Cell>
        <Cell label="Tabs">
          <Tabs
            defaultValue="all"
            items={[
              { value: "all", label: "All" },
              { value: "active", label: "Active", badge: 3 },
              { value: "done", label: "Done" },
            ]}
          />
        </Cell>
        <Cell label="Card tones">
          <Card title="Lavender" subtitle="rounded + puffy shadow" tone="lavender">
            A gently tinted container.
          </Card>
          <Card title="Teal" tone="teal">
            Cool surface.
          </Card>
          <Card title="Mint" tone="mint" elevation="lg">
            Raised, minty.
          </Card>
          <Card title="Blossom" tone="blossom" interactive>
            Interactive, hover me.
          </Card>
        </Cell>
        <Cell label="Terminal preview">
          <TerminalPreview
            cwd="~/pets-driven"
            prompt="cato ❯"
            command="pnpm test --filter pet-engine"
          />
        </Cell>
      </Section>

      <Section title="Pets">
        <Cell label="PetAvatar sizes">
          <PetAvatar pet="cato" size="sm" />
          <PetAvatar pet="fenn" size="md" ring />
          <PetAvatar pet="mochi" size="lg" showStatus status="working" />
          <PetAvatar pet="bloop" size="xl" showStatus status="happy" ring />
        </Cell>
        <Cell label="PetAvatar status">
          <PetAvatar pet="cato" showStatus status="idle" />
          <PetAvatar pet="fenn" showStatus status="thinking" />
          <PetAvatar pet="mochi" showStatus status="napping" />
          <PetAvatar pet="otto" showStatus status="confused" />
        </Cell>
        <Cell label="PetShowcaseCard">
          <PetShowcaseCard
            note="Ready to plan"
            role="The Planner"
            name="Cato"
            status={{ label: "Working", dotColor: "var(--mint-500)" }}
            gradient={{ from: "var(--lavender-200)", to: "var(--blossom-200)" }}
            portrait={<Pet emoji="🐱" />}
            cwd="~/pets-driven"
            featured
            onEdit={() => {}}
          />
        </Cell>
      </Section>

      <Section title="Feedback">
        <Cell label="Dialog">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Adopt this pet?"
            pet={<Pet emoji="🐱" />}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Adopt</Button>
              </>
            }
          >
            Cato will join your pack and start planning right away.
          </Dialog>
        </Cell>
        <Cell label="Toast">
          <Toast
            tone="success"
            title="Task complete"
            description="Bloop kept the suite green."
            onClose={() => {}}
          />
        </Cell>
        <Cell label="Tooltip">
          <Tooltip content="Hello from a tooltip">
            <Button variant="neutral">Hover me</Button>
          </Tooltip>
        </Cell>
      </Section>

      <Section title="Pet status">
        <Cell label="Moods">
          {(Object.keys(PET_MOODS) as PetMood[]).map((mood) => {
            const spec = PET_MOODS[mood];
            return (
              <span
                key={mood}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 999,
                  color: spec.accent,
                  border: `1.5px solid ${spec.accent}`,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 16 }}>{spec.face}</span>
                {spec.defaultLabel}
              </span>
            );
          })}
        </Cell>
        <Cell label="Emote">
          <PetEmote kind="heart" />
          <PetEmote kind="sparkle" />
          <PetEmote kind="zzz" />
          <PetEmote kind="question" />
          <PetEmote kind="exclaim" />
        </Cell>
        <Cell label="Speech bubble">
          <PetSpeechBubble
            mood="happy"
            message={
              <>
                All tests passing — <b>good girl!</b>
              </>
            }
          />
        </Cell>
        <Cell label="Chat">
          <ChatBubble from="pet" name="Cato" avatar={<Pet emoji="🐱" />}>
            On it — mapping the change now.
          </ChatBubble>
          <ChatBubble from="user">Thanks!</ChatBubble>
          <ChatBubble from="pet" avatar={<Pet emoji="🦊" />} typing />
        </Cell>
      </Section>

      <Section title="Slides">
        <SlideCell label="TitleSlide">
          <TitleSlide
            brand={<img src={wordmark} alt="Pets-Driven" />}
            eyebrow="Pets-Driven Development"
            title={
              <>
                A cute way to develop with <SlideHighlight>AI agents.</SlideHighlight>
              </>
            }
            subtitle="Give a task and watch a little pack of pets do the work."
            pets={PETS.slice(0, 4).map((e) => <Pet emoji={e} />)}
          />
        </SlideCell>
        <SlideCell label="SectionSlide">
          <SectionSlide
            kicker="01 — Meet the pack"
            title={
              <>
                Six pets,
                <br />
                one workflow.
              </>
            }
            subtitle="Plan, fetch, edit, debug, test, report — each step has a pet."
            pet={<Pet emoji="🐱" bg="rgba(255,255,255,.9)" />}
          />
        </SlideCell>
        <SlideCell label="ContentSlide">
          <ContentSlide
            eyebrow="How the pack works"
            title="Every step has a pet."
            points={[
              {
                art: <Pet emoji="🐱" />,
                title: "Cato plans",
                description: "Maps the change and assigns each step.",
              },
              {
                art: <Pet emoji="🦊" />,
                title: "Fenn debugs",
                description: "Sniffs out the gnarly bugs.",
              },
              {
                art: <Pet emoji="🫧" />,
                title: "Bloop tests",
                description: "Keeps everything green.",
              },
            ]}
            asideArt={<Pet emoji="🦊" />}
            asideCaption="Fenn"
            asideRole="The Debugger"
          />
        </SlideCell>
        <SlideCell label="ComparisonSlide">
          <ComparisonSlide
            title="From log-watching to pet-watching."
            oldItems={[
              "Walls of terminal output",
              "No idea which agent did what",
              "Context lost between runs",
            ]}
            newPet={<Pet emoji="🐹" />}
            newItems={[
              "A face and mood per agent",
              "See progress at a glance",
              "Chat with any pet, anytime",
            ]}
          />
        </SlideCell>
        <SlideCell label="BigQuoteSlide">
          <BigQuoteSlide
            quote="I shipped a refactor without reading a single log line. I just watched Mochi do it."
            pet={<Pet emoji="🐹" />}
            authorName="An early adopter"
            authorMeta="Tinkerer, owns four pets"
          />
        </SlideCell>
        <SlideCell label="ClosingSlide">
          <ClosingSlide
            pets={PETS.map((e) => <Pet emoji={e} bg="rgba(255,255,255,.12)" />)}
            title="Bring home your pack."
            subtitle="Free while they nap. Adopt as many as you need."
            cta="✨ petsdriven.dev"
            footer={<img src={wordmark} alt="Pets-Driven" />}
          />
        </SlideCell>
      </Section>
    </div>
  );
}
