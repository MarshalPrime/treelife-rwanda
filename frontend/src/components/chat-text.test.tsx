import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatText } from "@/components/chat-text";

const sample = `Based on your available records, there is no specific information or schedule indicating which farmers currently need a visit.

Your records list the following plot locations and plantings under your supervision:
* **Bugesera (Fruit orchard — demo B):** 1 Avocado (surviving), 40 Mango (planted), 15 Papaya (planted)
* **Nyarugenge (Urban plot — demo A):** 1 Jacaranda (planted), 1 Grevillea (planted)`;

describe("chat text", () => {
  it("renders bold and lists without asterisks", () => {
    render(<div><ChatText text={sample} /></div>);
    expect(screen.getByText("Bugesera (Fruit orchard — demo B):").tagName).toBe("STRONG");
    expect(screen.getByRole("list").querySelectorAll("li")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("**");
    expect(document.body.textContent).not.toMatch(/\*\s/);
  });
});
