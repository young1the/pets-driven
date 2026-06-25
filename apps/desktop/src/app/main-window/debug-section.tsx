import { Badge, Button } from "@pets-driven/design-system";
import { WrenchIcon } from "@/app/main-window/main-window-icons";

export type DebugAction = { label: string; onClick: () => void };
export type DebugGroup = { title: string; hint: string; items: DebugAction[] };

export interface DebugSectionProps {
  groups: DebugGroup[];
  error: string | null;
}

export function DebugSection({ groups, error }: DebugSectionProps) {
  return (
    <div style={{ padding: "38px 24px 64px" }}>
      <div style={{ maxWidth: "840px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "6px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "24px",
              color: "var(--text-strong)",
              margin: 0,
            }}
          >
            Developer tools
          </h2>
          <Badge tone="warning">dev only</Badge>
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            margin: "0 0 20px",
          }}
        >
          Fixtures and playground actions, kept out of the everyday flow.
        </p>

        {error ? (
          <p
            role="status"
            style={{
              color: "var(--coral-600)",
              background: "var(--coral-50)",
              border: "1px solid var(--coral-200)",
              borderRadius: "12px",
              padding: "10px 14px",
              margin: "0 0 16px",
              fontSize: "13px",
            }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {groups.map((group) => (
            <div
              key={group.title}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-soft)",
                borderRadius: "18px",
                boxShadow: "var(--shadow-sm)",
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "14px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    color: "var(--text-subtle)",
                  }}
                >
                  <WrenchIcon size={16} />
                </span>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "15px",
                    color: "var(--text-strong)",
                    margin: 0,
                  }}
                >
                  {group.title}
                </h3>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                  {group.hint}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {group.items.map((item) => (
                  <Button
                    key={item.label}
                    onClick={item.onClick}
                    size="sm"
                    variant="neutral"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
