import { describe, expect, inject, it } from "vitest";
import { canberraParts } from "../src/lib/clock";
import { addMinutes, roomStatus, slotState } from "../src/lib/status";
import type { Booking } from "../src/lib/schema";

const booking = (startTime: string, endTime: string, checkedInAt: string | null = null): Booking => ({
  id: 1,
  roomId: 1,
  date: "2031-01-01",
  startTime,
  endTime,
  bookedBy: "someone",
  checkedInAt,
  createdAt: "",
});

describe("check-in states", () => {
  it("waits for check-in during the grace window, then calls it a no-show", () => {
    const b = booking("14:00", "15:00");
    expect(slotState(b, "today", "13:59")).toBe("upcoming");
    expect(slotState(b, "today", "14:09")).toBe("awaiting");
    expect(slotState(b, "today", "14:10")).toBe("noshow");
  });

  it("a checked-in booking is live until it ends", () => {
    const b = booking("14:00", "15:00", "14:03");
    expect(slotState(b, "today", "14:30")).toBe("live");
    expect(slotState(b, "today", "15:00")).toBe("past");
  });

  it("a no-show leaves the room free, and says whose booking was released", () => {
    const status = roomStatus([booking("14:00", "15:00")], "14:20");
    expect(status.kind).toBe("free");
    expect(status.released?.startTime).toBe("14:00");
  });
});

describe("the door sign", () => {
  const baseUrl = inject("baseUrl");

  it("shows a free room as free", async () => {
    const html = await (await fetch(new URL("/room/3/", baseUrl))).text();
    expect(html).toMatch(/<title>[^<]*Free/);
  });

  it("a walk-up booking from the door starts checked in and sends you back to the sign", async () => {
    const { date, time } = canberraParts(new Date());
    if (time >= "23:50") return;
    const res = await fetch(new URL("/api/bookings", baseUrl), {
      method: "POST",
      headers: { origin: baseUrl },
      body: new URLSearchParams({
        date,
        roomId: "2",
        startTime: time,
        endTime: addMinutes(time, 30),
        bookedBy: "walk-up probe",
        checkIn: "1",
        return: "/room/2/",
      }),
      redirect: "manual",
    });
    expect(res.headers.get("location")).toBe("/room/2/");
    const html = await (await fetch(new URL("/room/2/", baseUrl))).text();
    expect(html).toMatch(/<title>[^<]*In use/);
  });

  it("refuses to redirect anywhere but a door sign", async () => {
    const res = await fetch(new URL("/api/bookings", baseUrl), {
      method: "POST",
      headers: { origin: baseUrl },
      body: new URLSearchParams({ date: "2031-09-01", roomId: "999", startTime: "09:00", endTime: "10:00", bookedBy: "x", return: "//evil.example/" }),
      redirect: "manual",
    });
    expect(res.headers.get("location")).toMatch(/^\/\?/);
  });
});
