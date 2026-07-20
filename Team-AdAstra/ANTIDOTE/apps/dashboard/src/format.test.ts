import { describe, expect, it } from "vitest";
import { escapeHtml } from "./format.ts";

describe("escapeHtml (graph-tooltip XSS guard)", () => {
  it("neutralises an HTML/script payload in an uploaded source title", () => {
    const out = escapeHtml('<img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/[<>]/); // no raw angle brackets survive
    expect(out).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("leaves an ordinary title byte-for-byte unchanged", () => {
    const title = "Orbex Dynamics Q1 earnings";
    expect(escapeHtml(title)).toBe(title);
  });
});
