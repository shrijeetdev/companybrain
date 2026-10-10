# @companybrain/nlp

Natural-language quick-add parser behind the quick-add box, WhatsApp/email intake, MCP and REST.

```ts
import { parseQuickAdd } from '@companybrain/nlp';
parseQuickAdd('Send Acme proposal tomorrow 5pm @priya #website !high', { now: Date.now(), timezone: 'Asia/Kolkata' });
// → { title: 'Send Acme proposal', dueAt: <15 Oct 17:00 IST>, dueAllDay: false, priority: 'high',
//     assigneeHints: ['priya'], projectHint: 'website', tags: [], recurrence: null, reminderOffsets: null, tokens: [...] }
```

It is pure (no I/O) and deterministic for a given `now` + `timezone`. It runs in Node and browsers and never
throws: bad input gives you a title-only result. An unknown timezone falls back to UTC, and an invalid
`defaultHour` falls back to 18. Calendar math works on civil dates. The final wall-clock time is then converted
with `Intl` offsets, so DST is handled correctly. A wall time that happens twice (fall-back) resolves to the
earlier instant. A wall time that doesn't exist (spring-forward gap) moves forward by the gap, so 02:30 becomes 03:30.

Run the tests with `node --import tsx --test packages/nlp/test/*.test.ts`. Typecheck with `npx tsc --noEmit -p packages/nlp`.

## Grammar

Matching is case-insensitive, and tokens can appear anywhere. Every recognized piece is removed from the title
and reported in `tokens` as `{start, end, kind}`. Spans are in the original text, sorted and non-overlapping.

### Dates
| Input | Result |
|---|---|
| `today`, `tomorrow`/`tmrw`/`tmr`, `day after tomorrow` | that day, all-day |
| `tonight` | today 20:00. A bare hour also becomes PM: `tonight at 9` is 21:00 |
| `this morning` / `afternoon` / `evening` | today 09:00 / 14:00 / 18:00 |
| `friday`, `coming fri` | next occurrence, **strictly after today** (said on a Friday, it means next week's Friday) |
| `this fri` | next occurrence **including today** |
| `next monday`, `monday next week` | that weekday in **next calendar week** (weeks start Monday) |
| `in 2 hours`, `in 30m`, `in half an hour` | now + duration (an exact instant) |
| `in 3 days`, `in 2 weeks`, `in a month`, `2 weeks from now` | that day, all-day |
| `next week` / `next month` / `next year` | next Monday / the 1st / Jan 1 |
| `end of week`, `eow`, `this week` | Friday (on a Sat/Sun: the next Friday) |
| `end of month`, `eom`, `this month`; `eoy` | last day of the month; Dec 31 |
| `this weekend`, `on the weekend`, `next weekend` | Saturday (or today if it is already the weekend) |
| `Oct 12`, `October 12th, 2027`, `12 Oct`, `3rd of November` | without a year, a past date rolls to next year |
| `2026-10-12`, `2026-10-12T15:00Z` | ISO. A `Z`/`±hh:mm` suffix is taken literally; otherwise the time is local |
| `12/10`, `12/10/2026` | **MM/DD for `America/*` and `US/*` timezones, DD/MM everywhere else**. If only the other reading is a valid date (`25/12` in New York), the parser uses that one |
| `on the 15th`, `by the 1st` | the next date with that day of the month (today counts) |
| anything chrono-node finds that has an explicit day and month | fallback for long-tail phrasing |

A date with no time gives `dueAllDay: true`, with `dueAt` set to that day at `defaultHour` (default 18:00, local time).

### Times
`5pm`, `5:30 pm`, `5.30pm`, `17:30`, `at 9`, `by 5`, `@5pm`, `noon`, `midnight`, `eod`/`end of day`/`cob`,
and the dayparts `morning` (09:00), `afternoon` (14:00), `evening` (18:00) and `night` (20:00).
- A time with no date means **today if that time is still ahead, otherwise tomorrow**.
- A bare hour with no am/pm (`at 5`, `5:30`) is read as **PM for 1–6** and as written for 7–12. A leading
  zero (`05:30`) or a 24-hour value (`17:30`) is taken literally. A `morning` hint undoes the PM guess, so
  `tomorrow morning at 5` is 05:00. An `evening`/`tonight` hint makes it PM.
- `eod` means today at `defaultHour`. If that has already passed, it means 23:59 today; it never rolls to tomorrow.

### Prepositions
`due`, `due by`/`on`/`before`, `by`, `before`, `on`, `until` and `till` are consumed together with a date.
`at`, `@`, `by`, `before` and `around` are consumed together with a time. A preposition left dangling by a
removed token is stripped from the title, so `prepare slides for tomorrow` becomes `Prepare slides`.

### Ambiguous pieces: the anchor rule
A bare clock time (`3pm`, `17:30`), an abbreviated weekday (`fri`), a year-less numeric date (`12/10`),
`the 15th`, a daypart word, or a bare `weekend` is only parsed when it is **anchored**. It counts as anchored if:
1. a preposition introduces it (`at 3pm`, `on fri`, `by the 15th`), or
2. it sits directly next to another date/time/recurrence token (`tomorrow 5pm`, `fri 5pm`, `every sunday 7pm`), or
3. it is at the **start or end** of the text once the other tokens are removed (`3pm call with bob`, `call bob 9am`).

So `meeting notes from 3pm call` stays a plain title ("from" is not a date preposition). Some pieces are stricter:
- Abbreviated weekdays are never taken from the start, so `sun cream` stays a title.
- Word times (`noon`, `midnight`) and dayparts are never taken from the start (`midnight snack`).
- `night` alone is never taken (`date night`).
- Full weekday names (`friday`) and month-name dates are always parsed. Possessives such as `tomorrow's` are not.

### Priority
| urgent | high | medium | low |
|---|---|---|---|
| `!urgent` `!!!` `p0` `urgent` `asap` | `!high` `!!` `p1` `high priority` `important` | `!med` `!medium` `p2` | `!low` `p3` |

The bare words `urgent`/`urgently`/`asap`/`important` only count as standalone modifiers. They must either
**trail** the text (`fix prod asap`) or **lead it and be followed by a separator** such as `:`, `,`, `-` or `!`
(`URGENT: fix login`). Otherwise they stay in the title: `Urgent care appointment`, `fix important bug`.
`!`-forms must stand alone, so `Ship it!!!` is just a title.

### People, projects, tags
- `@name` uses letters, digits, `.`, `-` and `_`; a trailing `.`/`-` is dropped. You can give several, and they
  are deduped case-insensitively. Email addresses are ignored. `for @priya` consumes `for`. `assign to priya`
  and `assigned to @priya` are also recognized.
- After `to`/`with`/`from`/`cc`/`ask`/`ping`/`call`/`email`/`tell`/`message`/`text`/`remind`/`meet`/`thank`, the
  plain name is **kept in the title** so the sentence still reads (`Talk to @priya about Q3` gives
  `Talk to priya about Q3`). The assignee is still recorded.
- The first `#name` becomes `projectHint`. Any further `#x`, and every `+tag`, go into `tags`. All-digit
  `#123` is treated as an issue reference and left in the title.

### Recurrence
| Input | `Recurrence` |
|---|---|
| `every day`, `daily`, `everyday`, `every other day`, `every 3 days` | `daily` (interval) |
| `every weekday`, `weekdays`, `on workdays` | `weekdays`, byWeekday 1–5 |
| `every monday`, `every mon and thu`, `every tue, wed & fri`, `on mondays`, `every weekend` | `weekly` + `byWeekday` |
| `weekly`, `every week`, `every 2 weeks`, `biweekly`, `fortnightly`, `weekly on friday` | `weekly` (interval) |
| `monthly`, `every month`, `every 3 months`, `quarterly`, `every 1st` | `monthly` (interval) |
| `yearly`, `annually`, `every year` | `yearly` |

The day of the month for `every month on the 1st` and `every 15th` is carried by `dueAt`. Without an explicit
date, `dueAt` is the **first occurrence**, and today counts. With a time, today only counts if that time is still ahead.

Recurrence words are always removed, so `weekly report` gives the title `Report` with a weekly recurrence.

### Reminders
`remind me 30m before`, `remind 1h before`, `remind me 2 days before`, `remind me 1 day and 2 hours before`,
and `remind me the day before` all produce minute offsets. `remind me at 9am` (optionally followed by
`the day before`) becomes an offset from `dueAt`. That is 9:00 on the due day, or 9:00 the day before when the
due time is earlier than 9:00. If there is no due date, 9am becomes the due time, with offset `0`.
`reminderOffsets` is sorted ascending, or `null`.

### Title
The title is the original text minus all tokens, with these clean-ups: whitespace is collapsed, dangling
prepositions and stray punctuation are removed, and the first letter is capitalised. If nothing is left, the
raw text is used as the title.
