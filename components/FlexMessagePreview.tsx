import type {
  FlexBox,
  FlexBubble,
  FlexButton,
  FlexComponent,
  FlexSeparator,
  FlexText,
  LineFlexMessage,
} from "@/lib/line/flex-messages";

/**
 * Flex Message（bubble）の見た目をブラウザで確認するための簡易レンダラー。
 * LINE Flex Message Simulator の代替として、開発時の目視確認用に
 * box / text / button / separator の主要プロパティのみ再現する。
 */

const FONT_SIZE: Record<string, string> = {
  xxs: "11px",
  xs: "12px",
  sm: "14px",
  md: "16px",
  lg: "18px",
  xl: "20px",
  xxl: "24px",
};

const SPACING: Record<string, string> = {
  none: "0px",
  xs: "2px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  xxl: "20px",
};

function TextView({ component }: { component: FlexText }) {
  return (
    <p
      style={{
        fontSize: FONT_SIZE[component.size ?? "md"],
        fontWeight: component.weight === "bold" ? 700 : 400,
        color: component.color ?? "#111111",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        textAlign:
          component.align === "center"
            ? "center"
            : component.align === "end"
              ? "right"
              : "left",
        marginTop: component.margin ? SPACING[component.margin] : undefined,
        lineHeight: 1.5,
      }}
    >
      {component.text}
    </p>
  );
}

function ButtonView({ component }: { component: FlexButton }) {
  const isPrimary = component.style === "primary";
  return (
    <a
      href={component.action.uri}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        textAlign: "center",
        borderRadius: "8px",
        padding: component.height === "sm" ? "8px 12px" : "12px",
        fontSize: "16px",
        fontWeight: 700,
        textDecoration: "none",
        backgroundColor: isPrimary ? (component.color ?? "#17c950") : "transparent",
        color: isPrimary ? "#ffffff" : (component.color ?? "#42659a"),
      }}
    >
      {component.action.label}
    </a>
  );
}

function SeparatorView({ component }: { component: FlexSeparator }) {
  return (
    <hr
      style={{
        border: "none",
        borderTop: `1px solid ${component.color ?? "#e0e0e0"}`,
        marginTop: component.margin ? SPACING[component.margin] : "0px",
      }}
    />
  );
}

function ComponentView({ component }: { component: FlexComponent }) {
  switch (component.type) {
    case "box":
      return <BoxView box={component} />;
    case "text":
      return <TextView component={component} />;
    case "button":
      return <ButtonView component={component} />;
    case "separator":
      return <SeparatorView component={component} />;
  }
}

function BoxView({ box }: { box: FlexBox }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: box.layout === "vertical" ? "column" : "row",
        gap: box.spacing ? SPACING[box.spacing] : "0px",
        marginTop: box.margin ? SPACING[box.margin] : undefined,
        backgroundColor: box.backgroundColor,
        borderRadius: box.cornerRadius,
        padding: box.paddingAll,
      }}
    >
      {box.contents.map((child, index) => (
        <ComponentView key={index} component={child} />
      ))}
    </div>
  );
}

function BubbleView({ bubble }: { bubble: FlexBubble }) {
  return (
    <div
      style={{
        width: "300px",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }}
    >
      {bubble.body && (
        <div
          style={{
            backgroundColor: bubble.styles?.body?.backgroundColor ?? "#ffffff",
            padding: "16px",
          }}
        >
          <BoxView box={bubble.body} />
        </div>
      )}
      {bubble.footer && (
        <div
          style={{
            backgroundColor: bubble.styles?.footer?.backgroundColor ?? "#ffffff",
            padding: "8px 16px 16px",
          }}
        >
          <BoxView box={bubble.footer} />
        </div>
      )}
    </div>
  );
}

export function FlexMessagePreview({ message }: { message: LineFlexMessage }) {
  return (
    <div>
      <BubbleView bubble={message.contents} />
      {/* 通知やトーク一覧に表示される altText も確認できるようにする */}
      <p
        style={{
          width: "300px",
          marginTop: "8px",
          fontSize: "11px",
          color: "#ffffffcc",
          overflowWrap: "break-word",
        }}
      >
        altText: {message.altText}
      </p>
    </div>
  );
}
