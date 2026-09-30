import type { Booking } from "./schema";

// A booking nobody has checked in to this many minutes after it starts is a
// no-show: the room reads as free again and anyone at the door can take it.
export const CHECK_IN_GRACE_MIN = 10;

// When a room is free, its countdown ring is drawn against this horizon, so a
// full ring means "free for at least two hours" rather than "free until 23:59".
export const FREE_HORIZON_MIN = 120;

export type SlotState = "past" | "upcoming" | "live" | "awaiting" | "noshow";
export type Day = "past" | "today" | "future";

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Clamped to the day because every caller treats the result as a wall-clock
// time on the same date, and canberraWallTimeToEpochMs can't parse "24:05".
export function addMinutes(hhmm: string, n: number): string {
  const t = Math.min(23 * 60 + 59, Math.max(0, toMin(hhmm) + n));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

type Timed = Pick<Booking, "startTime" | "endTime" | "checkedInAt">;

export const graceEnds = (b: Pick<Booking, "startTime">) => addMinutes(b.startTime, CHECK_IN_GRACE_MIN);

export function slotState(b: Timed, day: Day, now: string): SlotState {
  if (day === "past") return "past";
  if (day === "future" || now < b.startTime) return "upcoming";
  if (now >= b.endTime) return b.checkedInAt ? "past" : "noshow";
  if (b.checkedInAt) return "live";
  return now < graceEnds(b) ? "awaiting" : "noshow";
}

export interface RoomStatus {
  kind: "free" | "busy" | "awaiting";
  booking: Booking | null;
  released: Booking | null;
  next: Booking | null;
  until: string | null;
  segMin: number;
}

/** `bookings` is one room's bookings for today, sorted by start time. */
export function roomStatus(bookings: Booking[], now: string): RoomStatus {
  const next = bookings.find((b) => b.startTime > now) ?? null;
  for (const b of bookings) {
    const state = slotState(b, "today", now);
    if (state === "live") {
      return { kind: "busy", booking: b, released: null, next, until: b.endTime, segMin: toMin(b.endTime) - toMin(b.startTime) };
    }
    if (state === "awaiting") {
      const until = graceEnds(b) < b.endTime ? graceEnds(b) : b.endTime;
      return { kind: "awaiting", booking: b, released: null, next, until, segMin: toMin(until) - toMin(b.startTime) };
    }
  }
  const released = bookings.find((b) => slotState(b, "today", now) === "noshow" && b.startTime <= now && now < b.endTime) ?? null;
  return { kind: "free", booking: null, released, next, until: next?.startTime ?? null, segMin: FREE_HORIZON_MIN };
}

/** Every wall-clock minute at which some booking's state flips, for scheduling a reload. */
export function reloadBoundaries(bookings: Booking[]): string[] {
  return bookings.flatMap((b) => (b.checkedInAt ? [b.startTime, b.endTime] : [b.startTime, graceEnds(b), b.endTime]));
}

/** 0–1: how much of the current state's countdown is left, for rings and bars. */
export function remainingFraction(status: RoomStatus, now: string): number {
  if (status.until === null) return 1;
  return Math.max(0, Math.min(1, (toMin(status.until) - toMin(now)) / status.segMin));
}

// Form posts may ask to be sent back to a door sign; anything else would be
// an open redirect, so only that exact path shape is honoured.
export function doorSignPath(value: FormDataEntryValue | null): string | null {
  const path = typeof value === "string" ? value : "";
  return /^\/room\/\d+\/$/.test(path) ? path : null;
}

export function splitRoomName(name: string): [library: string, label: string] {
  const [library, label] = name.includes(" — ") ? name.split(" — ") : ["Other", name];
  return [library, label];
}
