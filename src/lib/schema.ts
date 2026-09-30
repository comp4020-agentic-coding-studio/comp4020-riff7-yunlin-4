import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
export const rooms = sqliteTable("rooms", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
});

// date/startTime/endTime are Canberra wall-clock text (YYYY-MM-DD, HH:MM) —
// this prototype only ever means "the time on the room's own wall", so
// there's no timezone to store or convert.
export const bookings = sqliteTable("bookings", {
  id: int().primaryKey({ autoIncrement: true }),
  roomId: int("room_id")
    .notNull()
    .references(() => rooms.id),
  date: text().notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  bookedBy: text("booked_by").notNull(),
  // Canberra wall-clock HH:MM the booker tapped "I'm here" on the door sign;
  // null until then. A booking still null CHECK_IN_GRACE_MIN after its start
  // is a no-show, and the room reads as free.
  checkedInAt: text("checked_in_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Room = typeof rooms.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
