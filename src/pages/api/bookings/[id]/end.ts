import type { APIRoute } from "astro";
import { canberraParts } from "../../../../lib/clock";
import { endBookingNow, getBooking } from "../../../../lib/db";
import { bus } from "../../../../lib/events";

export const POST: APIRoute = ({ params, redirect }) => {
  const id = Number(params.id);
  const booking = Number.isInteger(id) ? getBooking(id) : undefined;
  if (!booking) return redirect("/", 303);

  const { date: today, time: now } = canberraParts(new Date());
  const ended = endBookingNow(id, today, now);
  if (ended) bus.emit("booking", { date: ended.date });
  return redirect(`/room/${booking.roomId}/`, 303);
};
