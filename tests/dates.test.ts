import { describe, expect, it } from "vitest";
import { dateDiffDays, isoWeekStart, normalizeDate, weekLabel } from "../src/lib/dates";

describe("normalizeDate", () => {
  it("accepts ISO dates", () => {
    expect(normalizeDate("2026-10-29")).toBe("2026-10-29");
    expect(normalizeDate("2026-10-9")).toBe("2026-10-09");
  });
  it("accepts slash formats", () => {
    expect(normalizeDate("2026/10/29")).toBe("2026-10-29");
    expect(normalizeDate("10/29/2026")).toBe("2026-10-29");
  });
  it("rejects invalid dates", () => {
    expect(normalizeDate("2026-13-40")).toBeNull();
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

describe("isoWeekStart", () => {
  it("returns the Monday of the week", () => {
    expect(isoWeekStart("2026-10-29")).toBe("2026-10-26"); // Thursday
    expect(isoWeekStart("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(isoWeekStart("2026-02-15")).toBe("2026-02-09"); // Sunday
  });
});

describe("weekLabel", () => {
  it("formats a Monday as MM/DD~MM/DD", () => {
    expect(weekLabel("2026-10-26")).toBe("10/26~11/01");
    expect(weekLabel("2026-02-09")).toBe("02/09~02/15");
  });
});

describe("dateDiffDays", () => {
  it("computes whole-day differences", () => {
    expect(dateDiffDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(dateDiffDays("2026-10-31", "2026-10-01")).toBe(-30);
  });
});
