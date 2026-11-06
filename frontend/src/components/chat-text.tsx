import type { ReactNode } from "react";

const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const BOLD = /(\*\*[^*]+\*\*|__[^_]+__)/g;

export function ChatText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let prose: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  function flushProse() {
    if (!prose.length) return;
    blocks.push(<p key={blocks.length}>{inline(prose.join(" "))}</p>);
    prose = [];
  }
  function flushBullets() {
    if (!bullets.length) return;
    blocks.push(<ul key={blocks.length}>{bullets.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
    bullets = [];
  }
  function flushNumbers() {
    if (!numbers.length) return;
    blocks.push(<ol key={blocks.length}>{numbers.map((item, index) => <li key={index}>{inline(item)}</li>)}</ol>);
    numbers = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushProse();
      flushBullets();
      flushNumbers();
      continue;
    }
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    if (bullet) {
      flushProse();
      flushNumbers();
      bullets.push(bullet[1]);
    } else if (numbered) {
      flushProse();
      flushBullets();
      numbers.push(numbered[1]);
    } else {
      flushBullets();
      flushNumbers();
      prose.push(stripHeading(line));
    }
  }
  flushProse();
  flushBullets();
  flushNumbers();
  return <>{blocks}</>;
}

function stripHeading(line: string) {
  return line.replace(/^#{1,6}\s+/, "");
}

function inline(value: string): ReactNode[] {
  return value.split(BOLD).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("__") && part.endsWith("__")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part.replaceAll("**", "").replaceAll("__", "");
  });
}
