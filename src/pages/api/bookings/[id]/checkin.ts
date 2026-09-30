import type { APIRoute } from "astro";
import { canberraParts } from "../../../../lib/clock";
import { checkIn, getBooking } from "../../../../lib/db";
import { bus } from "../../../../lib/events";

export const POST: APIRoute = ({ params, redirect }) => {
  const id = Number(params.id);
  const booking = Number.isInteger(id) ? getBooking(id) : undefined;
  if (!booking) return redirect("/", 303);

  const { date: today, time: now } = canberraParts(new Date());
  const updated = checkIn(id, today, now);
  if (updated) bus.emit("booking", { date: updated.date });
  const sign = `/room/${booking.roomId}/`;
  return redirect(updated ? sign : `${sign}?error=checkin`, 303);
};
