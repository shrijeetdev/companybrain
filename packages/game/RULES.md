# Tactical Ops: Rules of Engagement

Your tasks are **Missions**, projects are **Operations**, and your team (humans and AI operatives) is the **Squad**. You earn XP for finishing real work, and the rules make it hard to farm. Every number below comes from `src/rules.ts`.

## XP for missions

| Priority | Base XP |
|---|---|
| None | 10 |
| Low | 15 |
| Medium | 25 |
| High | 40 |
| Urgent | 60 |

- **On time:** you get +50% of base when you finish at or before the deadline.
- **Rescue:** you get +10 when you clear a mission that was already overdue.
- **Objectives (subtasks):** +3 each. A mission pays for at most 10 objectives, and each objective pays only once. You can earn objective XP for up to 30 objectives a day.
- **Intel:** +2 for creating a mission, up to 10 missions a day.
- **Who earns:** every assignee earns the mission XP, humans and AI agents alike. If the person who completes it isn't an assignee, they earn it too. With no assignees, the completer earns. The `system` account never earns.

### Fair play (anti-farm)
- **Quick self-complete:** if you create a mission and complete it yourself within 2 minutes, everyone on it gets only 20% of base. It pays no bonuses and doesn't count toward your streak, challenges, crates or medals.
- **Daily cap:** you can earn up to 1,000 mission XP a day (completions, bonuses and objectives, in your time zone). XP past the cap is recorded as +0. Streak, challenge, medal and squad XP don't count toward the cap. Revoked XP doesn't give cap room back.
- **Reopen:** if a mission is reopened (or deleted) within 24 h of completion, the game takes back exactly the XP that completion gave, including its streak bonus. This shows up in your ledger as a `revoked` entry.
- **Once a day:** a mission pays you at most once per day. Completing it again the same day pays nothing.

## Levels and ranks
Reaching level *n* takes `round(50·(n−1)^1.6 + 50·(n−1))` total XP. That's 100 XP for level 2, 252 for level 3, 2,132 for level 10 and 7,034 for level 21. The cap is level 100.

| Rank | Level | Insignia |
|---|---|---|
| Recruit | 1 | — |
| Private | 3 | 1 chevron |
| Corporal | 6 | 2 chevrons |
| Sergeant | 10 | 3 chevrons |
| Staff Sergeant | 15 | 4 chevrons |
| Lieutenant | 21 | 1 bar |
| Captain | 28 | 2 bars |
| Major | 36 | 1 star |
| Colonel | 45 | 2 stars |
| General | 60 | 3 stars |
| Legend | 80 | crown |

## Streaks
A day counts toward your streak when you complete at least one mission (in your time zone). Your first completion of each streak day pays **+5 × streak days**, up to a maximum of +50. Missing a whole weekday breaks the streak. Saturdays and Sundays never break it.

## Coins
You get 1 coin for every 10 XP of total XP. Crates can also pay coins.

## Loot crates
| You earn a… | When |
|---|---|
| Common crate | Every 5 missions completed |
| Rare crate | Every level-up |
| Epic crate | 7-day streak, then again at 14, 21… |
| Legendary crate | Each new rank from Lieutenant up, and every Legendary medal |

Silver medals also give a Common crate, and Gold medals give a Rare crate. A crate can contain:
- Coins
- A 30- or 60-minute **×1.5 XP boost** on mission XP. Boosts stack in time.
- A title: Night Raider, Deadline Slayer, Ghost Protocol…
- A frame: Gold Camo, Neon Grid, Arctic…
- An emote

If you already own the cosmetic you roll, you get coins instead: 25, 75, 200 or 500 depending on its rarity. Each crate is rolled once, with crypto-random rolls on the server. You can equip cosmetics you own.

## Medals (achievements)
There are 31 medals. Some examples:
- First Blood
- Sharpshooter: 10 on-time missions in a row
- Rescue Specialist: 10 overdue missions cleared
- Early Bird: before 8 am
- Night Owl: after 10 pm
- Clean Sweep: every mission due today cleared, at least 3
- Squad Player: 10 shared missions
- Operation Commander: lead an operation to 100%
- Intel Officer: create 50 missions
- AI Whisperer: 10 missions you gave to AI operatives get done
- Streaks of 3, 7 and 30 days
- Levels 10, 25 and 50
- Centurion: 100 missions
- Legend

A few medals are **secret** until you unlock them. Unlocking a medal pays Bronze +25, Silver +75, Gold +150 or Legendary +500 XP.

## Daily challenges
You get 3 challenges a day in your time zone, such as "Clear 3 missions", "Clear a critical (overdue) mission" or "Deploy 3 new missions". They're picked the same way every time for a given member and day. The game prefers challenges you can actually finish with your current open missions. Each completed challenge pays 15–50 XP, and finishing all 3 earns the *Hat Trick* medal.

## Squad bonus
When an operation reaches 100% (every mission that isn't cancelled is done, and there are at least 3), everyone who completed one of its missions gets **+100 XP**. This happens once per operation.

## Leaderboard and feed
- **Leaderboard:** shows XP earned this week (since Monday), this month, or all time. Humans and AI operatives are ranked separately. Ties go to more missions, then a better on-time rate.
- **Squad feed:** shows the big moments only: level-ups, promotions, medals, cleared operations, legendary crates and 7-day streak milestones.
