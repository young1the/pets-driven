import type { HTMLAttributes, ReactNode } from "react";
import "./chat-bubble.css";

/**
 * A message in the Pets-Driven chat. `from="user"` aligns right (primary
 * fill); `from="pet"` aligns left with an optional avatar + name. `typing`
 * shows the bouncing-dots indicator.
 *
 * Unlike the design-bundle original this takes a plain `avatar` node — the
 * app supplies its own sprite-based avatar.
 */
export interface ChatBubbleProps extends HTMLAttributes<HTMLDivElement> {
  /** Message origin. @default "pet" */
  from?: "pet" | "user";
  /** Avatar node shown for pet messages. */
  avatar?: ReactNode;
  /** Sender name shown above pet messages. */
  name?: string;
  /** Timestamp line under the bubble. */
  time?: string;
  /** Show the bouncing-dots typing indicator. @default false */
  typing?: boolean;
  children?: ReactNode;
}

export function ChatBubble({
  from = "pet",
  avatar,
  name,
  time,
  typing = false,
  className = "",
  children,
  ...rest
}: ChatBubbleProps) {
  const isUser = from === "user";

  return (
    <div
      className={["pd-chat", `pd-chat--${from}`, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {!isUser && avatar}
      <div className="pd-chat__col">
        {!isUser && name && <span className="pd-chat__name">{name}</span>}
        <div className="pd-chat__bubble">
          {typing ? (
            <span aria-label="typing" className="pd-chat__typing">
              <i />
              <i />
              <i />
            </span>
          ) : (
            children
          )}
        </div>
        {time && <span className="pd-chat__time">{time}</span>}
      </div>
    </div>
  );
}
