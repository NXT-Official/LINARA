import type { Weekday } from "@/lib/time";
import type { Recurrence, Routine, Task } from "./task.types";

export const MON_FRI: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Stand-in "proof of work" photos attached when a helper marks a task done.
export const PHOTO_POOL = [
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=280&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=280&fit=crop",
  "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=280&fit=crop",
  "https://images.unsplash.com/photo-1584736286279-75266cf13b64?w=400&h=280&fit=crop",
  "https://images.unsplash.com/photo-1522441815192-d9f04eb0615c?w=400&h=280&fit=crop",
];

export const INITIAL_TASKS: Task[] = [
  {
    id: "t1",
    title: "Prepare Baby Sofia's bottle",
    note: "4oz, warm. 1 level formula scoop per 2oz. Test on wrist.",
    time: "6:00 AM",
    helperId: "rosa",
    station: "Yaya",
    status: "done",
    photo: PHOTO_POOL[2],
    recurrence: "daily",
    routineId: "r-t1",
  },
  {
    id: "t2",
    title: "Kids' breakfast + pack school bags",
    note: "Champorado Mon/Wed/Fri. Check baon list on the ref.",
    time: "6:30 AM",
    helperId: "rosa",
    station: "Yaya",
    status: "done",
    photo: PHOTO_POOL[1],
    recurrence: "daily",
    routineId: "r-t2",
  },
  {
    id: "t3",
    title: "Drive kids to school",
    note: "Leave 7:00 sharp for EDSA traffic. Booster seat for Sofia.",
    time: "7:00 AM",
    helperId: "manuel",
    station: "Driver",
    status: "done",
    photo: PHOTO_POOL[3],
    recurrence: MON_FRI,
    routineId: "r-t3",
  },
  {
    id: "t4",
    title: "Palengke / marketing run",
    note: "List on the ref. Budget ₱1,500 petty cash — keep receipts.",
    time: "8:00 AM",
    helperId: "lita",
    station: "Cook",
    status: "in_progress",
    recurrence: ["Tue"],
    routineId: "r-t4",
  },
  {
    id: "t5",
    title: "Laundry, whites load",
    note: "Separate colors. Sir's barong is hand-wash only.",
    time: "9:00 AM",
    helperId: "lita",
    station: "Cook",
    status: "todo",
    recurrence: ["Mon", "Thu"],
    routineId: "r-t5",
  },
  {
    id: "t6",
    title: "Sofia's mid-morning bath",
    note: "Lukewarm water. Cetaphil, no soap on the face. Towel from her drawer.",
    time: "9:30 AM",
    helperId: "rosa",
    station: "Yaya",
    status: "todo",
    recurrence: "daily",
    routineId: "r-t6",
  },
  {
    id: "t7",
    title: "Sofia's lunch + nap",
    note: "Lunch, then nap by 12:30. White noise on.",
    time: "11:30 AM",
    helperId: "rosa",
    station: "Yaya",
    status: "todo",
    recurrence: "daily",
    routineId: "r-t7",
  },
  {
    id: "t8",
    title: "Pick up kids from school",
    note: "Leave 3:00. Wait at Gate 2.",
    time: "3:30 PM",
    helperId: "manuel",
    station: "Driver",
    status: "todo",
    recurrence: MON_FRI,
    routineId: "r-t8",
  },
];

// Every seeded task that repeats also seeds the routine that respawns it.
export const INITIAL_ROUTINES: Routine[] = INITIAL_TASKS.filter(
  (t) => t.recurrence && t.recurrence !== "none",
).map((t) => ({
  id: `r-${t.id}`,
  title: t.title,
  helperId: t.helperId,
  station: t.station,
  time: t.time,
  note: t.note,
  recurrence: t.recurrence as Exclude<Recurrence, "none">,
}));
