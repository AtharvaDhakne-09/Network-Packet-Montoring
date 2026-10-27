import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./csv";

describe("rowsToCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(rowsToCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    expect(rowsToCsv([["a,b"]])) .toBe('"a,b"');
    expect(rowsToCsv([['he said "hi"']])) .toBe('"he said ""hi"""');
    expect(rowsToCsv([["line1\nline2"]])) .toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(rowsToCsv([["=SUM(A1:A2)"]])).toBe("'=SUM(A1:A2)");
    expect(rowsToCsv([["+1+1"]])).toBe("'+1+1");
    expect(rowsToCsv([["@cmd"]])).toBe("'@cmd");
  });
});
