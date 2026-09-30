import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { type Booking, type Room, bookings, rooms } from "./schema";
import { slotState } from "./status";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// The rooms themselves aren't something a booking app's users create — they're
// the fixed slice of the real system this prototype stands in for (a handful
// of ANU Library group study rooms). Seeded once, on whichever machine boots
// first against an empty database; never re-seeded once a room exists, so a
// deploy never resets what's already there.
const SEEDED_ROOMS = ["Hancock — Group Room 1", "Hancock — Group Room 2", "Chifley — Group Room 3"];
if (db.select().from(rooms).limit(1).all().length === 0) {
  for (const name of SEEDED_ROOMS) db.insert(rooms).values({ name }).run();
}

export type { Booking, Room };

export class ConflictError extends Error {}
export class ValidationError extends Error {}

export function listRooms(): Room[] {
  return db.select().from(rooms).orderBy(rooms.id).all();
}

export function listBookingsForDate(date: string): Booking[] {
  return db.select().from(bookings).where(eq(bookings.date, date)).orderBy(bookings.startTime).all();
}

function overlaps(a: Booking | NewBooking, b: Booking): boolean {
  return a.startTime < b.endTime && a.endTime > b.startTime;
}

interface NewBooking {
  roomId: number;
  date: string;
  startTime: string;
  endTime: string;
  bookedBy: string;
  checkedInAt?: string | null;
}

// Runs the whole check-then-insert as one call: better-sqlite3's calls are
// synchronous, so nothing else touches the database between the read and the
// write, which is what makes the overlap check race-free without a separate
// SQL constraint.
export function addBooking(candidate: NewBooking): Booking {
  if (!(candidate.startTime < candidate.endTime)) {
    throw new ValidationError("end time must be after start time");
  }
  const sameRoomAndDay = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.roomId, candidate.roomId), eq(bookings.date, candidate.date)))
    .all();
  if (sameRoomAndDay.some((existing) => overlaps(candidate, existing))) {
    throw new ConflictError("room already booked for part of this time");
  }
  return db.insert(bookings).values(candidate).returning().get();
}

/** Returns the deleted booking's own date, or null if no booking with that id existed. */
export function cancelBooking(id: number): string | null {
  const removed = db.delete(bookings).where(eq(bookings.id, id)).returning().all();
  return removed[0]?.date ?? null;
}

export function getBooking(id: number): Booking | undefined {
  return db.select().from(bookings).where(eq(bookings.id, id)).get();
}

/** Only a booking that is still waiting for check-in (today, inside its grace window) can be checked in to. */
export function checkIn(id: number, today: string, now: string): Booking | null {
  const b = getBooking(id);
  if (!b || b.date !== today || slotState(b, "today", now) !== "awaiting") return null;
  return db.update(bookings).set({ checkedInAt: now }).where(eq(bookings.id, id)).returning().get() ?? null;
}

/** Leaving early truncates the booking to now, so the rest of its time is free and the history stays. */
export function endBookingNow(id: number, today: string, now: string): Booking | null {
  const b = getBooking(id);
  if (!b || b.date !== today || slotState(b, "today", now) !== "live") return null;
  if (now <= b.startTime) {
    cancelBooking(id);
    return b;
  }
  return db.update(bookings).set({ endTime: now }).where(eq(bookings.id, id)).returning().get() ?? null;
}

// A no-show still occupies its slot in the table, so the overlap check would
// refuse anyone trying to take the room it has already given up. Truncating
// it to `now` first makes the rest of its time bookable.
export function releaseNoShows(roomId: number, today: string, now: string): void {
  const inRoom = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.roomId, roomId), eq(bookings.date, today), isNull(bookings.checkedInAt)))
    .all();
  for (const b of inRoom) {
    if (slotState(b, "today", now) === "noshow" && b.startTime < now && now < b.endTime) {
      db.update(bookings).set({ endTime: now }).where(eq(bookings.id, b.id)).run();
    }
  }
}
