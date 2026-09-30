# Room board

A live board for a handful of ANU Library group study rooms: who's booked
what today, what's free right now, and a form to take a free slot or give one
back. It's a slice of the real thing --- [ANU Library's group study room
booking system](https://anulib.anu.edu.au/news-events/news/new-and-improved-group-study-room-booking-system),
which lives behind a separate login on its own site and only ever shows you
what's booked, not what's actually happening in a room right now.

## Riff: the door sign

The board still only knew what was *booked*, so this riff builds the screen
that would hang outside each room (`/room/1/`, `/room/2/`, `/room/3/`). You
can read it from down the corridor: green **Free**, red **In use**, or amber
**Check in**, with a countdown ring beside it. When a booking starts, the sign
asks whoever booked it to check in. If nobody has checked in 10 minutes later,
the booking counts as a no-show, the room goes back to free, and anyone
standing at the door can take it with one tap. That walk-up booking starts
already checked in. If you leave early, one tap frees the rest of your time.
The board's header shows the same three states as live tiles, one per room.

## What good looks like here

The one annoyance this prototype is built to fix: standing outside a room
that's shown as booked, with no way to tell from the booking system alone
whether anyone's actually turned up. So the board's one piece of decoration
--- the red highlight on a booking --- means exactly one thing: *this slot is
happening right now*, computed from the wall clock in Canberra, not from
whether someone remembered to check in. Everything else on the page is plain
text; taste here is what didn't get a colour.

Enforced by `spec/booking.test.ts`, driven against the deployed app, not the
source:

- a booking made now is still there on a fresh page load (the brief's core
  persistence promise)
- two bookings for the same room that overlap in time can't both exist --- the
  second is rejected and the first is untouched
- cancelling a booking frees the slot for someone else to take
- a booking made in one tab reaches another tab open on the same date, over
  the same server-sent-events stream the starter shipped with

Deliberately left out, as judgement calls rather than enforced rules: no
login (the real system's biggest source of friction, and out of scope for a
prototype with no real ANU identities to check), no room search across all of
ANU (three seeded rooms are enough to show the mechanic), and no recurring
bookings (a booking board that only ever books one slot at a time is honest
about what it models --- a real timetable is a different, bigger system).
