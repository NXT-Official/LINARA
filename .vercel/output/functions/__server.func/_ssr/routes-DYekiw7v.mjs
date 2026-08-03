import { r as __toESM } from "../_runtime.mjs";
import { n as require_jsx_runtime, r as require_react } from "../_libs/react+tanstack__react-query.mjs";
import { C as CircleQuestionMark, D as Calendar, E as Camera, O as CalendarClock, S as ClipboardList, T as Check, _ as Mic, a as Trash2, b as Columns3, c as ShoppingBasket, d as Repeat, f as Plus, g as Minus, h as Moon, i as Users, l as Send, m as Package, n as X, o as StickyNote, p as Play, r as Wallet, s as Sparkles, t as Zap, u as RotateCcw, v as MessageCircle, w as CircleAlert, x as Coins, y as Link2 } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DYekiw7v.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var QUIET_START_HOUR = 22;
var QUIET_END_HOUR = 6;
var WEEKDAYS = [
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
	"Sun"
];
var MON_FRI = [
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri"
];
var PANTRY_CATEGORIES = [
	"Rice & grains",
	"Fresh",
	"Baby",
	"Cleaning",
	"Pantry"
];
var INITIAL_PANTRY = [
	{
		id: "p1",
		name: "Rice",
		qty: 2,
		unit: "kg",
		par: 5,
		category: "Rice & grains"
	},
	{
		id: "p2",
		name: "Sofia's cereal",
		qty: 1,
		unit: "box",
		par: 2,
		category: "Rice & grains"
	},
	{
		id: "p3",
		name: "Baby formula",
		qty: 1,
		unit: "tin",
		par: 2,
		category: "Baby"
	},
	{
		id: "p4",
		name: "Diapers (M)",
		qty: 3,
		unit: "pack",
		par: 2,
		category: "Baby"
	},
	{
		id: "p5",
		name: "Cooking oil",
		qty: 1,
		unit: "L",
		par: 1,
		category: "Pantry"
	},
	{
		id: "p6",
		name: "Coffee",
		qty: 2,
		unit: "pack",
		par: 1,
		category: "Pantry"
	},
	{
		id: "p7",
		name: "Eggs",
		qty: 4,
		unit: "pcs",
		par: 12,
		category: "Fresh"
	},
	{
		id: "p8",
		name: "Garlic",
		qty: 3,
		unit: "bulb",
		par: 2,
		category: "Fresh"
	},
	{
		id: "p9",
		name: "Onion",
		qty: 4,
		unit: "pcs",
		par: 3,
		category: "Fresh"
	},
	{
		id: "p10",
		name: "Dish soap",
		qty: 2,
		unit: "bottle",
		par: 1,
		category: "Cleaning"
	},
	{
		id: "p11",
		name: "Detergent",
		qty: 1,
		unit: "pack",
		par: 1,
		category: "Cleaning"
	}
];
var GroceryCtx = (0, import_react.createContext)(null);
var useGrocery = () => (0, import_react.useContext)(GroceryCtx);
var isPalengke = (t) => /pal[eé]ngke|marketing run/i.test(t.title);
var RECEIPT_PLACEHOLDER = "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=520&h=720&fit=crop";
var HELPERS = [
	{
		id: "rosa",
		name: "Ate Rosa",
		short: "Rosa",
		initials: "AR",
		station: "Yaya",
		shift: "6:00 AM – 7:00 PM",
		restDay: "Sunday"
	},
	{
		id: "manuel",
		name: "Kuya Manuel",
		short: "Manuel",
		initials: "KM",
		station: "Driver",
		shift: "6:00–9:00 AM & 2:30–6:00 PM",
		restDay: "Sunday"
	},
	{
		id: "lita",
		name: "Ate Lita",
		short: "Lita",
		initials: "AL",
		station: "Cook",
		shift: "5:30 AM – 7:30 PM",
		restDay: "Saturday"
	}
];
var INITIAL_ADMINS = [
	{
		id: "ben",
		name: "Sir Ben",
		short: "Ben",
		initials: "SB",
		type: "primary",
		location: "On-site"
	},
	{
		id: "tina",
		name: "Ma'am Tina",
		short: "Tina",
		initials: "MT",
		type: "co",
		location: "On-site"
	},
	{
		id: "lolafe",
		name: "Lola Fe",
		short: "Fe",
		initials: "LF",
		type: "remote",
		location: "Dubai"
	}
];
var adminTypeLabel = {
	primary: "Primary manager",
	co: "Co-manager",
	remote: "Remote admin"
};
var adminTypeShort = {
	primary: "Primary",
	co: "Co-manager",
	remote: "Remote"
};
var adminPermSummary = {
	primary: "Full control — can edit admins, end the day, and edit shifts.",
	co: "Full manage — everything except adding or removing admins.",
	remote: "View + approve — no editing shifts, no ending the day."
};
var WEEKDAY_LONG = {
	Mon: "Monday",
	Tue: "Tuesday",
	Wed: "Wednesday",
	Thu: "Thursday",
	Fri: "Friday",
	Sat: "Saturday",
	Sun: "Sunday"
};
var buildWeek = (workingDays, template) => {
	const week = {};
	for (const d of WEEKDAYS) week[d] = workingDays.includes(d) ? {
		rest: false,
		segments: template.segments.map((s) => ({ ...s })),
		breakStart: template.breakStart,
		breakEnd: template.breakEnd
	} : {
		rest: true,
		segments: []
	};
	return week;
};
var INITIAL_SCHEDULES = {
	rosa: buildWeek([
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat"
	], {
		segments: [{
			start: "06:00",
			end: "19:00"
		}],
		breakStart: "13:00",
		breakEnd: "15:00"
	}),
	lita: buildWeek([
		"Sun",
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri"
	], {
		segments: [{
			start: "05:30",
			end: "19:30"
		}],
		breakStart: "14:00",
		breakEnd: "16:00"
	}),
	manuel: buildWeek([
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat"
	], { segments: [{
		start: "06:00",
		end: "09:00"
	}, {
		start: "14:30",
		end: "18:00"
	}] })
};
var parseHM = (s) => {
	const m = s.match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return 0;
	return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
var fmtHM12 = (s) => formatDisplayTime(parseHM(s));
var summarizeDay = (d) => {
	if (d.rest) return "Rest day";
	return d.segments.map((s) => `${fmtHM12(s.start)} – ${fmtHM12(s.end)}`).join(" & ") + (d.breakStart && d.breakEnd ? ` · break ${fmtHM12(d.breakStart)}–${fmtHM12(d.breakEnd)}` : "");
};
var isMinuteInDay = (minutes, day) => {
	if (day.rest) return false;
	if (!day.segments.some((s) => minutes >= parseHM(s.start) && minutes < parseHM(s.end))) return false;
	if (day.breakStart && day.breakEnd) {
		if (minutes >= parseHM(day.breakStart) && minutes < parseHM(day.breakEnd)) return false;
	}
	return true;
};
var PHOTO_POOL = [
	"https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=280&fit=crop",
	"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=280&fit=crop",
	"https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=280&fit=crop",
	"https://images.unsplash.com/photo-1584736286279-75266cf13b64?w=400&h=280&fit=crop",
	"https://images.unsplash.com/photo-1522441815192-d9f04eb0615c?w=400&h=280&fit=crop"
];
var INITIAL_TASKS = [
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
		routineId: "r-t1"
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
		routineId: "r-t2"
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
		routineId: "r-t3"
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
		routineId: "r-t4"
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
		routineId: "r-t5"
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
		routineId: "r-t6"
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
		routineId: "r-t7"
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
		routineId: "r-t8"
	}
];
var WEEKDAY_FROM_DAY = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat"
];
var weekdayOf = (d) => {
	return WEEKDAY_FROM_DAY[d.getDay()];
};
var routineMatches = (r, wd) => {
	if (r.recurrence === "daily") return true;
	return r.recurrence.includes(wd);
};
var formatSimDate = (d) => d.toLocaleDateString("en-US", {
	weekday: "long",
	month: "long",
	day: "numeric"
});
var toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
var formatAppointmentDate = (iso) => {
	const [y, mo, d] = iso.split("-").map(Number);
	return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric"
	});
};
var parseTimeToMinutes = (t) => {
	const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
	if (!m) return 0;
	let h = parseInt(m[1], 10);
	const min = parseInt(m[2], 10);
	const suf = m[3].toUpperCase();
	if (suf === "PM" && h !== 12) h += 12;
	if (suf === "AM" && h === 12) h = 0;
	return h * 60 + min;
};
var formatDisplayTime = (totalMin) => {
	const m = (totalMin % 1440 + 1440) % 1440;
	const h24 = Math.floor(m / 60);
	const mm = m % 60;
	const suf = h24 >= 12 ? "PM" : "AM";
	return `${(h24 + 11) % 12 + 1}:${String(mm).padStart(2, "0")} ${suf}`;
};
var computePrepSchedule = (appDate, appTime, leadMinutes) => {
	const [y, mo, d] = appDate.split("-").map(Number);
	const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
	dt.setMinutes(parseTimeToMinutes(appTime) - leadMinutes);
	return {
		date: toISODate(dt),
		time: formatDisplayTime(dt.getHours() * 60 + dt.getMinutes())
	};
};
function recurrenceLabel(r) {
	if (!r || r === "none") return null;
	if (r === "daily") return "Daily";
	if (Array.isArray(r) && r.length > 0) return r.join(", ");
	return null;
}
function RecurrenceBadge({ recurrence }) {
	const label = recurrenceLabel(recurrence);
	if (!label) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-pine-deep",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Repeat, { className: "h-2.5 w-2.5" }),
			" ",
			label
		]
	});
}
var helperById = (id) => HELPERS.find((h) => h.id === id);
var stationTone = {
	Yaya: "bg-terracotta-soft/60 text-pine-deep",
	Cook: "bg-[oklch(0.92_0.05_140)] text-[oklch(0.35_0.08_140)]",
	Laundry: "bg-[oklch(0.92_0.04_240)] text-[oklch(0.35_0.08_240)]",
	Driver: "bg-[oklch(0.92_0.05_60)] text-[oklch(0.38_0.09_60)]",
	House: "bg-secondary text-pine-deep"
};
var INITIAL_ROUTINES = INITIAL_TASKS.filter((t) => t.recurrence && t.recurrence !== "none").map((t) => ({
	id: `r-${t.id}`,
	title: t.title,
	helperId: t.helperId,
	station: t.station,
	time: t.time,
	note: t.note,
	recurrence: t.recurrence
}));
var INITIAL_APPOINTMENTS = [{
	id: "a1",
	title: "Sir's airport departure",
	date: "2026-07-10",
	time: "6:00 AM"
}];
var EVENT_TEMPLATES = [
	{
		id: "tmpl-airport",
		title: "Airport departure",
		blurb: "Pack, baon, and load the car in time for the flight.",
		preps: [
			{
				title: "Pack Sir's bags",
				leadMinutes: 600,
				helperId: "rosa",
				note: "Passport, boarding pass, chargers, meds. Suit bag on the hook."
			},
			{
				title: "Prepare baon for the trip",
				leadMinutes: 120,
				helperId: "lita",
				note: "Sandwich + water, no strong smells. Pack in the small cooler."
			},
			{
				title: "Load car & wake driver",
				leadMinutes: 45,
				helperId: "manuel",
				note: "Warm the car 10 min ahead. Bags in the trunk, not the back seat."
			}
		]
	},
	{
		id: "tmpl-dinner",
		title: "Dinner party",
		blurb: "Sala clean, market run, prep, and table set for guests.",
		preps: [
			{
				title: "Clean sala",
				leadMinutes: 360,
				helperId: "rosa",
				note: "Vacuum, wipe glass tables, fluff cushions, fresh water in the vases."
			},
			{
				title: "Market run for menu",
				leadMinutes: 300,
				helperId: "lita",
				note: "Buy fresh — nothing frozen. Keep receipts, budget ₱2,500."
			},
			{
				title: "Prep courses",
				leadMinutes: 180,
				helperId: "lita",
				note: "Follow the menu card on the ref. Plating photos in the binder."
			},
			{
				title: "Set table",
				leadMinutes: 60,
				helperId: "rosa",
				note: "The blue linen set. Wine glasses on the right, water on the left."
			}
		]
	},
	{
		id: "tmpl-typhoon",
		title: "Typhoon prep",
		blurb: "Water, power, and windows before the storm lands.",
		preps: [
			{
				title: "Stock water & candles",
				leadMinutes: 1440,
				helperId: "lita",
				note: "5 gallons drinking + 2 pails per bathroom. Candles + matches in the drawer."
			},
			{
				title: "Charge power banks",
				leadMinutes: 720,
				helperId: "rosa",
				note: "All 4 power banks + phones + Sofia's tablet to 100%."
			},
			{
				title: "Secure windows",
				leadMinutes: 360,
				helperId: "manuel",
				note: "Tape the big glass panels. Move the plants inside the sala."
			}
		]
	}
];
var INITIAL_PREP_TASKS = INITIAL_APPOINTMENTS.map((a) => ({
	appointmentId: a.id,
	appointmentTitle: a.title,
	date: a.date,
	time: a.time,
	items: a.id === "a1" ? [
		{
			id: "a1-p1",
			leadMinutes: 600,
			title: "Pack Sir's bags",
			helperId: "rosa",
			note: "Passport, boarding pass, chargers, meds. Suit bag on the hook."
		},
		{
			id: "a1-p2",
			leadMinutes: 120,
			title: "Prepare baon for the trip",
			helperId: "lita",
			note: "Sandwich + water, no strong smells. Pack in the small cooler."
		},
		{
			id: "a1-p3",
			leadMinutes: 45,
			title: "Load car & wake driver",
			helperId: "manuel",
			note: "Warm the car 10 min ahead. Bags in the trunk, not the back seat."
		}
	] : []
})).flatMap((s) => s.items.map((p) => {
	const { date, time } = computePrepSchedule(s.date, s.time, p.leadMinutes);
	const helper = helperById(p.helperId);
	return {
		id: p.id,
		title: p.title,
		note: p.note,
		time,
		helperId: p.helperId,
		station: helper.station,
		status: "todo",
		appointmentId: s.appointmentId,
		appointmentTitle: s.appointmentTitle,
		scheduledDate: date,
		leadMinutes: p.leadMinutes
	};
}));
function LinaraApp() {
	const [viewAs, setViewAs] = (0, import_react.useState)("ben");
	const [admins, setAdmins] = (0, import_react.useState)(INITIAL_ADMINS);
	const currentAdmin = admins.find((a) => a.id === viewAs) ?? null;
	const role = viewAs === "rosa" ? "helper" : "manager";
	const adminType = currentAdmin ? currentAdmin.type : null;
	const updateAdminType = (id, type) => setAdmins((prev) => prev.map((a) => a.id === id ? {
		...a,
		type
	} : a));
	const [tasks, setTasks] = (0, import_react.useState)([...INITIAL_TASKS, ...INITIAL_PREP_TASKS]);
	const [vales, setVales] = (0, import_react.useState)([]);
	const [boardClosed, setBoardClosed] = (0, import_react.useState)(false);
	const [routines, setRoutines] = (0, import_react.useState)(INITIAL_ROUTINES);
	const [appointments, setAppointments] = (0, import_react.useState)(INITIAL_APPOINTMENTS);
	const [ledger, setLedger] = (0, import_react.useState)([]);
	const [ledgerDefault, setLedgerDefault] = (0, import_react.useState)("rest");
	const [utosList, setUtosList] = (0, import_react.useState)([]);
	const [utosWipedToday, setUtosWipedToday] = (0, import_react.useState)(false);
	const [invites, setInvites] = (0, import_react.useState)([]);
	const addInvite = (data, byName) => {
		const code = `LINARA-${Math.floor(1e3 + Math.random() * 9e3)}`;
		const inv = {
			...data,
			id: `inv${Date.now()}`,
			code,
			createdAt: Date.now(),
			createdBy: byName,
			status: "pending",
			flags: []
		};
		setInvites((prev) => [inv, ...prev]);
		return inv;
	};
	const removeInvite = (id) => setInvites((prev) => prev.filter((i) => i.id !== id));
	const findInviteByCode = (code) => invites.find((i) => i.code.toLowerCase() === code.trim().toLowerCase() && i.status === "pending") ?? null;
	const claimInvite = (id, claimedName) => {
		setInvites((prev) => prev.map((i) => i.id === id ? {
			...i,
			status: "active",
			claimedName,
			claimedAt: Date.now()
		} : i));
	};
	const flagInvite = (id, field, note) => {
		setInvites((prev) => prev.map((i) => i.id === id ? {
			...i,
			flags: [...i.flags, {
				id: `f${Date.now()}`,
				field,
				note,
				at: Date.now()
			}]
		} : i));
	};
	const resolveInviteFlag = (inviteId, flagId) => {
		setInvites((prev) => prev.map((i) => i.id === inviteId ? {
			...i,
			flags: i.flags.filter((f) => f.id !== flagId)
		} : i));
	};
	const [pantry, setPantry] = (0, import_react.useState)(INITIAL_PANTRY);
	const adjustPantry = (id, delta) => setPantry((prev) => prev.map((p) => p.id === id ? {
		...p,
		qty: Math.max(0, Math.round((p.qty + delta) * 100) / 100)
	} : p));
	const setPantryQty = (id, qty) => setPantry((prev) => prev.map((p) => p.id === id ? {
		...p,
		qty: Math.max(0, qty)
	} : p));
	const addPantryItem = (item) => setPantry((prev) => [...prev, {
		...item,
		id: `p${Date.now()}`
	}]);
	const removePantryItem = (id) => setPantry((prev) => prev.filter((p) => p.id !== id));
	const [grocery, setGrocery] = (0, import_react.useState)([]);
	const [dismissedSuggestions, setDismissedSuggestions] = (0, import_react.useState)(/* @__PURE__ */ new Set());
	const [groceryModalOpen, setGroceryModalOpen] = (0, import_react.useState)(false);
	const [groceryBudget, setGroceryBudget] = (0, import_react.useState)(1500);
	const [receiptPhoto, setReceiptPhoto] = (0, import_react.useState)(null);
	const groceryDisplay = (0, import_react.useMemo)(() => {
		const covered = new Set(grocery.map((g) => g.pantryItemId).filter(Boolean));
		const suggestions = pantry.filter((p) => p.qty <= p.par && !covered.has(p.id) && !dismissedSuggestions.has(p.id)).map((p) => ({
			id: `sug-${p.id}`,
			name: p.name,
			qty: Math.max(1, Math.round((p.par - p.qty) * 100) / 100),
			unit: p.unit,
			pantryItemId: p.id,
			bought: false
		}));
		return [...grocery, ...suggestions];
	}, [
		grocery,
		pantry,
		dismissedSuggestions
	]);
	const toBuyCount = groceryDisplay.filter((g) => !g.bought).length;
	const grocerySpent = (0, import_react.useMemo)(() => grocery.filter((g) => g.bought).reduce((s, g) => s + (g.costPHP ?? 0), 0), [grocery]);
	const addManualGrocery = (name, qty, unit) => {
		if (!name.trim()) return;
		setGrocery((prev) => [...prev, {
			id: `g${Date.now()}`,
			name: name.trim(),
			qty,
			unit: unit.trim() || "pcs",
			bought: false
		}]);
	};
	const toggleGroceryBought = (item) => {
		if (item.id.startsWith("sug-")) {
			setGrocery((prev) => [...prev, {
				...item,
				id: `g${Date.now()}`,
				bought: true
			}]);
			if (item.pantryItemId) adjustPantry(item.pantryItemId, item.qty);
			return;
		}
		setGrocery((prev) => prev.map((g) => g.id === item.id ? {
			...g,
			bought: !g.bought,
			costPHP: g.bought ? void 0 : g.costPHP
		} : g));
		if (item.pantryItemId) adjustPantry(item.pantryItemId, item.bought ? -item.qty : item.qty);
	};
	const setGroceryCost = (item, cost) => {
		if (item.id.startsWith("sug-")) return;
		setGrocery((prev) => prev.map((g) => g.id === item.id ? {
			...g,
			costPHP: cost
		} : g));
	};
	const removeGroceryItem = (item) => {
		if (item.id.startsWith("sug-")) {
			if (item.pantryItemId) setDismissedSuggestions((prev) => new Set(prev).add(item.pantryItemId));
			return;
		}
		if (item.bought && item.pantryItemId) adjustPantry(item.pantryItemId, -item.qty);
		setGrocery((prev) => prev.filter((g) => g.id !== item.id));
	};
	(0, import_react.useEffect)(() => {
		setDismissedSuggestions((prev) => {
			let changed = false;
			const next = new Set(prev);
			for (const id of prev) {
				const p = pantry.find((x) => x.id === id);
				if (!p || p.qty > p.par) {
					next.delete(id);
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [pantry]);
	const groceryCtxValue = {
		display: groceryDisplay,
		toBuyCount,
		budget: groceryBudget,
		spent: grocerySpent,
		remaining: groceryBudget - grocerySpent,
		receiptPhoto,
		addManual: addManualGrocery,
		toggleBought: toggleGroceryBought,
		setCost: setGroceryCost,
		setBudget: (n) => setGroceryBudget(Math.max(0, n)),
		attachReceipt: () => setReceiptPhoto(RECEIPT_PLACEHOLDER),
		clearReceipt: () => setReceiptPhoto(null),
		remove: removeGroceryItem,
		isPalengkeTask: isPalengke,
		openModal: () => setGroceryModalOpen(true)
	};
	const [simDate, setSimDate] = (0, import_react.useState)(new Date(2026, 6, 7));
	const currentHelperId = "rosa";
	const [schedules, setSchedules] = (0, import_react.useState)(INITIAL_SCHEDULES);
	const updateDaySchedule = (helperId, day, patch) => {
		setSchedules((prev) => {
			const wk = prev[helperId] ?? INITIAL_SCHEDULES[helperId];
			return {
				...prev,
				[helperId]: {
					...wk,
					[day]: {
						...wk[day],
						...patch
					}
				}
			};
		});
	};
	const [rosaAvail, setRosaAvail] = (0, import_react.useState)({
		manual: "off",
		availableUntil: null
	});
	(0, import_react.useEffect)(() => {
		try {
			const raw = window.localStorage.getItem("linara.rosaAvail");
			if (raw) setRosaAvail(JSON.parse(raw));
		} catch {}
	}, []);
	const [simOffsetMs, setSimOffsetMs] = (0, import_react.useState)(null);
	const [nowTs, setNowTs] = (0, import_react.useState)(() => Date.now());
	(0, import_react.useEffect)(() => {
		const tick = () => setNowTs(Date.now() + (simOffsetMs ?? 0));
		tick();
		const id = setInterval(tick, 3e4);
		return () => clearInterval(id);
	}, [simOffsetMs]);
	(0, import_react.useEffect)(() => {
		try {
			window.localStorage.setItem("linara.rosaAvail", JSON.stringify(rosaAvail));
		} catch {}
	}, [rosaAvail]);
	(0, import_react.useEffect)(() => {
		if (rosaAvail.manual === "available" && rosaAvail.availableUntil && rosaAvail.availableUntil <= nowTs) setRosaAvail({
			manual: "off",
			availableUntil: null
		});
	}, [nowTs, rosaAvail]);
	const rosaStatus = (0, import_react.useMemo)(() => {
		const d = new Date(nowTs);
		const h = d.getHours();
		const wd = weekdayOf(d);
		const daySched = (schedules.rosa ?? INITIAL_SCHEDULES.rosa)[wd];
		const isRestDay = daySched.rest;
		const isQuiet = h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
		const minutes = h * 60 + d.getMinutes();
		const onShift = !isQuiet && isMinuteInDay(minutes, daySched);
		if (isQuiet) return {
			status: "off",
			until: null,
			quiet: true,
			restDay: isRestDay
		};
		if (onShift) return {
			status: "on_shift",
			until: null,
			quiet: false,
			restDay: false
		};
		if (rosaAvail.manual === "available" && rosaAvail.availableUntil && rosaAvail.availableUntil > nowTs) return {
			status: "available",
			until: rosaAvail.availableUntil,
			quiet: false,
			restDay: isRestDay
		};
		return {
			status: "off",
			until: null,
			quiet: false,
			restDay: isRestDay
		};
	}, [
		nowTs,
		rosaAvail,
		schedules
	]);
	const setRosaAvailable = (hours) => {
		if (rosaStatus.quiet) return;
		setRosaAvail({
			manual: "available",
			availableUntil: nowTs + hours * 60 * 60 * 1e3
		});
	};
	const setRosaOff = () => setRosaAvail({
		manual: "off",
		availableUntil: null
	});
	const sendQuickUtos = (content, flags = {}) => {
		const toHelper = helperById(currentHelperId);
		setUtosList((prev) => [...prev, {
			id: `u${Date.now()}`,
			content,
			from: flags.from ?? "Manager",
			to: toHelper.name,
			timestamp: Date.now(),
			ackState: "sent",
			afterHours: flags.afterHours,
			emergency: flags.emergency,
			waiting: flags.waiting
		}]);
		setUtosWipedToday(false);
	};
	const logLedger = (partial) => {
		setLedger((prev) => [...prev, {
			...partial,
			id: `l${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			adjustMinutes: 0,
			resolution: ledgerDefault
		}]);
	};
	const classifyRosaReason = (ts, emergency) => {
		if (emergency) return "emergency";
		const d = new Date(ts);
		const wd = weekdayOf(d);
		const day = (schedules.rosa ?? INITIAL_SCHEDULES.rosa)[wd];
		if (day.rest) return "rest_day";
		const minutes = d.getHours() * 60 + d.getMinutes();
		if (day.breakStart && day.breakEnd && minutes >= parseHM(day.breakStart) && minutes < parseHM(day.breakEnd)) return "rest_break";
		if (rosaStatus.status === "available") return "available";
		return "override";
	};
	const ackUtos = (id, ack) => {
		setUtosList((prev) => {
			const u = prev.find((x) => x.id === id);
			const next = prev.map((x) => x.id === id ? {
				...x,
				ackState: ack
			} : x);
			if (u && ack === "done" && rosaStatus.status !== "on_shift") {
				const reason = classifyRosaReason(nowTs, !!u.emergency);
				logLedger({
					sourceId: u.id,
					kind: "utos",
					title: u.content,
					startTs: u.timestamp,
					doneTs: nowTs,
					autoMinutes: 5,
					reason
				});
			}
			return next;
		});
	};
	const updateStatus = (id, status, photo) => {
		setTasks((prev) => {
			const cur = prev.find((t) => t.id === id);
			if (!cur) return prev;
			let startedAt = cur.startedAt;
			if (status === "in_progress" && cur.status !== "in_progress" && !startedAt) startedAt = nowTs;
			const updated = {
				...cur,
				status,
				photo: photo ?? cur.photo,
				blockReason: status === "blocked" ? cur.blockReason : void 0,
				startedAt
			};
			if (status === "done" && cur.status !== "done" && cur.helperId === "rosa" && rosaStatus.status !== "on_shift") {
				const start = startedAt ?? nowTs - 5 * 6e4;
				const autoMinutes = Math.max(1, Math.round((nowTs - start) / 6e4));
				const reason = classifyRosaReason(nowTs, !!cur.emergency);
				logLedger({
					sourceId: cur.id,
					kind: "task",
					title: cur.title,
					station: cur.station,
					appointmentTitle: cur.appointmentTitle,
					startTs: start,
					doneTs: nowTs,
					autoMinutes,
					reason
				});
			}
			return prev.map((t) => t.id === id ? updated : t);
		});
	};
	const updateLedgerEntry = (id, patch) => {
		setLedger((prev) => prev.map((e) => e.id === id ? {
			...e,
			...patch
		} : e));
	};
	const blockTask = (id, reason) => {
		setTasks((prev) => prev.map((t) => t.id === id ? {
			...t,
			status: "blocked",
			blockReason: reason
		} : t));
	};
	const rescheduleTask = (id) => {
		setTasks((prev) => prev.map((t) => t.id === id ? {
			...t,
			status: "todo",
			blockReason: void 0,
			queued: boardClosed ? true : void 0
		} : t));
	};
	const addTask = (t, flags = {}) => {
		const helper = helperById(t.helperId);
		const shouldQueue = boardClosed || flags.queuedForShift;
		setTasks((prev) => [...prev, {
			...t,
			id: `t${Date.now()}`,
			status: "todo",
			station: helper.station,
			queued: shouldQueue || void 0,
			queuedForShift: flags.queuedForShift || void 0,
			afterHours: flags.afterHours,
			emergency: flags.emergency,
			suggested: flags.suggested || void 0
		}]);
	};
	const approveSuggestion = (id) => {
		setTasks((prev) => prev.map((t) => t.id === id ? {
			...t,
			suggested: void 0
		} : t));
	};
	const dismissSuggestion = (id) => {
		setTasks((prev) => prev.filter((t) => t.id !== id));
	};
	const setClosed = (closed) => {
		setBoardClosed(closed);
		if (!closed) setTasks((prev) => prev.map((t) => t.queued ? {
			...t,
			queued: void 0
		} : t));
	};
	const requestVale = (helperId, amount, reason) => {
		setVales((prev) => [...prev, {
			id: `v${Date.now()}`,
			helperId,
			amount,
			reason,
			status: "pending"
		}]);
	};
	const decideVale = (id, decision) => {
		setVales((prev) => prev.map((v) => v.id === id ? {
			...v,
			status: decision
		} : v));
	};
	const addRoutine = (r) => {
		const helper = helperById(r.helperId);
		setRoutines((prev) => [...prev, {
			...r,
			id: `r${Date.now()}`,
			station: helper.station
		}]);
	};
	const removeRoutine = (id) => {
		setRoutines((prev) => prev.filter((r) => r.id !== id));
	};
	const addAppointment = (a, preps) => {
		const id = `a${Date.now()}`;
		setAppointments((prev) => [...prev, {
			...a,
			id
		}]);
		const newTasks = preps.map((p, i) => {
			const { date, time } = computePrepSchedule(a.date, a.time, p.leadMinutes);
			const helper = helperById(p.helperId);
			return {
				id: `${id}-p${i}-${Date.now()}`,
				title: p.title,
				note: p.note,
				time,
				helperId: p.helperId,
				station: helper.station,
				status: "todo",
				appointmentId: id,
				appointmentTitle: a.title,
				scheduledDate: date,
				leadMinutes: p.leadMinutes
			};
		});
		if (newTasks.length > 0) setTasks((prev) => [...prev, ...newTasks]);
	};
	const removeAppointment = (id) => {
		setAppointments((prev) => prev.filter((a) => a.id !== id));
		setTasks((prev) => prev.filter((t) => t.appointmentId !== id));
	};
	const updateAppointment = (id, patch) => {
		setAppointments((prev) => prev.map((a) => a.id === id ? {
			...a,
			...patch
		} : a));
		setTasks((prev) => prev.map((t) => {
			if (t.appointmentId !== id) return t;
			const lead = t.leadMinutes ?? 0;
			const { date: newDate, time: newTime } = computePrepSchedule(patch.date, patch.time, lead);
			if (!(newDate !== t.scheduledDate || newTime !== t.time || patch.title !== t.appointmentTitle)) return {
				...t,
				appointmentTitle: patch.title
			};
			const timeMoved = newDate !== t.scheduledDate || newTime !== t.time;
			return {
				...t,
				time: newTime,
				scheduledDate: newDate,
				appointmentTitle: patch.title,
				rescheduleNotice: timeMoved ? {
					oldTime: t.time,
					oldDate: t.scheduledDate,
					appointmentTitle: patch.title
				} : t.rescheduleNotice
			};
		}));
	};
	const startNewDay = () => {
		const next = new Date(simDate);
		next.setDate(next.getDate() + 1);
		const wd = weekdayOf(next);
		setSimDate(next);
		setBoardClosed(false);
		setUtosWipedToday(utosList.length > 0);
		setUtosList([]);
		setTasks((prev) => {
			const kept = prev.filter((t) => {
				if (t.status === "done") return false;
				if (t.appointmentId) return true;
				if (!t.routineId) return false;
				return true;
			}).map((t) => ({
				...t,
				queued: void 0
			}));
			const liveRoutineIds = new Set(kept.map((t) => t.routineId).filter(Boolean));
			const spawned = routines.filter((r) => routineMatches(r, wd) && !liveRoutineIds.has(r.id)).map((r) => ({
				id: `t-${r.id}-${next.getTime()}`,
				title: r.title,
				note: r.note,
				time: r.time,
				helperId: r.helperId,
				station: r.station,
				status: "todo",
				recurrence: r.recurrence,
				routineId: r.id
			}));
			return [...kept, ...spawned].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen bg-background",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TopBar, {
			viewAs,
			onViewAsChange: setViewAs,
			admins,
			boardClosed,
			onBoardClosedChange: setClosed,
			nowTs,
			simOffsetMs,
			onSimOffsetChange: setSimOffsetMs,
			adminType
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(GroceryCtx.Provider, {
			value: groceryCtxValue,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: "mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6",
				children: role === "manager" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ManagerView, {
					admins,
					adminType,
					currentAdmin,
					onUpdateAdminType: updateAdminType,
					tasks,
					vales,
					routines,
					appointments,
					simDate,
					utosList,
					onAdd: addTask,
					onApproveSuggestion: approveSuggestion,
					onDismissSuggestion: dismissSuggestion,
					onReschedule: rescheduleTask,
					onDecideVale: decideVale,
					onAddRoutine: addRoutine,
					onRemoveRoutine: removeRoutine,
					onAddAppointment: addAppointment,
					onRemoveAppointment: removeAppointment,
					onUpdateAppointment: updateAppointment,
					onStartNewDay: startNewDay,
					onSendUtos: sendQuickUtos,
					boardClosed,
					helperName: helperById(currentHelperId).name,
					rosaStatus,
					ledger,
					ledgerDefault,
					onSetLedgerDefault: setLedgerDefault,
					onUpdateLedgerEntry: updateLedgerEntry,
					pantry,
					onAdjustPantry: adjustPantry,
					onSetPantryQty: setPantryQty,
					onAddPantryItem: addPantryItem,
					onRemovePantryItem: removePantryItem,
					schedules,
					onUpdateDaySchedule: updateDaySchedule,
					invites,
					onAddInvite: addInvite,
					onRemoveInvite: removeInvite,
					onResolveFlag: resolveInviteFlag
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelperView, {
					tasks,
					helper: helperById(currentHelperId),
					vales: vales.filter((v) => v.helperId === currentHelperId),
					boardClosed,
					onUpdate: updateStatus,
					onBlock: blockTask,
					onRequestVale: (amount, reason) => requestVale(currentHelperId, amount, reason),
					utosList,
					onAckUtos: ackUtos,
					utosWipedToday,
					rosaStatus,
					onSetRosaAvailable: setRosaAvailable,
					onSetRosaOff: setRosaOff,
					ledger,
					ledgerDefault,
					onUpdateLedgerEntry: updateLedgerEntry,
					pantry,
					onAdjustPantry: adjustPantry,
					onSetPantryQty: setPantryQty,
					onAddPantryItem: addPantryItem,
					onRemovePantryItem: removePantryItem,
					weekSchedule: schedules[currentHelperId] ?? INITIAL_SCHEDULES[currentHelperId],
					simDate,
					onAddTask: (t) => addTask(t),
					invites,
					onFindInvite: findInviteByCode,
					onClaimInvite: claimInvite,
					onFlagInvite: flagInvite
				})
			}), groceryModalOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroceryModal, { onClose: () => setGroceryModalOpen(false) })]
		})]
	});
}
function TopBar({ viewAs, onViewAsChange, admins, adminType, boardClosed, onBoardClosedChange, nowTs, simOffsetMs, onSimOffsetChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
		className: "sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-w-0 items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "font-display text-2xl font-semibold leading-none tracking-tight text-primary",
							children: "linara"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-0.5 truncate text-[11px] text-muted-foreground",
							children: "Home, made clear."
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewAsSwitcher, {
					viewAs,
					onChange: onViewAsChange,
					admins
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SimClock, {
					nowTs,
					offsetMs: simOffsetMs,
					onChange: onSimOffsetChange
				}),
				(adminType === "primary" || adminType === "co") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EndOfDayToggle, {
					closed: boardClosed,
					onChange: onBoardClosedChange
				})
			]
		})
	});
}
function EndOfDayToggle({ closed, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick: () => onChange(!closed),
		role: "switch",
		"aria-checked": closed,
		className: `inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-soft transition sm:text-xs ${closed ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: "h-3.5 w-3.5" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "whitespace-nowrap",
				children: "Simulate end of day"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: `relative h-4 w-7 rounded-full transition ${closed ? "bg-primary" : "bg-muted"}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `absolute top-0.5 h-3 w-3 rounded-full bg-card shadow transition-all ${closed ? "left-3.5" : "left-0.5"}` })
			})
		]
	});
}
function ViewAsSwitcher({ viewAs, onChange, admins }) {
	const options = [...admins.map((a) => ({
		key: a.id,
		label: a.short,
		sub: adminTypeShort[a.type]
	})), {
		key: "rosa",
		label: "Rosa",
		sub: "Helper"
	}];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "inline-flex shrink-0 flex-col items-start gap-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
			children: "View as"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "inline-flex rounded-full border border-border bg-card p-1 shadow-soft",
			children: options.map((opt) => {
				const active = viewAs === opt.key;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: () => onChange(opt.key),
					className: `flex flex-col items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight transition sm:px-3 sm:text-xs ${active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: opt.label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: `text-[9px] font-medium ${active ? "text-primary-foreground/80" : "text-muted-foreground/70"}`,
						children: opt.sub
					})]
				}, opt.key);
			})
		})]
	});
}
function ManagerView({ admins, adminType, currentAdmin, onUpdateAdminType, tasks, vales, routines, appointments, simDate, utosList, onAdd, onApproveSuggestion, onDismissSuggestion, onReschedule, onDecideVale, onAddRoutine, onRemoveRoutine, onAddAppointment, onRemoveAppointment, onUpdateAppointment, onStartNewDay, onSendUtos, boardClosed, helperName, rosaStatus, ledger, ledgerDefault, onSetLedgerDefault, onUpdateLedgerEntry, pantry, onAdjustPantry, onSetPantryQty, onAddPantryItem, onRemovePantryItem, schedules, onUpdateDaySchedule, invites, onAddInvite, onRemoveInvite, onResolveFlag }) {
	const canEditShifts = adminType === "primary" || adminType === "co";
	const canEditAdmins = adminType === "primary";
	const canStartNewDay = adminType === "primary" || adminType === "co";
	const canOverride = adminType === "primary" || adminType === "co";
	const isRemote = adminType === "remote";
	const authorName = currentAdmin?.name ?? "Manager";
	const [view, setView] = (0, import_react.useState)("pass");
	const [open, setOpen] = (0, import_react.useState)(false);
	const canInvite = adminType === "primary" || adminType === "co";
	const [passMode, setPassMode] = (0, import_react.useState)("line");
	(0, import_react.useEffect)(() => {
		try {
			const stored = window.localStorage.getItem("linara.passMode");
			if (stored === "board" || stored === "line") setPassMode(stored);
		} catch {}
	}, []);
	const updatePassMode = (m) => {
		setPassMode(m);
		if (typeof window !== "undefined") window.localStorage.setItem("linara.passMode", m);
	};
	const active = tasks.filter((t) => !t.queued && !t.suggested);
	const queued = tasks.filter((t) => t.queued);
	const suggestions = tasks.filter((t) => t.suggested);
	const blocked = active.filter((t) => t.status === "blocked");
	const pendingVales = vales.filter((v) => v.status === "pending");
	blocked.length + pendingVales.length;
	const counts = (0, import_react.useMemo)(() => ({
		done: active.filter((t) => t.status === "done").length,
		inProg: active.filter((t) => t.status === "in_progress").length,
		todo: active.filter((t) => t.status === "todo" || t.status === "blocked").length,
		total: active.length
	}), [active]);
	const [gate, setGate] = (0, import_react.useState)(null);
	const rosaOff = rosaStatus.status === "off";
	const stampTask = (t) => ({
		...t,
		createdBy: t.createdBy ?? authorName
	});
	const gatedSendUtos = (content) => {
		if (rosaOff) setGate({
			kind: "utos",
			content
		});
		else onSendUtos(content, { from: authorName });
	};
	const gatedAddTask = (t, opts = {}) => {
		if (isRemote && !opts.sendLive) {
			onAdd(stampTask(t), { suggested: true });
			return;
		}
		if (t.helperId === "rosa" && rosaOff) setGate({
			kind: "task",
			task: stampTask(t)
		});
		else onAdd(stampTask(t), {});
	};
	const gateResolve = (choice) => {
		if (!gate) return;
		if (gate.kind === "utos") if (choice === "queue") onSendUtos(gate.content, {
			waiting: true,
			afterHours: true,
			from: authorName
		});
		else if (choice === "override") onSendUtos(gate.content, {
			afterHours: true,
			from: authorName
		});
		else onSendUtos(gate.content, {
			afterHours: true,
			emergency: true,
			from: authorName
		});
		else {
			const task = stampTask(gate.task);
			if (choice === "queue") onAdd(task, {
				queuedForShift: true,
				afterHours: true
			});
			else if (choice === "override") onAdd(task, { afterHours: true });
			else onAdd(task, {
				afterHours: true,
				emergency: true
			});
		}
		setGate(null);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6 pb-24",
		children: [
			view === "pass" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex items-center justify-end gap-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "inline-flex rounded-full border border-border bg-card p-1 shadow-soft",
					role: "tablist",
					"aria-label": "Pass layout",
					children: [{
						key: "line",
						label: "The Line",
						Icon: Users
					}, {
						key: "board",
						label: "The Board",
						Icon: Columns3
					}].map(({ key, label, Icon }) => {
						const active = passMode === key;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => updatePassMode(key),
							"aria-label": label,
							"aria-pressed": active,
							title: label,
							className: `grid h-8 w-8 place-items-center rounded-full transition ${active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-4 w-4" })
						}, key);
					})
				})
			}),
			view === "pass" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-7",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
									children: "The Pass · Today"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-1.5 w-1.5 rounded-full bg-primary" }), formatSimDate(simDate)]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex shrink-0 flex-col items-end gap-2",
								children: [boardClosed && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: "h-3 w-3" }), " Board closed"]
								}), canStartNewDay && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: onStartNewDay,
									className: "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "h-3.5 w-3.5" }), " Start new day"]
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-display text-lg text-foreground",
									children: weekdayOf(simDate)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted-foreground",
									children: "·"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "inline-flex items-center gap-1.5 text-sm",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-2 w-2 rounded-full bg-[oklch(0.68_0.14_150)]" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-semibold text-foreground tabular-nums",
											children: counts.done
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-muted-foreground",
											children: "done"
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "inline-flex items-center gap-1.5 text-sm",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-2 w-2 rounded-full bg-accent" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-semibold text-foreground tabular-nums",
											children: counts.inProg
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-muted-foreground",
											children: "doing"
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "inline-flex items-center gap-1.5 text-sm",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-2 w-2 rounded-full bg-muted-foreground/50" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-semibold text-foreground tabular-nums",
											children: counts.todo
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-muted-foreground",
											children: "to-do"
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-auto",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RosaStatusChip, { status: rosaStatus })
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-xs text-muted-foreground",
							children: boardClosed ? "The day is done. New tasks are being queued for tomorrow." : `${weekdayOf(simDate) === "Sun" ? "Sunday" : "A calm"} morning. Everyone is at their station.`
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NeedsYou, {
					blocked,
					pendingVales,
					onReschedule,
					onDecideVale,
					flaggedInvites: invites.filter((i) => i.flags.length > 0),
					onResolveFlag
				}),
				isRemote && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RemoteGlance, {
					active,
					helperName,
					adminName: authorName
				}),
				!isRemote && suggestions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SuggestionsInbox, {
					suggestions,
					onApprove: onApproveSuggestion,
					onDismiss: onDismissSuggestion
				}),
				isRemote && suggestions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MySuggestions, {
					suggestions,
					onWithdraw: onDismissSuggestion,
					adminName: authorName
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "space-y-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3 px-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl text-foreground",
							children: passMode === "line" ? "The Line" : "The Board"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted-foreground",
							children: passMode === "line" ? "Tap a lane to see the full day." : "By status, in time order."
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => setOpen(true),
							className: "inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3.5 w-3.5" }), " New task"]
						})]
					}), passMode === "line" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "space-y-3",
						children: HELPERS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelperLane, {
							helper: h,
							tasks: active.filter((t) => t.helperId === h.id)
						}, h.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TheBoardStatusLists, { tasks: active })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TodaysSpendDial, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-3xl border border-border/70 bg-card p-4 shadow-soft",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
									children: "Next payday"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarClock, { className: "h-3.5 w-3.5 text-muted-foreground" })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-1.5 font-display text-2xl text-foreground",
								children: "Jul 15"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-0.5 text-xs text-muted-foreground",
								children: "8 days away"
							})
						]
					})]
				})
			] }),
			view === "schedule" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-6",
				children: [
					isRemote && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-3xl border border-dashed border-border/70 bg-card/60 p-4 text-xs text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-pine-deep",
							children: "Remote view"
						}), "Shift editing and reaching a helper off-hours stay with the on-site managers. You can still look at the week and add appointments."]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShiftsSection, {
						schedules,
						onUpdate: onUpdateDaySchedule,
						readOnly: !canEditShifts
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QuickUtosLauncher, {
						onSend: gatedSendUtos,
						helperName
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoutinesView, {
						routines,
						onAdd: onAddRoutine,
						onRemove: onRemoveRoutine
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppointmentsSection, {
						appointments,
						tasks,
						simDate,
						onAdd: onAddAppointment,
						onRemove: onRemoveAppointment,
						onUpdate: onUpdateAppointment
					}),
					queued.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-3xl border border-border/70 bg-card/60 p-4 sm:p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-3 flex items-center justify-between",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: "h-4 w-4" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-sm font-semibold text-foreground",
									children: ["Queued for tomorrow · ", queued.length]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: "These will move to To-do when you reopen the board."
								})] })]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-3 sm:grid-cols-2 md:grid-cols-3",
							children: queued.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TaskCard, { task: t }, t.id))
						})]
					})
				]
			}),
			view === "pantry" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PantrySection, {
					items: pantry,
					onAdjust: onAdjustPantry,
					onSetQty: onSetPantryQty,
					onAdd: onAddPantryItem,
					onRemove: onRemovePantryItem
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GrocerySection, {})]
			}),
			view === "money" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TodaysSpendDial, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-3xl border border-border/70 bg-card p-4 shadow-soft",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
									children: "Next payday"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarClock, { className: "h-3.5 w-3.5 text-muted-foreground" })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-1.5 font-display text-2xl text-foreground",
								children: "Jul 15"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-0.5 text-xs text-muted-foreground",
								children: "8 days away"
							})
						]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AfterHoursLedger, {
					entries: ledger,
					ledgerDefault,
					onSetDefault: onSetLedgerDefault,
					onUpdateEntry: onUpdateLedgerEntry,
					audience: "manager",
					helperName
				})]
			}),
			view === "people" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PeopleSection, {
				admins,
				currentAdmin,
				canEditAdmins,
				onUpdateAdminType,
				schedules,
				invites,
				canInvite,
				onInvite: (data) => onAddInvite(data, authorName),
				onCancelInvite: onRemoveInvite
			}),
			open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewTaskModal, {
				isRemote,
				onClose: () => setOpen(false),
				onAdd: (t, opts) => {
					gatedAddTask(t, opts);
					setOpen(false);
				}
			}),
			gate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AvailabilityGate, {
				intent: gate,
				status: rosaStatus,
				helperName,
				canOverride,
				onCancel: () => setGate(null),
				onChoose: gateResolve
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BottomNav, {
				active: view,
				onChange: (k) => setView(k),
				items: [
					{
						key: "pass",
						label: "Pass",
						Icon: ClipboardList
					},
					{
						key: "schedule",
						label: "Schedule",
						Icon: Calendar
					},
					{
						key: "pantry",
						label: "Pantry",
						Icon: Package
					},
					{
						key: "money",
						label: "Money",
						Icon: Wallet
					},
					{
						key: "people",
						label: "People",
						Icon: Users
					}
				]
			})
		]
	});
}
function BottomNav({ items, active, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
		className: "fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]",
		"aria-label": "Primary",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mx-auto flex max-w-6xl items-stretch justify-around px-2 sm:px-6",
			children: items.map(({ key, label, Icon }) => {
				const isActive = active === key;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: () => onChange(key),
					"aria-current": isActive ? "page" : void 0,
					className: `flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5 text-[11px] font-semibold transition ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `h-5 w-5 ${isActive ? "text-primary" : ""}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })]
				}, key);
			})
		})
	});
}
function PeopleSection({ admins, currentAdmin, canEditAdmins, onUpdateAdminType, schedules, invites, canInvite, onInvite, onCancelInvite }) {
	const [inviteOpen, setInviteOpen] = (0, import_react.useState)(false);
	const [issued, setIssued] = (0, import_react.useState)(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6 pb-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4 flex items-start justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl text-foreground",
							children: "Admins"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs text-muted-foreground",
							children: ["The grown-ups who run the house. ", canEditAdmins ? "As Primary, you can change roles." : "Only the Primary can change roles."]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-3 w-3" }),
								" ",
								admins.length
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "space-y-3",
						children: admins.map((a) => {
							const isYou = currentAdmin?.id === a.id;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-start gap-3 rounded-2xl border border-border/70 bg-background/40 p-3.5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: a.initials }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0 flex-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex flex-wrap items-center gap-2",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "text-sm font-semibold text-foreground",
														children: a.name
													}),
													isYou && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary",
														children: "You"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.type === "primary" ? "bg-primary/10 text-primary" : a.type === "co" ? "bg-secondary text-pine-deep" : "bg-terracotta-soft/60 text-[oklch(0.38_0.09_60)]"}`,
														children: adminTypeLabel[a.type]
													})
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: a.location
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "mt-1.5 text-xs text-muted-foreground",
												children: adminPermSummary[a.type]
											})
										]
									}),
									canEditAdmins && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "shrink-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
											className: "sr-only",
											htmlFor: `role-${a.id}`,
											children: ["Role for ", a.name]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											id: `role-${a.id}`,
											value: a.type,
											onChange: (e) => onUpdateAdminType(a.id, e.target.value),
											className: "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-primary",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "primary",
													children: "Primary manager"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "co",
													children: "Co-manager"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "remote",
													children: "Remote admin"
												})
											]
										})]
									})
								]
							}, a.id);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 text-[11px] italic text-muted-foreground",
						children: "Roles are mock data — changes stay on this device."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4 flex items-start justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl text-foreground",
							children: "Helpers"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted-foreground",
							children: "Your household team, by station."
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-3 w-3" }),
								" ",
								HELPERS.length + invites.length
							]
						})]
					}),
					canInvite && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setInviteOpen(true),
						className: "mb-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3.5 w-3.5" }), " Invite a helper"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-3",
						children: [HELPERS.map((h) => {
							const wk = schedules[h.id];
							const restLabel = wk ? WEEKDAYS.filter((d) => wk[d].rest).map((d) => WEEKDAY_LONG[d]).join(", ") || "None" : h.restDay;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start gap-3 rounded-2xl border border-border/70 bg-background/40 p-3.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: h.initials }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap items-center gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-sm font-semibold text-foreground",
												children: h.name
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-pine-deep",
												children: h.station
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-0.5 text-[11px] text-muted-foreground",
											children: ["Shift: ", h.shift]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-[11px] text-muted-foreground",
											children: ["Rest: ", restLabel]
										})
									]
								})]
							}, h.id);
						}), invites.map((inv) => {
							const displayName = inv.claimedName || inv.name;
							const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "??";
							const isActive = inv.status === "active";
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: `flex flex-wrap items-start gap-3 rounded-2xl p-3.5 ${isActive ? "border border-border/70 bg-background/40" : "border border-dashed border-terracotta/50 bg-terracotta-soft/30"}`,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0 flex-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex flex-wrap items-center gap-2",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "text-sm font-semibold text-foreground",
														children: displayName
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-pine-deep",
														children: inv.station
													}),
													isActive ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary",
														children: "Active"
													}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "rounded-full bg-terracotta/20 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]",
														children: "Invited — pending"
													}),
													inv.flags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
														className: "inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]",
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-2.5 w-2.5" }),
															" ",
															inv.flags.length,
															" flag",
															inv.flags.length > 1 ? "s" : ""
														]
													})
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: [
													inv.employment === "live-in" ? "Live-in" : "Live-out",
													" · ",
													inv.shift,
													" · Rest: ",
													inv.restDay
												]
											}),
											!isActive ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "text-[11px] text-muted-foreground",
												children: [
													"Code: ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-mono font-semibold text-foreground",
														children: inv.code
													}),
													" · invited by ",
													inv.createdBy
												]
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "text-[11px] text-muted-foreground",
												children: ["Claimed her own account · joined via ", inv.createdBy]
											}),
											inv.flags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
												className: "mt-1.5 space-y-0.5 text-[11px] text-[oklch(0.38_0.09_60)]",
												children: inv.flags.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
													"Flagged: ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-semibold",
														children: f.field
													}),
													f.note ? ` — "${f.note}"` : ""
												] }, f.id))
											})
										]
									}),
									!isActive && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex shrink-0 flex-col items-end gap-1.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => setIssued(inv),
											className: "rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground hover:border-primary",
											children: "Show code"
										}), canInvite && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => onCancelInvite(inv.id),
											className: "rounded-full px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive",
											children: "Cancel"
										})]
									})
								]
							}, inv.id);
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 text-[11px] italic text-muted-foreground",
						children: "You're entering the household's record and sending an invite — you're not creating her login. She'll set up and control her own account, and her record stays hers."
					})
				]
			}),
			inviteOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InviteHelperModal, {
				onClose: () => setInviteOpen(false),
				onSubmit: (data) => {
					const inv = onInvite(data);
					setInviteOpen(false);
					setIssued(inv);
				}
			}),
			issued && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InviteCodeScreen, {
				invite: issued,
				onClose: () => setIssued(null)
			})
		]
	});
}
function InviteHelperModal({ onClose, onSubmit }) {
	const [name, setName] = (0, import_react.useState)("");
	const [station, setStation] = (0, import_react.useState)("Yaya");
	const [employment, setEmployment] = (0, import_react.useState)("live-in");
	const [shift, setShift] = (0, import_react.useState)("6:00 AM – 7:00 PM");
	const [restDay, setRestDay] = (0, import_react.useState)("Sunday");
	const [wage, setWage] = (0, import_react.useState)("8000");
	const [phone, setPhone] = (0, import_react.useState)("");
	const submit = () => {
		if (!name.trim()) return;
		onSubmit({
			name: name.trim(),
			station,
			employment,
			shift: shift.trim() || "—",
			restDay: restDay.trim() || "—",
			wagePHP: parseInt(wage, 10) || 0,
			phone: phone.trim()
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-display text-xl text-foreground",
							children: "Invite a helper"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted-foreground",
							children: "You're entering the household's record of the arrangement — not creating her account. She'll claim it herself with the invite code."
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Full name",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "e.g. Ate Marites",
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Station / role",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									value: station,
									onChange: (e) => setStation(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "Yaya",
											children: "Yaya"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "Cook",
											children: "Cook"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "Driver",
											children: "Driver"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "House",
											children: "All-around"
										})
									]
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Employment",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									value: employment,
									onChange: (e) => setEmployment(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "live-in",
										children: "Live-in"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "live-out",
										children: "Live-out"
									})]
								})
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Shift hours",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: shift,
								onChange: (e) => setShift(e.target.value),
								placeholder: "e.g. 6:00 AM – 7:00 PM",
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Rest day",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: restDay,
									onChange: (e) => setRestDay(e.target.value),
									placeholder: "e.g. Sunday",
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Monthly wage (₱)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									inputMode: "numeric",
									value: wage,
									onChange: (e) => setWage(e.target.value.replace(/\D/g, "")),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
								})
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Contact number",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: phone,
								onChange: (e) => setPhone(e.target.value),
								placeholder: "e.g. 0917 555 1234",
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: submit,
						disabled: !name.trim(),
						className: "rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50",
						children: "Generate invite code"
					})]
				})
			]
		})
	});
}
function InviteCodeScreen({ invite, onClose }) {
	const [copied, setCopied] = (0, import_react.useState)(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(invite.code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch {}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: "Invite created"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
							className: "mt-1 font-display text-2xl text-foreground",
							children: ["Share this code with ", invite.name]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 rounded-3xl border border-dashed border-primary/40 bg-primary/5 px-5 py-6 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "font-display text-4xl font-semibold tracking-[0.15em] text-primary",
						children: invite.code
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: copy,
						className: "mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground hover:border-primary",
						children: copied ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3 w-3" }), " Copied"] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { className: "h-3 w-3" }), " Copy code"] })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 space-y-2 rounded-2xl bg-background/60 p-4 text-xs text-muted-foreground",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-semibold text-foreground",
								children: invite.station
							}),
							" · ",
							invite.employment === "live-in" ? "Live-in" : "Live-out"
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Shift: ", invite.shift] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Rest day: ", invite.restDay] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							"Wage: ₱",
							invite.wagePHP.toLocaleString(),
							" / month"
						] }),
						invite.phone && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Contact: ", invite.phone] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-4 text-[11px] leading-relaxed text-muted-foreground",
					children: [
						"She'll set up and control her own account with this code — her record stays hers. Until then she'll appear as ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-semibold text-foreground",
							children: "Invited — pending"
						}),
						" in your People list."
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-5 flex justify-end",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90",
						children: "Done"
					})
				})
			]
		})
	});
}
function ClaimAccountFlow({ onClose, onFindInvite, onClaim, onFlag, onFinished }) {
	const [step, setStep] = (0, import_react.useState)("code");
	const [codeInput, setCodeInput] = (0, import_react.useState)("");
	const [codeError, setCodeError] = (0, import_react.useState)(null);
	const [invite, setInvite] = (0, import_react.useState)(null);
	const [displayName, setDisplayName] = (0, import_react.useState)("");
	const [pin, setPin] = (0, import_react.useState)("");
	const [pin2, setPin2] = (0, import_react.useState)("");
	const [flagField, setFlagField] = (0, import_react.useState)("Shift hours");
	const [flagNote, setFlagNote] = (0, import_react.useState)("");
	const [flagged, setFlagged] = (0, import_react.useState)(false);
	const submitCode = () => {
		const found = onFindInvite(codeInput);
		if (!found) {
			setCodeError("Hindi namin nakita 'yang code. Check the letters and numbers, tapos try ulit.");
			return;
		}
		setInvite(found);
		setDisplayName(found.name);
		setCodeError(null);
		setStep("review");
	};
	const submitClaim = () => {
		if (!invite) return;
		if (!displayName.trim()) return;
		if (pin.length < 4 || pin !== pin2) return;
		onClaim(invite.id, displayName.trim());
		onFinished({
			...invite,
			status: "active",
			claimedName: displayName.trim()
		});
	};
	const submitFlag = () => {
		if (!invite) return;
		onFlag(invite.id, flagField, flagNote.trim() || void 0);
		setFlagged(true);
		setStep("review");
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-4 flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-primary",
							children: step === "code" ? "Step 1 of 3" : step === "review" ? "Step 2 of 3" : step === "setup" ? "Step 3 of 3" : "Flag a detail"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
							className: "mt-1 font-display text-2xl leading-tight text-foreground",
							children: [
								step === "code" && "Claim your account",
								step === "review" && "Tingnan mo muna — ito ba ang usapan?",
								step === "setup" && "This account is yours.",
								step === "flag" && "Something's not right?"
							]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						"aria-label": "Close",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				step === "code" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm leading-relaxed text-muted-foreground",
							children: [
								"I-enter mo 'yung invite code galing sa employer mo. Mukhang ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono font-semibold text-foreground",
									children: "LINARA-1234"
								}),
								"."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
								htmlFor: "claim-code",
								children: "Invite code"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: "claim-code",
								autoFocus: true,
								value: codeInput,
								onChange: (e) => {
									setCodeInput(e.target.value.toUpperCase());
									setCodeError(null);
								},
								placeholder: "LINARA-1234",
								className: "mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-4 text-center font-mono text-xl tracking-[0.2em] text-foreground outline-none focus:border-primary"
							}),
							codeError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-2 flex items-start gap-1.5 text-xs text-[oklch(0.38_0.09_60)]",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "mt-0.5 h-3 w-3 shrink-0" }),
									" ",
									codeError
								]
							})
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: submitCode,
							disabled: !codeInput.trim(),
							className: "w-full rounded-full bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50",
							children: "Continue"
						})
					]
				}),
				step === "review" && invite && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm leading-relaxed text-muted-foreground",
							children: "Ito 'yung inilagay ng employer mo sa household record. Basahin muna — hindi ka pumapasok sa black box."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-2 rounded-2xl border border-border/70 bg-background/60 p-4 text-sm",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
									label: "Pangalan",
									value: invite.name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
									label: "Role / station",
									value: invite.station
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
									label: "Employment",
									value: invite.employment === "live-in" ? "Live-in" : "Live-out"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
									label: "Shift",
									value: invite.shift
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
									label: "Rest day",
									value: invite.restDay
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
									label: "Monthly wage",
									value: `₱${invite.wagePHP.toLocaleString()}`
								})
							]
						}),
						flagged && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start gap-2 rounded-2xl border border-terracotta/50 bg-terracotta-soft/40 px-3 py-2.5 text-xs text-[oklch(0.38_0.09_60)]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Salamat — sinabi na namin sa manager mo. Pwede ka pa ring mag-continue, o mag-antay muna ng ayos." })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setStep("flag"),
							className: "w-full text-left text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80",
							children: "Something's not right? →"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-2 sm:flex-row",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => setStep("code"),
								className: "rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground",
								children: "Back"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => setStep("setup"),
								className: "flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90",
								children: "Looks right — continue"
							})]
						})
					]
				}),
				step === "flag" && invite && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm leading-relaxed text-muted-foreground",
							children: "Alin ang mali? Sabihin mo lang — ipapaalam namin sa manager. Hindi mo pa kailangang pumirma."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
							htmlFor: "flag-field",
							children: "Which detail?"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							id: "flag-field",
							value: flagField,
							onChange: (e) => setFlagField(e.target.value),
							className: "mt-1.5 w-full rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Pangalan" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Role / station" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Employment" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Shift hours" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Rest day" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Monthly wage" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Iba pa" })
							]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
							htmlFor: "flag-note",
							children: "Note (optional)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							id: "flag-note",
							value: flagNote,
							onChange: (e) => setFlagNote(e.target.value),
							rows: 3,
							placeholder: "e.g. Ang usapan namin ay 7 AM – 6 PM, hindi 6 AM – 7 PM.",
							className: "mt-1.5 w-full resize-none rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary"
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-2 sm:flex-row",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => setStep("review"),
								className: "rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground",
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: submitFlag,
								className: "flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90",
								children: "Send flag to manager"
							})]
						})
					]
				}),
				step === "setup" && invite && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl bg-primary/5 p-4 text-sm leading-relaxed text-foreground",
							children: [
								"This account is ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-semibold text-primary",
									children: "yours"
								}),
								". Your record stays with you, even if you change households."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
							htmlFor: "claim-name",
							children: "Your name (paano mo gustong tawagin)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							id: "claim-name",
							value: displayName,
							onChange: (e) => setDisplayName(e.target.value),
							className: "mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary"
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
								htmlFor: "claim-pin",
								children: "4-digit PIN"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: "claim-pin",
								inputMode: "numeric",
								maxLength: 6,
								value: pin,
								onChange: (e) => setPin(e.target.value.replace(/\D/g, "")),
								placeholder: "••••",
								className: "mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
								htmlFor: "claim-pin2",
								children: "Ulitin"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: "claim-pin2",
								inputMode: "numeric",
								maxLength: 6,
								value: pin2,
								onChange: (e) => setPin2(e.target.value.replace(/\D/g, "")),
								placeholder: "••••",
								className: "mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
							})] })]
						}),
						pin.length >= 4 && pin !== pin2 && pin2.length >= pin.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-[oklch(0.38_0.09_60)]",
							children: "Hindi magkatugma 'yung PIN. Try again."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] leading-relaxed text-muted-foreground",
							children: "PIN lang muna para sa prototype — hindi ito ipinapadala kahit kanino."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-2 sm:flex-row",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => setStep("review"),
								className: "rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground",
								children: "Back"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: submitClaim,
								disabled: !displayName.trim() || pin.length < 4 || pin !== pin2,
								className: "flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50",
								children: "Claim my account"
							})]
						})
					]
				})
			]
		})
	});
}
function ReviewRow({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-start justify-between gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-right text-sm font-semibold text-foreground",
			children: value
		})]
	});
}
function ClaimedWelcome({ invite, onClose }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-lift",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-6 w-6" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					className: "mt-4 font-display text-2xl text-foreground",
					children: [
						"Welcome, ",
						invite.claimedName || invite.name,
						"."
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm leading-relaxed text-muted-foreground",
					children: "Ito na 'yung Station mo. Nandito lahat ng gagawin ngayon — at ang record mo, sa'yo pa rin, kahit saan ka magtrabaho."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: onClose,
					className: "mt-5 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90",
					children: "Go to my Station"
				})
			]
		})
	});
}
function ShiftsSection({ schedules, onUpdate, readOnly = false }) {
	const [editing, setEditing] = (0, import_react.useState)(null);
	const restByDay = (0, import_react.useMemo)(() => {
		const map = {
			Mon: [],
			Tue: [],
			Wed: [],
			Thu: [],
			Fri: [],
			Sat: [],
			Sun: []
		};
		for (const h of HELPERS) {
			const wk = schedules[h.id];
			if (!wk) continue;
			for (const d of WEEKDAYS) if (wk[d].rest) map[d].push(h.short);
		}
		return map;
	}, [schedules]);
	const warnings = WEEKDAYS.map((d) => ({
		day: d,
		offs: restByDay[d]
	})).filter((w) => w.offs.length >= 2);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl text-foreground",
					children: "Shifts"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-muted-foreground",
					children: "Weekly pattern per helper. Tap a day to edit hours or break."
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarClock, { className: "h-3 w-3" }),
						" ",
						HELPERS.length,
						" helpers"
					]
				})]
			}),
			warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-4 space-y-1.5",
				children: warnings.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start gap-2 rounded-2xl border border-terracotta/40 bg-terracotta-soft/50 px-3 py-2 text-xs text-[oklch(0.38_0.09_60)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "font-semibold",
							children: ["No one covers ", WEEKDAY_LONG[w.day]]
						}),
						" — ",
						w.offs.join(" & "),
						" both off."
					] })]
				}, w.day))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-4",
				children: HELPERS.map((h) => {
					const wk = schedules[h.id];
					if (!wk) return null;
					const restLabel = WEEKDAYS.filter((d) => wk[d].rest).map((d) => WEEKDAY_LONG[d]).join(", ") || "None";
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-2xl border border-border/70 bg-background/40 p-3.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mb-2 flex items-center justify-between gap-2",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: h.initials }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-sm font-semibold text-foreground",
										children: h.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-[11px] text-muted-foreground",
										children: [
											h.station,
											" · Rest: ",
											restLabel
										]
									})] })]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid grid-cols-7 gap-1.5",
								children: WEEKDAYS.map((d) => {
									const day = wk[d];
									const isEditing = editing?.helperId === h.id && editing.day === d;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										disabled: readOnly,
										onClick: () => setEditing(isEditing ? null : {
											helperId: h.id,
											day: d
										}),
										className: `flex flex-col items-center rounded-xl border px-1 py-1.5 text-[10px] transition ${isEditing ? "border-primary bg-primary/10 text-primary" : day.rest ? "border-border/60 bg-secondary/50 text-muted-foreground" : "border-border/70 bg-card text-foreground hover:border-primary/40"} ${readOnly ? "cursor-default opacity-95" : ""}`,
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-semibold uppercase tracking-wider",
											children: d
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "mt-0.5 leading-tight",
											children: day.rest ? "Rest" : day.segments.map((s) => `${s.start}`).join("/") || "—"
										})]
									}, d);
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 text-[11px] leading-relaxed text-muted-foreground",
								children: [WEEKDAYS.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: editing?.helperId === h.id && editing.day === d ? "hidden" : "hidden" }, d)), editing && editing.helperId === h.id ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: readOnly ? "Remote admin — read-only view." : "Tap a day to edit." })]
							}),
							editing && editing.helperId === h.id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DayEditor, {
								day: editing.day,
								value: wk[editing.day],
								onChange: (patch) => onUpdate(h.id, editing.day, patch),
								onClose: () => setEditing(null)
							}, editing.day)
						]
					}, h.id);
				})
			})
		]
	});
}
function DayEditor({ day, value, onChange, onClose }) {
	const toggleRest = () => {
		if (value.rest) onChange({
			rest: false,
			segments: [{
				start: "08:00",
				end: "17:00"
			}]
		});
		else onChange({
			rest: true,
			segments: []
		});
	};
	const updateSeg = (idx, patch) => {
		onChange({ segments: value.segments.map((s, i) => i === idx ? {
			...s,
			...patch
		} : s) });
	};
	const addSegment = () => onChange({ segments: [...value.segments, {
		start: "14:00",
		end: "18:00"
	}] });
	const removeSegment = (idx) => onChange({ segments: value.segments.filter((_, i) => i !== idx) });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 rounded-2xl border border-primary/30 bg-secondary/40 p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-2 flex items-center justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs font-semibold text-pine-deep",
				children: WEEKDAY_LONG[day]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-pine-deep",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: value.rest,
						onChange: toggleRest,
						className: "h-3.5 w-3.5 accent-current"
					}), "Rest day"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: onClose,
					className: "rounded-full p-1 text-muted-foreground hover:bg-card",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-3.5 w-3.5" })
				})]
			})]
		}), !value.rest && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-2",
			children: [
				value.segments.map((seg, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "time",
							value: seg.start,
							onChange: (e) => updateSeg(i, { start: e.target.value }),
							className: "w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: "–"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "time",
							value: seg.end,
							onChange: (e) => updateSeg(i, { end: e.target.value }),
							className: "w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
						}),
						value.segments.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => removeSegment(i),
							className: "rounded-full p-1 text-muted-foreground hover:text-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
						})
					]
				}, i)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: addSegment,
					className: "inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Split shift"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 border-t border-border/60 pt-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
						children: "Daily rest break"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "time",
								value: value.breakStart ?? "",
								onChange: (e) => onChange({ breakStart: e.target.value || void 0 }),
								className: "w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "–"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "time",
								value: value.breakEnd ?? "",
								onChange: (e) => onChange({ breakEnd: e.target.value || void 0 }),
								className: "w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
							}),
							(value.breakStart || value.breakEnd) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => onChange({
									breakStart: void 0,
									breakEnd: void 0
								}),
								className: "rounded-full p-1 text-muted-foreground hover:text-foreground",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[11px] text-muted-foreground",
					children: ["Summary: ", summarizeDay(value)]
				})
			]
		})]
	});
}
var STATION_HEX = {
	Yaya: {
		solid: "#E6A98F",
		soft: "rgba(230,169,143,0.16)"
	},
	Cook: {
		solid: "#7FA98C",
		soft: "rgba(127,169,140,0.18)"
	},
	Driver: {
		solid: "#8098B4",
		soft: "rgba(128,152,180,0.20)"
	},
	Laundry: {
		solid: "#8098B4",
		soft: "rgba(128,152,180,0.20)"
	},
	House: {
		solid: "#1F5A54",
		soft: "rgba(31,90,84,0.14)"
	}
};
function HelperLane({ helper, tasks }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const color = STATION_HEX[helper.station];
	const sorted = (0, import_react.useMemo)(() => [...tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)), [tasks]);
	const doneCount = sorted.filter((t) => t.status === "done").length;
	const inProg = sorted.find((t) => t.status === "in_progress");
	const upcoming = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
	const nowTask = inProg ?? upcoming[0];
	const nextTask = upcoming.find((t) => t.id !== nowTask?.id);
	const nowMin = inProg ? parseTimeToMinutes(inProg.time) : Number.POSITIVE_INFINITY;
	const overdueSet = new Set(sorted.filter((t) => t.id !== inProg?.id && (t.status === "todo" || t.status === "blocked") && (t.status === "blocked" || parseTimeToMinutes(t.time) < nowMin)).map((t) => t.id));
	const pill = overdueSet.size > 0 ? {
		text: `⚠ ${overdueSet.size} overdue`,
		cls: "bg-[oklch(0.93_0.06_35)] text-[oklch(0.42_0.15_35)]"
	} : inProg ? {
		text: `Now: ${inProg.title}`,
		cls: "bg-[oklch(0.93_0.08_75)] text-[oklch(0.4_0.13_75)]"
	} : {
		text: "On track",
		cls: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.36_0.1_150)]"
	};
	const pct = sorted.length === 0 ? 0 : Math.round(doneCount / sorted.length * 100);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "overflow-hidden rounded-3xl border bg-card shadow-soft",
		style: { borderColor: `${color.solid}55` },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				onClick: () => setOpen((o) => !o),
				className: "flex w-full items-center gap-3 p-4 text-left transition hover:bg-secondary/30",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow-soft",
						style: { backgroundColor: color.solid },
						children: helper.initials
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-baseline gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-display text-base text-foreground",
								children: helper.short
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
								children: helper.station
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-1.5 flex items-center gap-2.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "h-1.5 flex-1 overflow-hidden rounded-full bg-secondary",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "h-full rounded-full transition-all",
									style: {
										width: `${pct}%`,
										backgroundColor: color.solid
									}
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "shrink-0 text-[11px] font-semibold text-muted-foreground tabular-nums",
								children: [
									doneCount,
									" of ",
									sorted.length
								]
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: `ml-1 max-w-[42%] shrink-0 truncate rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${pill.cls}`,
						children: pill.text
					})
				]
			}),
			(nowTask || nextTask) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 px-4 pb-3 sm:grid-cols-2",
				children: [nowTask && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LaneNowRow, {
					label: inProg ? "Now" : "Next up",
					task: nowTask,
					color,
					late: overdueSet.has(nowTask.id)
				}), nextTask && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LaneNowRow, {
					label: "Next",
					task: nextTask,
					color,
					late: overdueSet.has(nextTask.id),
					muted: true
				})]
			}),
			open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-t border-border/60 px-2 py-2",
				children: sorted.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2 text-xs text-muted-foreground",
					children: "No tasks today."
				}) : sorted.map((t) => {
					const isLate = overdueSet.has(t.id);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start gap-2.5 rounded-xl px-2 py-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.status === "done" ? "bg-[oklch(0.68_0.14_150)]" : t.status === "in_progress" ? "bg-accent" : isLate ? "bg-[oklch(0.6_0.18_35)]" : "bg-muted-foreground/40"}` }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "w-16 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground",
								children: t.time
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: `text-sm ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`,
									children: t.title
								}), t.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-0.5 line-clamp-2 text-[11px] italic text-muted-foreground",
									children: [
										"\"",
										t.note,
										"\""
									]
								})]
							}),
							isLate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "shrink-0 rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]",
								children: "Late"
							})
						]
					}, t.id);
				})
			})
		]
	});
}
function LaneNowRow({ label, task, color, late, muted }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border px-3 py-2",
		style: {
			backgroundColor: muted ? "transparent" : color.soft,
			borderColor: `${color.solid}40`
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
						children: label
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[11px] font-semibold tabular-nums text-foreground",
						children: ["· ", task.time]
					}),
					late && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]",
						children: "Late"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-0.5 truncate text-sm font-medium text-foreground",
				children: task.title
			}),
			isPalengke(task) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PalengkeChip, { compact: true })
			})
		]
	});
}
function TheBoardStatusLists({ tasks }) {
	const [tab, setTab] = (0, import_react.useState)("todo");
	const sorted = (0, import_react.useMemo)(() => [...tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)), [tasks]);
	const todo = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
	const doing = sorted.filter((t) => t.status === "in_progress");
	const done = sorted.filter((t) => t.status === "done");
	const nowMin = doing.length > 0 ? parseTimeToMinutes(doing[0].time) : null;
	const overdueId = (t) => t.status === "blocked" || nowMin !== null && parseTimeToMinutes(t.time) < nowMin;
	const tabs = [
		{
			key: "todo",
			label: "To-do",
			count: todo.length,
			list: todo
		},
		{
			key: "doing",
			label: "Doing",
			count: doing.length,
			list: doing
		},
		{
			key: "done",
			label: "Done",
			count: done.length,
			list: done
		}
	];
	const current = tabs.find((t) => t.key === tab);
	let nowMarkerIdx = -1;
	if (tab === "todo" && nowMin !== null) {
		nowMarkerIdx = todo.findIndex((t) => parseTimeToMinutes(t.time) >= nowMin);
		if (nowMarkerIdx === -1) nowMarkerIdx = todo.length;
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "inline-flex w-full rounded-full border border-border bg-card p-1 shadow-soft",
			children: tabs.map((t) => {
				const active = t.key === tab;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: () => setTab(t.key),
					className: `flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`,
					children: [t.label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: `rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-pine-deep"}`,
						children: t.count
					})]
				}, t.key);
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-2.5",
			children: [current.list.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground",
				children: "Nothing here."
			}) : current.list.map((t, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [tab === "todo" && i === nowMarkerIdx && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NowMarker, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BoardTaskCard, {
				task: t,
				late: tab !== "done" && overdueId(t),
				isDoing: t.status === "in_progress"
			})] }, t.id)), tab === "todo" && nowMarkerIdx === current.list.length && current.list.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NowMarker, {})]
		})]
	});
}
function NowMarker() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2 px-1 py-1",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-2 w-2 rounded-full bg-accent" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[10px] font-bold uppercase tracking-[0.16em] text-accent-foreground/80",
				children: "now"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-px flex-1 bg-accent/40" })
		]
	});
}
function BoardTaskCard({ task, late, isDoing }) {
	const [showNote, setShowNote] = (0, import_react.useState)(false);
	const helper = helperById(task.helperId);
	const color = STATION_HEX[task.station];
	const isDone = task.status === "done";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("article", {
		className: "overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft",
		style: { borderLeft: `4px solid ${color.solid}` },
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start gap-2.5 p-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "w-14 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground",
				children: task.time
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
								className: `text-sm font-semibold ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`,
								children: task.title
							}),
							isDoing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground",
								children: "Doing"
							}),
							late && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]",
								children: "Late"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1.5 flex flex-wrap items-center gap-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
								style: {
									backgroundColor: color.soft,
									color: "var(--pine-deep)"
								},
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "h-1.5 w-1.5 rounded-full",
										style: { backgroundColor: color.solid }
									}),
									task.station,
									" · ",
									helper.short
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecurrenceBadge, { recurrence: task.recurrence }),
							task.appointmentTitle && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-pine-deep",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { className: "h-2.5 w-2.5" }),
									" ",
									task.appointmentTitle
								]
							}),
							task.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => setShowNote((s) => !s),
								className: "inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleQuestionMark, { className: "h-2.5 w-2.5" }),
									" ",
									showNote ? "Hide note" : "Note"
								]
							}),
							isPalengke(task) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PalengkeChip, {})
						]
					}),
					showNote && task.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep",
						children: [
							"\"",
							task.note,
							"\""
						]
					})
				]
			})]
		})
	});
}
function NeedsYou({ blocked, pendingVales, onReschedule, onDecideVale, flaggedInvites, onResolveFlag }) {
	const [replyId, setReplyId] = (0, import_react.useState)(null);
	const [drafts, setDrafts] = (0, import_react.useState)({});
	const flagsCount = flaggedInvites.reduce((s, i) => s + i.flags.length, 0);
	const total = blocked.length + pendingVales.length + flagsCount;
	if (total === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		className: "rounded-3xl border border-dashed border-border bg-card/40 p-4 sm:p-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-4 w-4" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-sm font-semibold text-foreground",
				children: "Needs you"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground",
				children: "All clear — no one is stuck."
			})] })]
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-terracotta/40 bg-terracotta-soft/40 p-4 shadow-soft sm:p-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-3 flex items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-4 w-4" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "text-sm font-semibold text-foreground",
				children: ["Needs you · ", total]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground",
				children: "Blocked tasks, vale requests, and flagged details."
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-2.5",
			children: [
				blocked.map((t) => {
					const helper = helperById(t.helperId);
					const isReplying = replyId === t.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-center gap-2",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: helper.initials }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "text-xs font-semibold text-foreground",
													children: helper.short
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "text-[11px] text-muted-foreground",
													children: ["· ", t.time]
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
											className: "mt-1.5 text-sm font-semibold text-foreground",
											children: t.title
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep",
											children: [
												"\"",
												t.blockReason,
												"\""
											]
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[t.station]}`,
									children: t.station
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex flex-wrap items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => setReplyId(isReplying ? null : t.id),
									className: "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageCircle, { className: "h-3.5 w-3.5" }), " Reply"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => {
										onReschedule(t.id);
										setReplyId(null);
									},
									className: "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "h-3.5 w-3.5" }), " Reschedule"]
								})]
							}),
							isReplying && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 rounded-xl border border-border bg-background p-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
									value: drafts[t.id] ?? "",
									onChange: (e) => setDrafts((d) => ({
										...d,
										[t.id]: e.target.value
									})),
									rows: 2,
									placeholder: `Message ${helper.short}…`,
									className: "w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 flex items-center justify-between px-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[10px] text-muted-foreground",
										children: "Mock only · not sent"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => setReplyId(null),
										className: "rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground",
										children: "Close"
									})]
								})]
							})
						]
					}, t.id);
				}),
				pendingVales.map((v) => {
					const helper = helperById(v.helperId);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex items-start justify-between gap-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: helper.initials }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-xs font-semibold text-foreground",
												children: helper.short
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Coins, { className: "h-3 w-3" }), " Vale request"]
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h4", {
										className: "mt-1.5 font-display text-lg text-foreground",
										children: ["₱", v.amount.toLocaleString()]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep",
										children: [
											"\"",
											v.reason,
											"\""
										]
									})
								]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => onDecideVale(v.id, "approved"),
								className: "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3.5 w-3.5" }), " Approve"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => onDecideVale(v.id, "declined"),
								className: "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-3.5 w-3.5" }), " Decline"]
							})]
						})]
					}, v.id);
				}),
				flaggedInvites.map((inv) => inv.flags.map((f) => {
					const displayName = inv.claimedName || inv.name;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex items-start justify-between gap-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "??" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-xs font-semibold text-foreground",
												children: displayName
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "inline-flex items-center gap-1 rounded-full bg-terracotta/20 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-3 w-3" }), " Flagged a detail"]
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
										className: "mt-1.5 text-sm font-semibold text-foreground",
										children: f.field
									}),
									f.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep",
										children: [
											"\"",
											f.note,
											"\""
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 text-[11px] text-muted-foreground",
										children: ["Raised during claim · code ", inv.code]
									})
								]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => onResolveFlag(inv.id, f.id),
								className: "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3.5 w-3.5" }), " Mark resolved"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[11px] text-muted-foreground",
								children: "Update the household record in People → invite."
							})]
						})]
					}, f.id);
				}))
			]
		})]
	});
}
function TaskCard({ task }) {
	const helper = helperById(task.helperId);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "group rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft transition hover:shadow-lift",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
					className: "text-sm font-semibold leading-snug text-foreground",
					children: task.title
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[task.station]}`,
					children: task.station
				})]
			}),
			(recurrenceLabel(task.recurrence) || task.appointmentTitle) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-1.5 flex flex-wrap gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecurrenceBadge, { recurrence: task.recurrence }), task.appointmentTitle && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { className: "h-2.5 w-2.5" }),
						" ",
						task.appointmentTitle
					]
				})]
			}),
			task.scheduledDate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
				children: formatAppointmentDate(task.scheduledDate)
			}),
			task.note && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1.5 line-clamp-2 text-xs text-muted-foreground",
				children: task.note
			}),
			isPalengke(task) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PalengkeChip, {})
			}),
			task.photo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 overflow-hidden rounded-xl",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: task.photo,
					alt: "",
					className: "h-28 w-full object-cover",
					loading: "lazy"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: helper.initials }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs font-medium text-foreground",
						children: helper.short
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs font-medium text-muted-foreground",
					children: task.time
				})]
			}),
			task.createdBy && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
				children: ["from ", task.createdBy]
			})
		]
	});
}
function Avatar({ initials }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary",
		children: initials
	});
}
function RescheduleNotice({ notice, newTime }) {
	if (!notice) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 flex items-start gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] leading-snug text-pine-deep",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mt-0.5",
			children: "⏱"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-semibold",
				children: "Rescheduled:"
			}),
			" ",
			notice.oldTime,
			" → ",
			newTime,
			" because ",
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "italic",
				children: notice.appointmentTitle
			}),
			" changed."
		] })]
	});
}
function NewTaskModal({ onClose, onAdd, isRemote = false }) {
	const [title, setTitle] = (0, import_react.useState)("");
	const [helperId, setHelperId] = (0, import_react.useState)(HELPERS[0].id);
	const [time, setTime] = (0, import_react.useState)("08:00");
	const [note, setNote] = (0, import_react.useState)("");
	const [repeatKind, setRepeatKind] = (0, import_react.useState)("none");
	const [days, setDays] = (0, import_react.useState)([]);
	const [sendLive, setSendLive] = (0, import_react.useState)(false);
	const toggleDay = (d) => {
		setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
	};
	const submit = () => {
		if (!title.trim()) return;
		const [h, m] = time.split(":").map(Number);
		const suffix = h >= 12 ? "PM" : "AM";
		const hr = (h + 11) % 12 + 1;
		const recurrence = repeatKind === "daily" ? "daily" : repeatKind === "weekdays" && days.length > 0 ? WEEKDAYS.filter((d) => days.includes(d)) : "none";
		onAdd({
			title: title.trim(),
			helperId,
			time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
			note: note.trim() || void 0,
			recurrence
		}, { sendLive: isRemote ? sendLive : void 0 });
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: isRemote ? "Suggest a task" : "New task"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				isRemote && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-xs text-muted-foreground",
					children: "From afar you can propose things — an on-site manager approves them onto the board."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Title",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: title,
								onChange: (e) => setTitle(e.target.value),
								placeholder: "e.g. Fold laundry",
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Assign to",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: helperId,
									onChange: (e) => setHelperId(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary",
									children: HELPERS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
										value: h.id,
										children: [
											h.name,
											" · ",
											h.station
										]
									}, h.id))
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Time",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "time",
									value: time,
									onChange: (e) => setTime(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
								})
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "House-standard note (optional)",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								value: note,
								onChange: (e) => setNote(e.target.value),
								rows: 2,
								placeholder: "e.g. Warm water only, fold in thirds.",
								className: "w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Field, {
							label: "Repeat",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "inline-flex w-full rounded-xl border border-input bg-background p-1",
								children: [
									{
										key: "none",
										label: "None"
									},
									{
										key: "daily",
										label: "Every day"
									},
									{
										key: "weekdays",
										label: "Specific days"
									}
								].map((opt) => {
									return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setRepeatKind(opt.key),
										className: `flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${repeatKind === opt.key ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`,
										children: opt.label
									}, opt.key);
								})
							}), repeatKind === "weekdays" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-2 flex flex-wrap gap-1.5",
								children: WEEKDAYS.map((d) => {
									return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => toggleDay(d),
										className: `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${days.includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`,
										children: d
									}, d);
								})
							})]
						})
					]
				}),
				isRemote && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mt-4 flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border/70 bg-background/60 p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: sendLive,
						onChange: (e) => setSendLive(e.target.checked),
						className: "mt-0.5 h-4 w-4 accent-primary"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-xs text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-semibold text-foreground",
							children: "Send live · urgent"
						}), " — skip approval and drop it straight on the board (still attributed to you)."]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: submit,
						className: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
						children: isRemote ? sendLive ? "Send live" : "Send to on-site manager" : "Add to board"
					})]
				})
			]
		})
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
			children: label
		}), children]
	});
}
function MyWeekCard({ weekSchedule, simDate }) {
	const todayWd = weekdayOf(simDate);
	const today = weekSchedule[todayWd];
	const todayIdx = WEEKDAYS.indexOf(todayWd);
	let nextRest = null;
	for (let i = 0; i < 7; i++) {
		const d = WEEKDAYS[(todayIdx + i) % 7];
		if (weekSchedule[d].rest) {
			nextRest = {
				day: d,
				inDays: i
			};
			break;
		}
	}
	const restLabel = nextRest ? nextRest.inDays === 0 ? "Today — enjoy your rest" : nextRest.inDays === 1 ? `${WEEKDAY_LONG[nextRest.day]} — tomorrow` : `${WEEKDAY_LONG[nextRest.day]} — ${nextRest.inDays} days away` : "No rest day set";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-lg text-foreground",
					children: "My Week"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Calendar, { className: "h-3 w-3" }),
						" ",
						WEEKDAY_LONG[todayWd]
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 rounded-2xl bg-secondary/60 p-3.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[10px] font-semibold uppercase tracking-wider text-pine-deep/80",
					children: "Today"
				}), today.rest ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-1 font-display text-lg text-pine-deep",
					children: "Rest day — salamat, Ate."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-1 font-display text-lg text-pine-deep",
					children: today.segments.map((s) => `${fmtHM12(s.start)} – ${fmtHM12(s.end)}`).join(" & ")
				}), today.breakStart && today.breakEnd && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1 inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-pine-deep",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: "h-3 w-3" }),
						" Break ",
						fmtHM12(today.breakStart),
						"–",
						fmtHM12(today.breakEnd)
					]
				})] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-start gap-2 rounded-2xl border border-terracotta/30 bg-terracotta-soft/40 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.55_0.13_60)]" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-sm text-pine-deep",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[10px] font-semibold uppercase tracking-wider text-pine-deep/70",
						children: "Rest day"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "font-semibold",
						children: restLabel
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
					children: "Week ahead"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-7 gap-1.5",
					children: WEEKDAYS.map((d, i) => {
						const day = weekSchedule[d];
						const isToday = d === todayWd;
						const rest = day.rest;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: `flex flex-col items-center rounded-xl border px-1 py-1.5 text-[10px] transition ${isToday ? "border-primary bg-primary text-primary-foreground" : rest ? "border-terracotta/40 bg-terracotta-soft/40 text-[oklch(0.38_0.09_60)]" : "border-border/60 bg-background/40 text-foreground"}`,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-semibold uppercase tracking-wider",
									children: d
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mt-0.5 leading-tight",
									children: rest ? "Rest" : day.segments[0] ? fmtHM12(day.segments[0].start).replace(" ", "") : "—"
								}),
								!rest && day.segments.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `text-[9px] ${isToday ? "text-primary-foreground/80" : "text-muted-foreground"}`,
									children: "+split"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									"aria-hidden": true,
									className: "sr-only",
									children: i
								})
							]
						}, d);
					})
				})]
			})
		]
	});
}
function HelperView({ tasks, helper, vales, boardClosed, onUpdate, onBlock, onRequestVale, utosList, onAckUtos, utosWipedToday, rosaStatus, onSetRosaAvailable, onSetRosaOff, ledger, ledgerDefault, onUpdateLedgerEntry, pantry, onAdjustPantry, onSetPantryQty, onAddPantryItem, onRemovePantryItem, weekSchedule, simDate, onAddTask, invites, onFindInvite, onClaimInvite, onFlagInvite }) {
	const [claimOpen, setClaimOpen] = (0, import_react.useState)(false);
	const [claimedInfo, setClaimedInfo] = (0, import_react.useState)(null);
	const myClaimed = invites.find((i) => i.status === "active");
	const [tab, setTab] = (0, import_react.useState)("today");
	const [noteToTask, setNoteToTask] = (0, import_react.useState)(null);
	const [blockingId, setBlockingId] = (0, import_react.useState)(null);
	const mine = tasks.filter((t) => t.helperId === helper.id && !t.queued);
	const doneCount = mine.filter((t) => t.status === "done").length;
	const activeCount = mine.filter((t) => t.status !== "done" && t.status !== "blocked").length;
	const allDone = boardClosed || activeCount === 0 && doneCount > 0;
	const next = mine.find((t) => t.status !== "done" && t.status !== "blocked");
	const upcoming = mine.filter((t) => t.status !== "done" && t.status !== "blocked" && t.id !== next?.id);
	const blocked = mine.filter((t) => t.status === "blocked");
	const completed = mine.filter((t) => t.status === "done");
	const blockingTask = mine.find((t) => t.id === blockingId) ?? null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5 pb-24",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-3xl bg-primary p-6 text-primary-foreground shadow-lift sm:p-8",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/70",
						children: "Ate Rosa's Station"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-2 font-display text-[26px] leading-tight sm:text-3xl",
						children: "Magandang umaga, Ate Rosa."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 grid grid-cols-2 gap-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl bg-primary-foreground/10 px-3 py-2.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70",
								children: "Today's shift"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-0.5 font-semibold",
								children: helper.shift
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl bg-primary-foreground/10 px-3 py-2.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70",
								children: "Rest day"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-0.5 font-semibold",
								children: helper.restDay
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RosaAvailControl, {
						status: rosaStatus,
						onAvailable: onSetRosaAvailable,
						onOff: onSetRosaOff
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3 rounded-2xl border border-dashed border-terracotta/50 bg-terracotta-soft/25 px-4 py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs font-semibold text-foreground",
						children: myClaimed ? `Account claimed — welcome, ${myClaimed.claimedName}` : "New here? Claim your account."
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 text-[11px] leading-snug text-muted-foreground",
						children: myClaimed ? "Your record stays with you, even if you change households." : "Enter the invite code your employer gave you. Your account will be yours."
					})]
				}), !myClaimed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => setClaimOpen(true),
					className: "shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90",
					children: "Enter code"
				})]
			}),
			tab === "today" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MyWeekCard, {
					weekSchedule,
					simDate
				}),
				(utosList.length > 0 || utosWipedToday) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QuickUtosFeed, {
					utosList,
					onAck: onAckUtos,
					available: !boardClosed,
					wiped: utosWipedToday
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MyNotes, {
					helperId: helper.id,
					onMakeTask: (txt) => setNoteToTask(txt)
				}),
				allDone ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EndOfDay, { doneCount }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						next && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NextTaskCard, {
							task: next,
							onUpdate,
							onAskBlock: () => setBlockingId(next.id)
						}),
						upcoming.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: "Later today"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-2",
							children: upcoming.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-3",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-semibold text-pine-deep",
											children: t.time.split(" ")[0]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "min-w-0 flex-1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "truncate text-sm font-semibold text-foreground",
												children: t.title
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "mt-0.5 flex flex-wrap items-center gap-2",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "truncate text-xs text-muted-foreground",
														children: t.time
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecurrenceBadge, { recurrence: t.recurrence }),
													t.appointmentTitle && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
														className: "inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]",
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { className: "h-2.5 w-2.5" }),
															" ",
															t.appointmentTitle
														]
													}),
													isPalengke(t) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PalengkeChip, { compact: true })
												]
											})]
										}),
										t.status === "in_progress" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground",
											children: "In progress"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: () => setBlockingId(t.id),
											className: "inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:border-accent/60 hover:text-accent-foreground",
											"aria-label": "Can't now or need info",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleQuestionMark, { className: "h-3 w-3" }), " Can't now"]
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RescheduleNotice, {
									notice: t.rescheduleNotice,
									newTime: t.time
								})]
							}, t.id))
						})] }),
						blocked.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
							className: "mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: ["Waiting for Ma'am · ", blocked.length]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-2",
							children: blocked.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-2xl border border-terracotta/40 bg-terracotta-soft/40 p-3.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "truncate text-sm font-semibold text-foreground",
											children: t.title
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[11px] text-muted-foreground",
											children: t.time
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-3 w-3" }), " Blocked"]
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1.5 rounded-xl bg-card/70 px-2.5 py-1.5 text-xs italic text-pine-deep",
									children: [
										"\"",
										t.blockReason,
										"\""
									]
								})]
							}, t.id))
						})] }),
						completed.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
							className: "mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: ["Done · ", completed.length]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid grid-cols-2 gap-2 sm:grid-cols-3",
							children: completed.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-2xl border border-border/70 bg-card p-2 shadow-soft",
								children: [
									t.photo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
										src: t.photo,
										alt: "",
										className: "mb-2 h-16 w-full rounded-lg object-cover"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "line-clamp-1 px-1 text-xs font-semibold text-foreground",
										children: t.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "px-1 text-[10px] text-muted-foreground",
										children: t.time
									})
								]
							}, t.id))
						})] })
					]
				})
			] }) : tab === "pantry" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PantrySection, {
					items: pantry,
					onAdjust: onAdjustPantry,
					onSetQty: onSetPantryQty,
					onAdd: onAddPantryItem,
					onRemove: onRemovePantryItem
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GrocerySection, {})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PayRecord, {
				vales,
				onRequestVale,
				ledger,
				ledgerDefault,
				onUpdateLedgerEntry,
				helper,
				myInvite: myClaimed ?? null
			}),
			blockingTask && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BlockReasonModal, {
				task: blockingTask,
				onClose: () => setBlockingId(null),
				onSubmit: (reason) => {
					onBlock(blockingTask.id, reason);
					setBlockingId(null);
				}
			}),
			noteToTask !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoteToTaskModal, {
				initialTitle: noteToTask,
				helperId: helper.id,
				onClose: () => setNoteToTask(null),
				onSubmit: (t) => {
					onAddTask(t);
					setNoteToTask(null);
				}
			}),
			claimOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClaimAccountFlow, {
				onClose: () => setClaimOpen(false),
				onFindInvite,
				onClaim: (id, name) => {
					onClaimInvite(id, name);
				},
				onFlag: onFlagInvite,
				onFinished: (inv) => {
					setClaimOpen(false);
					setClaimedInfo(inv);
					setTab("today");
				}
			}),
			claimedInfo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClaimedWelcome, {
				invite: claimedInfo,
				onClose: () => setClaimedInfo(null)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BottomNav, {
				active: tab,
				onChange: (k) => setTab(k),
				items: [
					{
						key: "today",
						label: "Today",
						Icon: ClipboardList
					},
					{
						key: "pantry",
						label: "Pantry",
						Icon: Package
					},
					{
						key: "pay",
						label: "My Pay",
						Icon: Wallet
					}
				]
			})
		]
	});
}
function BlockReasonModal({ task, onClose, onSubmit }) {
	const [reason, setReason] = (0, import_react.useState)("");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: "Can't do this now?"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "Tell Ma'am briefly — she'll see it right away."
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 rounded-2xl bg-secondary/60 px-3 py-2 text-xs text-pine-deep",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-semibold",
							children: task.title
						}),
						" · ",
						task.time
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						value: reason,
						onChange: (e) => setReason(e.target.value),
						rows: 3,
						placeholder: "e.g. No formula left",
						className: "w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 flex flex-wrap gap-1.5",
						children: [
							"No formula left",
							"Need more cash",
							"Waiting on delivery",
							"Sofia is not feeling well"
						].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => setReason(s),
							className: "rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground",
							children: s
						}, s))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => reason.trim() && onSubmit(reason.trim()),
						disabled: !reason.trim(),
						className: "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-soft hover:opacity-95 disabled:opacity-50",
						children: "Send to Ma'am"
					})]
				})
			]
		})
	});
}
function NextTaskCard({ task, onUpdate, onAskBlock }) {
	const [addingPhoto, setAddingPhoto] = (0, import_react.useState)(false);
	const start = () => onUpdate(task.id, "in_progress");
	const done = () => {
		setAddingPhoto(true);
		setTimeout(() => {
			const photo = PHOTO_POOL[Math.floor(Math.random() * PHOTO_POOL.length)];
			onUpdate(task.id, "done", photo);
			setAddingPhoto(false);
		}, 900);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-3xl border border-border/70 bg-card p-6 shadow-lift",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground",
					children: task.status === "in_progress" ? "In progress" : "Up next"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep",
					children: task.time
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-3 font-display text-2xl leading-tight text-foreground",
				children: task.title
			}),
			recurrenceLabel(task.recurrence) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecurrenceBadge, { recurrence: task.recurrence })
			}),
			task.appointmentTitle && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { className: "h-2.5 w-2.5" }),
					" ",
					task.appointmentTitle
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RescheduleNotice, {
				notice: task.rescheduleNotice,
				newTime: task.time
			}),
			task.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 rounded-2xl bg-terracotta-soft/40 p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[10px] font-semibold uppercase tracking-wider text-pine-deep/80",
					children: "House standard"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm leading-relaxed text-pine-deep",
					children: task.note
				})]
			}),
			isPalengke(task) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PalengkeInlineList, {})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 flex flex-col gap-2 sm:flex-row",
				children: [task.status === "todo" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: start,
					className: "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "h-4 w-4" }), " Start"]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: done,
					disabled: addingPhoto,
					className: "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground shadow-soft transition hover:opacity-95 disabled:opacity-70",
					children: addingPhoto ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "h-4 w-4 animate-pulse" }), " Attaching photo…"] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-4 w-4" }), " Done · add photo"] })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: onAskBlock,
					className: "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-3.5 text-sm font-semibold text-muted-foreground shadow-soft hover:border-accent/60 hover:text-accent-foreground sm:flex-none",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleQuestionMark, { className: "h-4 w-4" }), " Can't now / Need info"]
				})]
			})
		]
	});
}
function EndOfDay({ doneCount }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-8 text-center shadow-lift",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-6 w-6" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
				className: "mt-4 font-display text-2xl text-foreground",
				children: [
					"Great work today — ",
					doneCount,
					" of ",
					doneCount,
					" done"
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted-foreground",
				children: "Salamat po, Ate Rosa. Rest well."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-pine-deep",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: "h-4 w-4" }), " The board is closed for the night"]
			})
		]
	});
}
function MyTerms({ helper, invite }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const employment = invite?.employment ? invite.employment === "live-in" ? "Live-in" : "Live-out" : "—";
	const role = invite?.station ?? helper.station;
	const shift = invite?.shift ?? helper.shift;
	const restDay = invite?.restDay ?? helper.restDay;
	const wage = invite?.wagePHP ? `₱${invite.wagePHP.toLocaleString()} / month` : "Not on file yet";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			onClick: () => setOpen((v) => !v),
			className: "flex w-full items-start justify-between gap-3 text-left",
			"aria-expanded": open,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
						children: "On file with this household"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 font-display text-lg text-foreground",
						children: "Your terms — as the employer entered them"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-0.5 text-xs text-muted-foreground",
						children: [
							"Read-only. Tap to ",
							open ? "hide" : "review",
							" any time."
						]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "mt-1 shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground",
				children: open ? "Hide" : "Review"
			})]
		}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 space-y-2 rounded-2xl bg-background/60 p-4 text-sm",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
					label: "Pangalan",
					value: invite?.name ?? helper.name
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
					label: "Role / station",
					value: role
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
					label: "Employment",
					value: employment
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
					label: "Shift",
					value: shift
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
					label: "Rest day",
					value: restDay
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
					label: "Monthly wage",
					value: wage
				}),
				invite?.phone && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
					label: "Contact on file",
					value: invite.phone
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "pt-2 text-[11px] leading-relaxed text-muted-foreground",
					children: "May mali? Sabihin mo sa manager mo — huwag muna pumirma kung hindi tugma sa usapan."
				})
			]
		})]
	});
}
function PayRecord({ vales, onRequestVale, ledger, ledgerDefault, onUpdateLedgerEntry, helper, myInvite }) {
	const [asking, setAsking] = (0, import_react.useState)(false);
	const approvedTotal = vales.filter((v) => v.status === "approved").reduce((s, v) => s + v.amount, 0);
	const pending = vales.filter((v) => v.status === "pending");
	const declined = vales.filter((v) => v.status === "declined");
	const totalVale = 1500 + approvedTotal;
	const limit = 3e3;
	const pct = Math.min(100, Math.round(totalVale / limit * 100));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "rounded-3xl border border-primary/25 bg-primary/5 p-4 shadow-soft",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start gap-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-sm font-semibold text-foreground",
							children: "This record is yours."
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-xs leading-relaxed text-muted-foreground",
							children: "It stays with you if you leave this household — your hours, your rest owed, your history."
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MyTerms, {
				helper,
				invite: myInvite
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AfterHoursLedger, {
				entries: ledger,
				ledgerDefault,
				onUpdateEntry: onUpdateLedgerEntry,
				audience: "helper"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-3xl border border-border/70 bg-card p-6 shadow-soft",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
						children: "Current cutoff · Jun 1 – Jun 15"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-2 flex items-baseline justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "font-display text-3xl text-foreground",
							children: "₱9,240"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs font-semibold text-primary",
							children: "Expected payout"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 space-y-2 text-sm",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "Base salary (half-month)",
								value: "₱8,000"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "Overtime · 4 hrs",
								value: "₱480"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "SSS / PhilHealth share",
								value: "− ₱240",
								muted: true
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "Meal + transport allowance",
								value: "₱1,000"
							})
						]
					})
				]
			}),
			approvedTotal > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "rounded-3xl border border-primary/30 bg-primary/5 p-5 shadow-soft",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-primary",
							children: "Vale balance"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-1 font-display text-3xl text-primary",
							children: ["₱", approvedTotal.toLocaleString()]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-0.5 text-xs text-muted-foreground",
							children: "Approved by Ma'am · added this cutoff"
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-5 w-5" })
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-3xl border border-border/70 bg-card p-6 shadow-soft",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: "Vale (cash advance)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-1 font-display text-2xl text-foreground",
							children: [
								"₱",
								totalVale.toLocaleString(),
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-sm font-normal text-muted-foreground",
									children: [
										"/ ₱",
										limit.toLocaleString(),
										" limit"
									]
								})
							]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-11 w-11 place-items-center rounded-2xl bg-accent/20 text-accent-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "h-5 w-5" })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-3 h-2 overflow-hidden rounded-full bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-full rounded-full bg-accent",
							style: { width: `${pct}%` }
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xs text-muted-foreground",
						children: "Deducted equally over the next 3 cutoffs. You can view every entry on your record."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setAsking(true),
						className: "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep sm:w-auto",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Coins, { className: "h-4 w-4" }), " Request cash advance (vale)"]
					}),
					(pending.length > 0 || declined.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 space-y-1.5",
						children: [pending.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-semibold text-foreground",
								children: ["₱", v.amount.toLocaleString()]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "ml-2 text-muted-foreground",
								children: [
									"\"",
									v.reason,
									"\""
								]
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-pine-deep",
								children: "Waiting"
							})]
						}, v.id)), declined.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-semibold text-foreground",
								children: ["₱", v.amount.toLocaleString()]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "ml-2 text-muted-foreground",
								children: [
									"\"",
									v.reason,
									"\""
								]
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground",
								children: "Declined"
							})]
						}, v.id))]
					})
				]
			}),
			asking && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ValeRequestModal, {
				onClose: () => setAsking(false),
				onSubmit: (amt, r) => {
					onRequestVale(amt, r);
					setAsking(false);
				}
			})
		]
	});
}
function ValeRequestModal({ onClose, onSubmit }) {
	const [amount, setAmount] = (0, import_react.useState)("");
	const [reason, setReason] = (0, import_react.useState)("");
	const amt = Number(amount);
	const valid = amt > 0 && reason.trim().length > 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: "Request cash advance"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "Ma'am will see it in her \"Needs you\" list."
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Amount (₱)",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center rounded-xl border border-input bg-background px-3 py-2.5 focus-within:border-primary",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mr-1 text-sm font-semibold text-muted-foreground",
								children: "₱"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								inputMode: "numeric",
								value: amount,
								onChange: (e) => setAmount(e.target.value.replace(/[^0-9]/g, "")),
								placeholder: "1000",
								className: "w-full bg-transparent text-sm outline-none"
							})]
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Reason",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							value: reason,
							onChange: (e) => setReason(e.target.value),
							rows: 3,
							placeholder: "e.g. Tuition balance for my daughter",
							className: "w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => valid && onSubmit(amt, reason.trim()),
						disabled: !valid,
						className: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50",
						children: "Send request"
					})]
				})
			]
		})
	});
}
function Row({ label, value, muted }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center justify-between",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: `font-semibold ${muted ? "text-muted-foreground" : "text-foreground"}`,
			children: value
		})]
	});
}
function RoutinesView({ routines, onAdd, onRemove }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const byHelper = HELPERS.map((h) => ({
		helper: h,
		items: routines.filter((r) => r.helperId === h.id)
	}));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-7",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: "Routines"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-2 font-display text-2xl leading-tight text-foreground sm:text-[28px]",
							children: "Set the rhythm once."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 max-w-lg text-sm text-muted-foreground",
							children: "Recurring tasks live here. On matching days they'll appear on the Pass automatically — no need to re-add them each morning."
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setOpen(true),
						className: "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" }), " New routine"]
					})]
				})
			}),
			routines.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-pine-deep",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Repeat, { className: "h-5 w-5" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-sm text-muted-foreground",
					children: "No routines yet. Add one to build the daily rhythm."
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-5",
				children: byHelper.map(({ helper, items }) => {
					if (items.length === 0) return null;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-3xl border border-border/70 bg-card/60 p-4 sm:p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-3 flex items-center justify-between px-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: helper.initials }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-sm font-semibold text-foreground",
									children: helper.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-[11px] text-muted-foreground",
									children: [
										helper.station,
										" · ",
										helper.shift
									]
								})] })]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: `rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[helper.station]}`,
								children: [
									items.length,
									" routine",
									items.length === 1 ? "" : "s"
								]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-2",
							children: items.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoutineRow, {
								routine: r,
								onRemove: () => onRemove(r.id)
							}, r.id))
						})]
					}, helper.id);
				})
			}),
			open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewRoutineModal, {
				onClose: () => setOpen(false),
				onAdd: (r) => {
					onAdd(r);
					setOpen(false);
				}
			})
		]
	});
}
function RoutineRow({ routine, onRemove }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
							className: "text-sm font-semibold text-foreground",
							children: routine.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecurrenceBadge, { recurrence: routine.recurrence })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 text-[11px] text-muted-foreground",
						children: routine.time
					}),
					routine.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-2 rounded-xl bg-terracotta-soft/40 px-2.5 py-1.5 text-xs leading-relaxed text-pine-deep",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mr-1 text-[10px] font-semibold uppercase tracking-wider text-pine-deep/70",
							children: "House standard ·"
						}), routine.note]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: onRemove,
				"aria-label": "Remove routine",
				className: "rounded-full border border-border p-1.5 text-muted-foreground transition hover:border-accent/60 hover:text-accent-foreground",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-3.5 w-3.5" })
			})]
		})
	});
}
function NewRoutineModal({ onClose, onAdd }) {
	const [title, setTitle] = (0, import_react.useState)("");
	const [helperId, setHelperId] = (0, import_react.useState)(HELPERS[0].id);
	const [time, setTime] = (0, import_react.useState)("08:00");
	const [note, setNote] = (0, import_react.useState)("");
	const [repeatKind, setRepeatKind] = (0, import_react.useState)("daily");
	const [days, setDays] = (0, import_react.useState)([]);
	const toggleDay = (d) => {
		setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
	};
	const canSubmit = title.trim().length > 0 && (repeatKind === "daily" || days.length > 0);
	const submit = () => {
		if (!canSubmit) return;
		const [h, m] = time.split(":").map(Number);
		const suffix = h >= 12 ? "PM" : "AM";
		const hr = (h + 11) % 12 + 1;
		const recurrence = repeatKind === "daily" ? "daily" : WEEKDAYS.filter((d) => days.includes(d));
		onAdd({
			title: title.trim(),
			helperId,
			time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
			note: note.trim() || void 0,
			recurrence
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: "New routine"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "Set it once. It'll appear on the Pass on matching days."
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Title",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: title,
								onChange: (e) => setTitle(e.target.value),
								placeholder: "e.g. Water the plants",
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Assign to",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: helperId,
									onChange: (e) => setHelperId(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary",
									children: HELPERS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
										value: h.id,
										children: [
											h.name,
											" · ",
											h.station
										]
									}, h.id))
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Time",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "time",
									value: time,
									onChange: (e) => setTime(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
								})
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "House-standard note (optional)",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								value: note,
								onChange: (e) => setNote(e.target.value),
								rows: 2,
								placeholder: "e.g. Deep-water the fiddle leaf; light mist for the ferns.",
								className: "w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Field, {
							label: "Repeat",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "inline-flex w-full rounded-xl border border-input bg-background p-1",
								children: [{
									key: "daily",
									label: "Every day"
								}, {
									key: "weekdays",
									label: "Specific days"
								}].map((opt) => {
									return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setRepeatKind(opt.key),
										className: `flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${repeatKind === opt.key ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`,
										children: opt.label
									}, opt.key);
								})
							}), repeatKind === "weekdays" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-2 flex flex-wrap gap-1.5",
								children: WEEKDAYS.map((d) => {
									return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => toggleDay(d),
										className: `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${days.includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`,
										children: d
									}, d);
								})
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: submit,
						disabled: !canSubmit,
						className: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50",
						children: "Save routine"
					})]
				})
			]
		})
	});
}
var QUICK_UTOS_PRESETS = [
	"+ rice",
	"water, please",
	"come to the kitchen",
	"help carry",
	"the door"
];
function QuickUtosLauncher({ onSend, helperName }) {
	const [draft, setDraft] = (0, import_react.useState)("");
	const [holding, setHolding] = (0, import_react.useState)(false);
	const sendCustom = () => {
		const v = draft.trim();
		if (!v) return;
		onSend(v);
		setDraft("");
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-3.5 w-3.5 text-accent" }), " Quick utos"]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-1 font-display text-lg text-foreground",
				children: ["Send a small ask to ", helperName]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 flex flex-wrap gap-2",
				children: QUICK_UTOS_PRESETS.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => onSend(preset),
					className: "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-soft transition hover:border-primary/40 hover:bg-secondary",
					children: preset
				}, preset))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-soft focus-within:border-primary/50",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: draft,
					onChange: (e) => setDraft(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") sendCustom();
					},
					placeholder: "Type a quick utos…",
					className: "flex-1 bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: sendCustom,
					disabled: !draft.trim(),
					className: "inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-50",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Send, { className: "h-3.5 w-3.5" }), " Send"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onMouseDown: () => setHolding(true),
					onTouchStart: () => setHolding(true),
					onMouseUp: () => {
						if (holding) {
							onSend("🎙️ Voice utos · 0:04");
							setHolding(false);
						}
					},
					onMouseLeave: () => {
						if (holding) {
							onSend("🎙️ Voice utos · 0:04");
							setHolding(false);
						}
					},
					onTouchEnd: () => {
						if (holding) {
							onSend("🎙️ Voice utos · 0:04");
							setHolding(false);
						}
					},
					className: `inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-soft transition ${holding ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-foreground hover:border-accent/50"}`,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, { className: "h-4 w-4" }),
						" ",
						holding ? "Recording… release to send" : "Hold to record a voice utos"
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-xs text-muted-foreground",
				children: "Need it tracked, timed, or done a certain way? Use New task instead."
			})
		]
	});
}
function formatUtosTime(ts) {
	const d = new Date(ts);
	let h = d.getHours();
	const m = d.getMinutes();
	const ampm = h >= 12 ? "PM" : "AM";
	h = h % 12 || 12;
	return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function QuickUtosFeed({ utosList, onAck, available, wiped }) {
	const ordered = [...utosList].sort((a, b) => b.timestamp - a.timestamp);
	const isEmptyAfterWipe = utosList.length === 0 && wiped;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
		className: "mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
		children: "Today's quick utos"
	}), isEmptyAfterWipe ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-center",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-sm font-semibold text-foreground",
			children: "Today's list was deleted 🌙"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-xs text-muted-foreground",
			children: "The individual utos are gone, not hidden. Tomorrow starts clean."
		})]
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "space-y-2",
		children: ordered.map((u) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UtosChip, {
			utos: u,
			onAck,
			available
		}, u.id))
	})] });
}
function UtosChip({ utos, onAck, available }) {
	const acked = utos.ackState === "seen" || utos.ackState === "done";
	const waiting = (!available || utos.waiting) && !acked;
	const accent = utos.emergency ? "border-l-[oklch(0.55_0.2_30)]" : waiting ? "border-l-muted-foreground/30" : acked ? "border-l-primary" : "border-l-accent";
	const bg = waiting ? "bg-muted/40" : "bg-card";
	const textTone = waiting ? "text-muted-foreground" : "text-foreground";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: `flex flex-col gap-2 rounded-2xl border border-border/70 ${bg} p-3 pl-3.5 shadow-soft border-l-4 ${accent}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: `truncate text-sm font-semibold ${textTone}`,
					children: utos.content
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
							formatUtosTime(utos.timestamp),
							" · from ",
							utos.from
						] }),
						utos.emergency && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "inline-flex items-center gap-1 rounded-full bg-[oklch(0.95_0.06_35)] px-1.5 py-0.5 text-[10px] font-semibold text-[oklch(0.42_0.15_30)]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-2.5 w-2.5" }), " Emergency"]
						}),
						utos.afterHours && !utos.emergency && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-1.5 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]",
							children: "After-hours"
						})
					]
				})]
			}), acked ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3 w-3" }),
					" ",
					utos.ackState === "done" ? "Done" : "Got it"
				]
			}) : null]
		}), waiting ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[11px] italic text-muted-foreground",
			children: "Waiting — Rosa is off. She'll see it when she's back."
		}) : !acked ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: () => onAck(utos.id, "seen"),
				className: "flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-secondary",
				children: "Got it"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: () => onAck(utos.id, "done"),
				className: "flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
				children: "Done"
			})]
		}) : null]
	});
}
function AppointmentsSection({ appointments, tasks, simDate, onAdd, onRemove, onUpdate }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const todayIso = toISODate(simDate);
	const upcoming = [...appointments].filter((a) => a.date >= todayIso).sort((a, b) => a.date === b.date ? parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time) : a.date < b.date ? -1 : 1);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-4 shadow-soft sm:p-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-3 flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarClock, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-sm font-semibold text-foreground",
						children: ["Appointments · ", upcoming.length]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs text-muted-foreground",
						children: "Fixed events. Prep tasks land on the board automatically."
					})] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: () => setOpen(true),
					className: "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft hover:bg-primary/5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3.5 w-3.5" }), " New appointment"]
				})]
			}),
			upcoming.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-2xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground",
				children: "No upcoming appointments. Add one to schedule its prep automatically."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-2.5",
				children: upcoming.map((a) => {
					const preps = tasks.filter((t) => t.appointmentId === a.id).sort((x, y) => (x.scheduledDate ?? "").localeCompare(y.scheduledDate ?? "") || parseTimeToMinutes(x.time) - parseTimeToMinutes(y.time));
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-2xl border border-border/70 bg-background/60 p-3.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarClock, { className: "h-3 w-3" }),
										" ",
										formatAppointmentDate(a.date),
										" · ",
										a.time
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
									className: "mt-1.5 font-display text-lg text-foreground",
									children: a.title
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex shrink-0 items-center gap-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => setEditing(a),
									className: "rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5",
									children: "Edit"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => onRemove(a.id),
									className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground",
									"aria-label": "Remove appointment",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
								})]
							})]
						}), preps.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-3 space-y-1.5 border-t border-border/60 pt-3",
							children: preps.map((p) => {
								const helper = helperById(p.helperId);
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
									className: "flex items-start justify-between gap-2 text-xs",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-center gap-1.5",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-semibold text-foreground",
												children: p.title
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: `shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${stationTone[p.station]}`,
												children: p.station
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-0.5 text-[11px] text-muted-foreground",
											children: [
												formatAppointmentDate(p.scheduledDate ?? a.date),
												" · ",
												p.time,
												" · ",
												helper.short
											]
										})]
									})
								}, p.id);
							})
						})]
					}, a.id);
				})
			}),
			open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewAppointmentModal, {
				onClose: () => setOpen(false),
				onAdd: (a, preps) => {
					onAdd(a, preps);
					setOpen(false);
				},
				defaultDate: toISODate(simDate)
			}),
			editing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditAppointmentModal, {
				appointment: editing,
				onClose: () => setEditing(null),
				onSave: (patch) => {
					onUpdate(editing.id, patch);
					setEditing(null);
				}
			})
		]
	});
}
function NewAppointmentModal({ onClose, onAdd, defaultDate }) {
	const [templateId, setTemplateId] = (0, import_react.useState)(null);
	const [title, setTitle] = (0, import_react.useState)("");
	const [date, setDate] = (0, import_react.useState)(defaultDate);
	const [time, setTime] = (0, import_react.useState)("06:00");
	const [preps, setPreps] = (0, import_react.useState)([{
		title: "",
		leadValue: 1,
		leadUnit: "h",
		helperId: HELPERS[0].id,
		note: ""
	}]);
	const applyTemplate = (tmpl) => {
		setTemplateId(tmpl.id);
		if (!title.trim()) setTitle(tmpl.title);
		setPreps(tmpl.preps.map((p) => {
			const useHours = p.leadMinutes % 60 === 0;
			return {
				title: p.title,
				leadValue: useHours ? p.leadMinutes / 60 : p.leadMinutes,
				leadUnit: useHours ? "h" : "m",
				helperId: p.helperId,
				note: p.note
			};
		}));
	};
	const clearTemplate = () => {
		setTemplateId(null);
		setPreps([{
			title: "",
			leadValue: 1,
			leadUnit: "h",
			helperId: HELPERS[0].id,
			note: ""
		}]);
	};
	const addRow = () => setPreps((p) => [...p, {
		title: "",
		leadValue: 1,
		leadUnit: "h",
		helperId: HELPERS[0].id,
		note: ""
	}]);
	const removeRow = (i) => setPreps((p) => p.filter((_, idx) => idx !== i));
	const updateRow = (i, patch) => setPreps((p) => p.map((r, idx) => idx === i ? {
		...r,
		...patch
	} : r));
	const submit = () => {
		if (!title.trim()) return;
		const [h, m] = time.split(":").map(Number);
		const suffix = h >= 12 ? "PM" : "AM";
		const appTime = `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${suffix}`;
		const validPreps = preps.filter((r) => r.title.trim()).map((r) => ({
			title: r.title.trim(),
			leadMinutes: r.leadUnit === "h" ? r.leadValue * 60 : r.leadValue,
			helperId: r.helperId,
			note: r.note.trim() || void 0
		}));
		onAdd({
			title: title.trim(),
			date,
			time: appTime
		}, validPreps);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: "New appointment"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-1.5 flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
									children: "Start from a template"
								}), templateId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: clearTemplate,
									className: "text-[11px] font-semibold text-muted-foreground hover:text-foreground",
									children: "Clear"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex flex-wrap gap-1.5",
								children: EVENT_TEMPLATES.map((tmpl) => {
									const active = templateId === tmpl.id;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => applyTemplate(tmpl),
										title: tmpl.blurb,
										className: `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border bg-card text-pine-deep hover:border-primary/40"}`,
										children: tmpl.title
									}, tmpl.id);
								})
							}),
							templateId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1.5 text-[11px] text-muted-foreground",
								children: "Prep loaded from template. House-standard notes come along — tweak below if needed, then set the date and time."
							})
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Title",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: title,
								onChange: (e) => setTitle(e.target.value),
								placeholder: "e.g. Sir's flight",
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Date",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									value: date,
									onChange: (e) => setDate(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Time",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "time",
									value: time,
									onChange: (e) => setTime(e.target.value),
									className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
								})
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-border/70 bg-background/60 p-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-2 flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
									children: "Prep tasks"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: addRow,
									className: "inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Add prep"]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-3",
								children: preps.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl border border-border/70 bg-card p-2.5",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-start gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												value: p.title,
												onChange: (e) => updateRow(i, { title: e.target.value }),
												placeholder: "Prep task title",
												className: "flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => removeRow(i),
												className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground",
												"aria-label": "Remove prep",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-2 grid grid-cols-2 gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												className: "block",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
													children: "How long before"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "flex gap-1.5",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
														type: "number",
														min: 0,
														value: p.leadValue,
														onChange: (e) => updateRow(i, { leadValue: Math.max(0, Number(e.target.value) || 0) }),
														className: "w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
														value: p.leadUnit,
														onChange: (e) => updateRow(i, { leadUnit: e.target.value }),
														className: "flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
															value: "m",
															children: "minutes"
														}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
															value: "h",
															children: "hours"
														})]
													})]
												})]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												className: "block",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
													children: "Assign to"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
													value: p.helperId,
													onChange: (e) => updateRow(i, { helperId: e.target.value }),
													className: "w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary",
													children: HELPERS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
														value: h.id,
														children: [
															h.short,
															" · ",
															h.station
														]
													}, h.id))
												})]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
											value: p.note,
											onChange: (e) => updateRow(i, { note: e.target.value }),
											rows: 2,
											placeholder: "House-standard note (optional)",
											className: "mt-2 w-full resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
										})
									]
								}, i))
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: submit,
						className: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
						children: "Save appointment"
					})]
				})
			]
		})
	});
}
var displayTimeTo24h = (t) => {
	const mins = parseTimeToMinutes(t);
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
function EditAppointmentModal({ appointment, onClose, onSave }) {
	const [title, setTitle] = (0, import_react.useState)(appointment.title);
	const [date, setDate] = (0, import_react.useState)(appointment.date);
	const [time, setTime] = (0, import_react.useState)(displayTimeTo24h(appointment.time));
	const submit = () => {
		if (!title.trim()) return;
		const [h, m] = time.split(":").map(Number);
		const suffix = h >= 12 ? "PM" : "AM";
		const appTime = `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${suffix}`;
		onSave({
			title: title.trim(),
			date,
			time: appTime
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: "Edit appointment"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-xs text-muted-foreground",
					children: "Prep tasks will move automatically to keep their lead offsets."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Title",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: title,
							onChange: (e) => setTitle(e.target.value),
							className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Date",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "date",
								value: date,
								onChange: (e) => setDate(e.target.value),
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Time",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "time",
								value: time,
								onChange: (e) => setTime(e.target.value),
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: submit,
						className: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
						children: "Save changes"
					})]
				})
			]
		})
	});
}
function statusMeta(s) {
	if (s === "on_shift") return {
		label: "On shift",
		dot: "bg-[oklch(0.68_0.14_150)]",
		cls: "bg-[oklch(0.95_0.05_150)] text-[oklch(0.32_0.1_150)]"
	};
	if (s === "available") return {
		label: "Available",
		dot: "bg-accent",
		cls: "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]"
	};
	return {
		label: "Off",
		dot: "bg-muted-foreground/50",
		cls: "bg-secondary text-muted-foreground"
	};
}
function formatUntil(ts) {
	const d = new Date(ts);
	let h = d.getHours();
	const m = d.getMinutes().toString().padStart(2, "0");
	const suffix = h >= 12 ? "PM" : "AM";
	h = h % 12;
	if (h === 0) h = 12;
	return `${h}:${m} ${suffix}`;
}
function useMounted() {
	const [m, setM] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setM(true), []);
	return m;
}
function RosaStatusChip({ status }) {
	const mounted = useMounted();
	const meta = statusMeta(mounted ? status.status : "off");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.cls}`,
		title: "Rosa's live status",
		suppressHydrationWarning: true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `h-1.5 w-1.5 rounded-full ${meta.dot}` }),
			"Rosa · ",
			mounted ? meta.label : "—",
			mounted && status.status === "available" && status.until && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-normal opacity-80",
				children: ["· until ", formatUntil(status.until)]
			})
		]
	});
}
function RosaAvailControl({ status, onAvailable, onOff }) {
	if (!useMounted()) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-4 rounded-2xl bg-primary-foreground/10 p-3",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70",
			children: "Availability"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-0.5 text-sm font-semibold opacity-70",
			children: "Loading…"
		})]
	});
	const onShift = status.status === "on_shift";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-4 rounded-2xl bg-primary-foreground/10 p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70",
				children: "Availability"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-0.5 text-sm font-semibold",
				children: onShift ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["On shift ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-normal opacity-80",
					children: "· automatic"
				})] }) : status.status === "available" && status.until ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["Available ", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "font-normal opacity-80",
					children: ["· until ", formatUntil(status.until)]
				})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["Off ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-normal opacity-80",
					children: "· resting"
				})] })
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: `inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2 py-1 text-[10.5px] font-semibold`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `h-1.5 w-1.5 rounded-full ${onShift ? "bg-[oklch(0.85_0.14_150)]" : status.status === "available" ? "bg-accent" : "bg-primary-foreground/60"}` }), onShift ? "On shift" : status.status === "available" ? "Available" : "Off"]
			})]
		}), !onShift && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[11px] text-primary-foreground/70",
				children: status.quiet ? `Quiet hours (${QUIET_END_HOUR} AM – ${QUIET_START_HOUR - 12} PM overnight). Rest protected — only an emergency can reach you.` : status.restDay ? "Rest day. Off by default — opt in only if you'd like to be reached." : "Outside your shift. Rest is the default — opt in only if you're okay to be reached."
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2 flex flex-wrap items-center gap-2",
				children: status.status === "available" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: onOff,
					className: "inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary-foreground/25",
					children: "Switch to Off"
				}) : status.quiet ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold text-primary-foreground/70",
					children: [
						"Available disabled until ",
						QUIET_END_HOUR,
						":00 AM"
					]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/70",
						children: "Available for"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => onAvailable(1),
						className: "inline-flex items-center gap-1.5 rounded-full bg-primary-foreground text-primary px-3 py-1.5 text-xs font-semibold shadow-soft transition hover:bg-primary-foreground/90",
						children: "1 hour"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => onAvailable(2),
						className: "inline-flex items-center gap-1.5 rounded-full bg-primary-foreground text-primary px-3 py-1.5 text-xs font-semibold shadow-soft transition hover:bg-primary-foreground/90",
						children: "2 hours"
					})
				] })
			})]
		})]
	});
}
function formatClock(ts) {
	const d = new Date(ts);
	let h = d.getHours();
	const m = d.getMinutes().toString().padStart(2, "0");
	const s = h >= 12 ? "PM" : "AM";
	h = h % 12;
	if (h === 0) h = 12;
	return `${[
		"Sun",
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat"
	][d.getDay()]} ${h}:${m} ${s}`;
}
function SimClock({ nowTs, offsetMs, onChange }) {
	const mounted = useMounted();
	const [open, setOpen] = (0, import_react.useState)(false);
	const jumpTo = (opts) => {
		const base = /* @__PURE__ */ new Date();
		if (opts.toSunday) {
			const add = (7 - base.getDay()) % 7 || 7;
			base.setDate(base.getDate() + add);
		} else if (opts.dayOffset) base.setDate(base.getDate() + opts.dayOffset);
		base.setHours(opts.hour, opts.minute ?? 0, 0, 0);
		onChange(base.getTime() - Date.now());
		setOpen(false);
	};
	const isSim = offsetMs !== null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			onClick: () => setOpen((o) => !o),
			className: `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-soft transition sm:text-xs ${isSim ? "border-accent/50 bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]" : "border-border bg-card text-muted-foreground"}`,
			title: "Simulate the clock for demo",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarClock, { className: "h-3.5 w-3.5" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "whitespace-nowrap tabular-nums",
					suppressHydrationWarning: true,
					children: mounted ? formatClock(nowTs) : "—"
				}),
				isSim && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px]",
					children: "SIM"
				})
			]
		}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-lift",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
				children: "Simulate time"
			}), [
				{
					label: "Real time",
					desc: "Now, live",
					action: () => {
						onChange(null);
						setOpen(false);
					}
				},
				{
					label: "After shift · 7:00 PM",
					desc: "Off-shift auto-off",
					action: () => jumpTo({ hour: 19 })
				},
				{
					label: "Overnight · 11:00 PM",
					desc: "Quiet hours hard-off",
					action: () => jumpTo({ hour: 23 })
				},
				{
					label: "Rest day · Sun 10 AM",
					desc: "Off by default all day",
					action: () => jumpTo({
						toSunday: true,
						hour: 10
					})
				}
			].map((opt) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				onClick: opt.action,
				className: "flex w-full flex-col items-start rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-secondary/60",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-semibold text-foreground",
					children: opt.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[10.5px] text-muted-foreground",
					children: opt.desc
				})]
			}, opt.label))]
		})]
	});
}
function AvailabilityGate({ intent, status, helperName, canOverride = true, onCancel, onChoose }) {
	const kindLabel = intent.kind === "utos" ? "quick utos" : "task";
	const preview = intent.kind === "utos" ? intent.content : intent.task.title;
	const hard = status.quiet || status.restDay;
	const headline = status.quiet ? `It's quiet hours for ${helperName}.` : status.restDay ? `It's ${helperName}'s rest day.` : `This is outside ${helperName}'s hours.`;
	const body = status.quiet ? `Overnight is protected rest. Sending anyway will be logged as after-hours and counted toward OT / rest — an override on quiet hours. Only use Emergency if it truly can't wait.` : status.restDay ? `Her rest day is protected. It'll be logged as after-hours and counted toward OT / rest.` : `It'll be logged as after-hours and counted toward OT / rest.`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center",
		role: "dialog",
		"aria-modal": "true",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${hard ? "bg-[oklch(0.95_0.06_35)] text-[oklch(0.42_0.15_35)]" : "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]"}`,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-5 w-5" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "font-display text-lg text-foreground",
							children: headline
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted-foreground",
							children: body
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 rounded-2xl border border-border/70 bg-secondary/40 p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
						children: ["Sending ", kindLabel]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 truncate text-sm font-semibold text-foreground",
						children: preview
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => onChoose("queue"),
						className: "flex w-full items-start gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-secondary/60",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: "mt-0.5 h-4 w-4 shrink-0 text-primary" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-sm font-semibold text-foreground",
							children: intent.kind === "utos" ? "Let it wait" : "Queue for next shift"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground",
							children: intent.kind === "utos" ? "Sits as waiting. No ping. She'll see it when she's back on." : "Added quietly. Appears on her board next working period."
						})] })]
					}), canOverride ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => onChoose("override"),
						className: "flex w-full items-start gap-3 rounded-2xl border border-accent/40 bg-terracotta-soft/40 p-3 text-left transition hover:bg-terracotta-soft/60",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Send, { className: "mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.42_0.13_60)]" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-sm font-semibold text-foreground",
							children: "Send anyway · after-hours"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground",
							children: "Overrides her Off status. Flagged, logged, and counted toward OT / rest."
						})] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => onChoose("emergency"),
						className: "flex w-full items-start gap-3 rounded-2xl border border-[oklch(0.75_0.15_35)] bg-[oklch(0.96_0.05_35)] p-3 text-left transition hover:bg-[oklch(0.93_0.07_35)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.5_0.18_30)]" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-sm font-semibold text-[oklch(0.35_0.15_30)]",
							children: "Emergency"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-[oklch(0.4_0.1_30)]",
							children: "Crosses even quiet hours. Always logged as after-hours. Use only if it truly can't wait."
						})] })]
					})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-2xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground",
						children: [
							"Reaching ",
							helperName,
							" off-hours is reserved for on-site admins (Primary or Co-manager). As a remote admin you can queue this for her next shift."
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: onCancel,
					className: "mt-3 w-full rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground",
					children: "Cancel"
				})
			]
		})
	});
}
function ledgerEntryMinutes(e) {
	return Math.max(0, e.autoMinutes + e.adjustMinutes);
}
function reasonLabel(r) {
	if (r === "available") return {
		label: "Available",
		cls: "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]"
	};
	if (r === "emergency") return {
		label: "Emergency",
		cls: "bg-[oklch(0.95_0.06_35)] text-[oklch(0.42_0.15_30)]"
	};
	if (r === "rest_day") return {
		label: "Rest day",
		cls: "bg-[oklch(0.94_0.08_30)] text-[oklch(0.38_0.15_25)]"
	};
	if (r === "rest_break") return {
		label: "Rest break",
		cls: "bg-[oklch(0.93_0.05_40)] text-[oklch(0.42_0.12_35)]"
	};
	return {
		label: "After shift",
		cls: "bg-secondary text-pine-deep"
	};
}
function fmtHoursMinutes(min) {
	const h = Math.floor(min / 60);
	const m = min % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}
function AfterHoursLedger({ entries, ledgerDefault, onSetDefault, onUpdateEntry, audience, helperName }) {
	const mounted = useMounted();
	const [open, setOpen] = (0, import_react.useState)(false);
	const now = /* @__PURE__ */ new Date();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	const monthEntries = (0, import_react.useMemo)(() => entries.filter((e) => e.doneTs >= monthStart).sort((a, b) => b.doneTs - a.doneTs), [entries, monthStart]);
	const totalMin = monthEntries.reduce((s, e) => s + ledgerEntryMinutes(e), 0);
	const premiumMin = monthEntries.filter((e) => e.resolution === "premium").reduce((s, e) => s + ledgerEntryMinutes(e), 0);
	const restMin = totalMin - premiumMin;
	const heading = audience === "manager" ? `Rest owed this month${helperName ? ` · ${helperName}` : ""}` : "Rest owed this month · yours";
	if (!mounted) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
			children: heading
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1 font-display text-2xl text-foreground",
			children: "—"
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: heading
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-display text-2xl text-foreground",
								children: fmtHoursMinutes(restMin)
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-sm text-muted-foreground",
								children: ["time off in lieu", premiumMin > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
									" · ",
									fmtHoursMinutes(premiumMin),
									" at rest-day premium"
								] })]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[11px] text-muted-foreground",
							children: "Same numbers on both sides. On-shift work never lands here — every off-shift completion does."
						})
					]
				}), audience === "manager" && onSetDefault && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "shrink-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
						children: "House default"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 inline-flex rounded-full border border-border bg-background p-0.5",
						children: ["rest", "premium"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => onSetDefault(k),
							"aria-pressed": ledgerDefault === k,
							className: `rounded-full px-2.5 py-1 text-[11px] font-semibold ${ledgerDefault === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`,
							children: k === "rest" ? "Banked rest" : "Rest-day premium"
						}, k))
					})]
				})]
			}),
			monthEntries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-4 text-xs text-muted-foreground",
				children: ["No after-hours yet this month. ", audience === "helper" ? "Rest well." : "Nothing to reconcile."]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: () => setOpen((o) => !o),
				className: "mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-soft transition hover:border-primary/40",
				children: open ? "Hide entries" : `Show ${monthEntries.length} ${monthEntries.length === 1 ? "entry" : "entries"}`
			}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 space-y-2",
				children: monthEntries.map((e) => {
					const meta = reasonLabel(e.reason);
					const mins = ledgerEntryMinutes(e);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-2xl border border-border/70 bg-background p-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "truncate text-sm font-semibold text-foreground",
									children: e.title
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
											formatUtosTime(e.startTs),
											" → ",
											formatUtosTime(e.doneTs)
										] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`,
											children: meta.label
										}),
										e.kind === "utos" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-pine-deep",
											children: "utos"
										})
									]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "shrink-0 text-right",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-display text-base text-foreground tabular-nums",
									children: fmtHoursMinutes(mins)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[10px] text-muted-foreground",
									children: e.resolution === "premium" ? "rest-day premium" : "banked rest"
								})]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "inline-flex items-center gap-1.5 text-[11px] text-muted-foreground",
								children: [
									"Adjust",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										type: "number",
										value: e.adjustMinutes,
										onChange: (ev) => onUpdateEntry(e.id, { adjustMinutes: Number(ev.target.value) || 0 }),
										className: "w-16 rounded-lg border border-border bg-card px-2 py-1 text-right text-[11px] font-semibold text-foreground focus:border-primary/50 focus:outline-none"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "min" })
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "inline-flex rounded-full border border-border bg-card p-0.5",
								children: ["rest", "premium"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => onUpdateEntry(e.id, { resolution: k }),
									"aria-pressed": e.resolution === k,
									className: `rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${e.resolution === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`,
									children: k === "rest" ? "Banked rest" : "Rest-day premium"
								}, k))
							})]
						})]
					}, e.id);
				})
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-[10.5px] italic text-muted-foreground",
				children: "Being Available doesn't waive rest — voluntarily reachable still counts."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[10.5px] text-muted-foreground",
				children: "Rest-day premium rates follow local law (placeholder, configurable)."
			})
		]
	});
}
function PantrySection({ items, onAdjust, onSetQty, onAdd, onRemove }) {
	const [adding, setAdding] = (0, import_react.useState)(false);
	const lowCount = items.filter((i) => i.qty <= i.par).length;
	const grouped = PANTRY_CATEGORIES.map((cat) => ({
		cat,
		items: items.filter((i) => i.category === cat).sort((a, b) => (a.qty <= a.par ? -1 : 1) - (b.qty <= b.par ? -1 : 1))
	})).filter((g) => g.items.length > 0);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Package, { className: "h-4 w-4" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl text-foreground",
							children: "Pantry"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "Shared with the Cook. Keep supplies at or above par."
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex shrink-0 flex-col items-end gap-2",
					children: [lowCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-1 rounded-full bg-terracotta-soft px-2.5 py-1 text-[11px] font-semibold text-[oklch(0.42_0.12_50)]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-3 w-3" }),
							" ",
							lowCount,
							" running low"
						]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3 w-3" }), " All stocked"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setAdding(true),
						className: "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3.5 w-3.5" }), " Add item"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 space-y-4",
				children: grouped.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
					children: g.cat
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "space-y-2",
					children: g.items.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PantryRow, {
						item: i,
						onAdjust,
						onSetQty,
						onRemove
					}, i.id))
				})] }, g.cat))
			}),
			adding && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddPantryItemModal, {
				onClose: () => setAdding(false),
				onAdd: (item) => {
					onAdd(item);
					setAdding(false);
				}
			})
		]
	});
}
function PantryRow({ item, onAdjust, onSetQty, onRemove }) {
	const low = item.qty <= item.par;
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(String(item.qty));
	(0, import_react.useEffect)(() => {
		setDraft(String(item.qty));
	}, [item.qty]);
	const commit = () => {
		const n = parseFloat(draft);
		if (!isNaN(n)) onSetQty(item.id, n);
		setEditing(false);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `flex items-center gap-3 rounded-2xl border p-2.5 sm:p-3 ${low ? "border-terracotta/40 bg-terracotta-soft/30" : "border-border/70 bg-background/60"}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "truncate text-sm font-semibold text-foreground",
					children: item.name
				}), low && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "inline-flex shrink-0 items-center rounded-full bg-terracotta px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white",
					children: "Low"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-0.5 text-[11px] text-muted-foreground",
				children: [
					"par ",
					item.par,
					" ",
					item.unit
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex shrink-0 items-center gap-1.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => onAdjust(item.id, -1),
					className: "grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:border-primary/40 hover:text-foreground",
					"aria-label": "Decrease",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, { className: "h-3.5 w-3.5" })
				}),
				editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					autoFocus: true,
					value: draft,
					onChange: (e) => setDraft(e.target.value),
					onBlur: commit,
					onKeyDown: (e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") {
							setDraft(String(item.qty));
							setEditing(false);
						}
					},
					className: "w-16 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-primary"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: () => setEditing(true),
					className: "min-w-[64px] rounded-lg px-2 py-1 text-center text-sm font-semibold tabular-nums text-foreground hover:bg-secondary",
					"aria-label": `Edit ${item.name} quantity`,
					children: [
						item.qty,
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[11px] font-normal text-muted-foreground",
							children: item.unit
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => onAdjust(item.id, 1),
					className: "grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:border-primary/40 hover:text-foreground",
					"aria-label": "Increase",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3.5 w-3.5" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => onRemove(item.id),
					className: "ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground",
					"aria-label": `Remove ${item.name}`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
				})
			]
		})]
	});
}
function AddPantryItemModal({ onClose, onAdd }) {
	const [name, setName] = (0, import_react.useState)("");
	const [qty, setQty] = (0, import_react.useState)("1");
	const [unit, setUnit] = (0, import_react.useState)("pcs");
	const [par, setPar] = (0, import_react.useState)("1");
	const [category, setCategory] = (0, import_react.useState)("Pantry");
	const valid = name.trim().length > 0 && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(par));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: "Add pantry item"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
								children: "Name"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "e.g. Toilet paper",
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-3 gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
										children: "Qty"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: qty,
										onChange: (e) => setQty(e.target.value),
										inputMode: "decimal",
										className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
										children: "Unit"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: unit,
										onChange: (e) => setUnit(e.target.value),
										placeholder: "pcs, kg, L",
										className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
										children: "Par"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: par,
										onChange: (e) => setPar(e.target.value),
										inputMode: "decimal",
										className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
								children: "Category"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								value: category,
								onChange: (e) => setCategory(e.target.value),
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary",
								children: PANTRY_CATEGORIES.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: c,
									children: c
								}, c))
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						disabled: !valid,
						onClick: () => onAdd({
							name: name.trim(),
							qty: parseFloat(qty),
							unit: unit.trim() || "pcs",
							par: parseFloat(par),
							category
						}),
						className: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50",
						children: "Add"
					})]
				})
			]
		})
	});
}
var fmtPeso = (n) => `₱${Math.round(n).toLocaleString()}`;
function BudgetBar({ compact } = {}) {
	const ctx = useGrocery();
	if (!ctx) return null;
	const pct = ctx.budget > 0 ? Math.min(100, ctx.spent / ctx.budget * 100) : 0;
	const over = ctx.spent > ctx.budget;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: compact ? "" : "rounded-2xl bg-background/60 p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-baseline justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-baseline gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: `font-display ${compact ? "text-lg" : "text-2xl"} tabular-nums text-foreground`,
					children: fmtPeso(ctx.spent)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-xs text-muted-foreground tabular-nums",
					children: ["/ ", fmtPeso(ctx.budget)]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: `text-[11px] font-semibold tabular-nums ${over ? "text-[oklch(0.5_0.17_35)]" : "text-muted-foreground"}`,
				children: over ? `over by ${fmtPeso(ctx.spent - ctx.budget)}` : `${fmtPeso(ctx.remaining)} left`
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-2 h-1.5 overflow-hidden rounded-full bg-secondary",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: `h-full rounded-full transition-all ${over ? "bg-[oklch(0.55_0.18_35)]" : "bg-primary"}`,
				style: { width: `${pct}%` }
			})
		})]
	});
}
function ReceiptSlot({ compact } = {}) {
	const ctx = useGrocery();
	const [preview, setPreview] = (0, import_react.useState)(false);
	if (!ctx) return null;
	if (ctx.receiptPhoto) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `flex items-center gap-2 rounded-2xl border border-border/70 bg-background/60 p-2 ${compact ? "" : "sm:p-3"}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: () => setPreview(true),
				className: "shrink-0 overflow-hidden rounded-xl",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: ctx.receiptPhoto,
					alt: "Receipt",
					className: "h-12 w-12 object-cover"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs font-semibold text-foreground",
					children: "Receipt attached"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[11px] text-muted-foreground",
					children: "Tap to view"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: ctx.clearReceipt,
				className: "grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground",
				"aria-label": "Remove receipt",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-3.5 w-3.5" })
			})
		]
	}), preview && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4",
		onClick: () => setPreview(false),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src: ctx.receiptPhoto,
			alt: "Receipt",
			className: "max-h-[85vh] rounded-2xl shadow-lift"
		})
	})] });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick: ctx.attachReceipt,
		className: "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-background/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "h-3.5 w-3.5" }), " Attach receipt photo"]
	});
}
function TodaysSpendDial() {
	const ctx = useGrocery();
	if (!ctx) return null;
	const over = ctx.spent > ctx.budget;
	const pct = ctx.budget > 0 ? Math.min(100, ctx.spent / ctx.budget * 100) : 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-3xl border border-border/70 bg-card p-4 shadow-soft",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
					children: "Today's spend"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: ctx.openModal,
					className: "inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "h-3 w-3" }), " Palengke run"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-1.5 flex items-baseline gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-display text-2xl tabular-nums text-foreground",
					children: fmtPeso(ctx.spent)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-xs text-muted-foreground tabular-nums",
					children: ["/ ", fmtPeso(ctx.budget)]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: `h-full rounded-full ${over ? "bg-[oklch(0.55_0.18_35)]" : "bg-primary"}`,
					style: { width: `${pct}%` }
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex items-center justify-between text-[11px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: `tabular-nums ${over ? "font-semibold text-[oklch(0.5_0.17_35)]" : "text-muted-foreground"}`,
					children: over ? `over by ${fmtPeso(ctx.spent - ctx.budget)}` : `${fmtPeso(ctx.remaining)} remaining`
				}), ctx.receiptPhoto ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: ctx.openModal,
					className: "inline-flex items-center gap-1 text-primary hover:underline",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "h-3 w-3" }), " Receipt"]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-muted-foreground/70",
					children: "No receipt yet"
				})]
			})
		]
	});
}
function PalengkeChip({ compact } = {}) {
	const ctx = useGrocery();
	if (!ctx) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick: ctx.openModal,
		className: `inline-flex items-center gap-1 rounded-full border border-terracotta/50 bg-terracotta-soft/60 font-semibold text-[oklch(0.4_0.13_55)] transition hover:bg-terracotta-soft ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10px]"}`,
		title: "Grocery list attached",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBasket, { className: "h-2.5 w-2.5" }),
			"Grocery · ",
			ctx.toBuyCount,
			" to buy · ",
			fmtPeso(ctx.spent)
		]
	});
}
function PalengkeInlineList() {
	const ctx = useGrocery();
	if (!ctx) return null;
	const toBuy = ctx.display.filter((g) => !g.bought);
	const bought = ctx.display.filter((g) => g.bought);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-terracotta/40 bg-terracotta-soft/30 p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-8 w-8 place-items-center rounded-full bg-card text-[oklch(0.4_0.13_55)]",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBasket, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-sm font-semibold text-pine-deep",
						children: "Your list · your budget"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-[11px] text-muted-foreground",
						children: [
							toBuy.length,
							" to buy · ",
							bought.length,
							" bought"
						]
					})] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: ctx.openModal,
					className: "rounded-full border border-primary/30 bg-card px-3 py-1 text-[11px] font-semibold text-primary shadow-soft hover:bg-primary/5",
					children: "Open list"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 rounded-2xl bg-card/70 p-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BudgetBar, { compact: true })
			}),
			ctx.display.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-xs italic text-muted-foreground",
				children: "Nothing to buy — pantry is stocked."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-3 space-y-1.5",
				children: [ctx.display.slice(0, 5).map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroceryRow, {
					item: g,
					onToggle: () => ctx.toggleBought(g),
					onRemove: () => ctx.remove(g),
					onCost: (c) => ctx.setCost(g, c),
					tone: "light"
				}) }, g.id)), ctx.display.length > 5 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "pt-1 text-center text-[11px] text-muted-foreground",
					children: [
						"+",
						ctx.display.length - 5,
						" more · tap Open list"
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReceiptSlot, { compact: true })
			})
		]
	});
}
function GrocerySection() {
	const ctx = useGrocery();
	if (!ctx) return null;
	const toBuy = ctx.display.filter((g) => !g.bought);
	const bought = ctx.display.filter((g) => g.bought);
	const [name, setName] = (0, import_react.useState)("");
	const [qty, setQty] = (0, import_react.useState)("1");
	const [unit, setUnit] = (0, import_react.useState)("pcs");
	const [budgetDraft, setBudgetDraft] = (0, import_react.useState)(String(ctx.budget));
	(0, import_react.useEffect)(() => {
		setBudgetDraft(String(ctx.budget));
	}, [ctx.budget]);
	const submit = () => {
		if (!name.trim()) return;
		const n = parseFloat(qty);
		ctx.addManual(name, isNaN(n) ? 1 : n, unit);
		setName("");
		setQty("1");
		setUnit("pcs");
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-8 w-8 place-items-center rounded-full bg-terracotta-soft text-[oklch(0.4_0.13_55)]",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBasket, { className: "h-4 w-4" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl text-foreground",
							children: "Grocery list"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "Auto-suggested from Pantry lows. Attached to the Palengke run."
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep",
					children: [toBuy.length, " to buy"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 rounded-2xl bg-background/60 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-2 flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
						children: "Petty cash budget"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "inline-flex items-center gap-1 text-[11px] text-muted-foreground",
						children: ["₱", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: budgetDraft,
							onChange: (e) => setBudgetDraft(e.target.value),
							onBlur: () => {
								const n = parseFloat(budgetDraft);
								if (!isNaN(n)) ctx.setBudget(n);
								else setBudgetDraft(String(ctx.budget));
							},
							inputMode: "numeric",
							className: "w-20 rounded-lg border border-input bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary"
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BudgetBar, { compact: true })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 space-y-2",
				children: [toBuy.length === 0 && bought.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-2xl border border-dashed border-border bg-background/60 p-4 text-center text-xs text-muted-foreground",
					children: "Pantry is stocked — nothing suggested. Add manual items below."
				}), toBuy.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroceryRow, {
					item: g,
					onToggle: () => ctx.toggleBought(g),
					onRemove: () => ctx.remove(g),
					onCost: (c) => ctx.setCost(g, c)
				}, g.id))]
			}),
			bought.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
					children: ["Bought · ", bought.length]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "space-y-1.5",
					children: bought.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroceryRow, {
						item: g,
						onToggle: () => ctx.toggleBought(g),
						onRemove: () => ctx.remove(g),
						onCost: (c) => ctx.setCost(g, c)
					}, g.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
					children: "Receipt"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReceiptSlot, {})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-background/60 p-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
							children: "Add item"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: name,
							onChange: (e) => setName(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Enter") submit();
							},
							placeholder: "e.g. ulam for Sunday",
							className: "w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "w-16",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
							children: "Qty"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: qty,
							onChange: (e) => setQty(e.target.value),
							inputMode: "decimal",
							className: "w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "w-20",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
							children: "Unit"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: unit,
							onChange: (e) => setUnit(e.target.value),
							className: "w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm outline-none focus:border-primary"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: submit,
						className: "inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3.5 w-3.5" }), " Add"]
					})
				]
			})
		]
	});
}
function GroceryRow({ item, onToggle, onRemove, onCost, tone }) {
	const suggested = item.id.startsWith("sug-");
	const [draft, setDraft] = (0, import_react.useState)(item.costPHP != null ? String(item.costPHP) : "");
	(0, import_react.useEffect)(() => {
		setDraft(item.costPHP != null ? String(item.costPHP) : "");
	}, [item.costPHP]);
	const commit = () => {
		if (!onCost) return;
		if (draft.trim() === "") {
			onCost(void 0);
			return;
		}
		const n = parseFloat(draft);
		if (!isNaN(n) && n >= 0) onCost(n);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `flex items-center gap-2 rounded-xl border p-2 ${tone === "light" ? "border-transparent bg-card/70" : "border-border/70 bg-background/60"}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: onToggle,
				className: `grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${item.bought ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-transparent hover:border-primary/60"}`,
				"aria-label": item.bought ? "Mark not bought" : "Mark bought",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3.5 w-3.5" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `flex items-center gap-1.5 text-sm ${item.bought ? "text-muted-foreground" : "text-foreground"}`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: `truncate font-medium ${item.bought ? "line-through" : ""}`,
						children: item.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "shrink-0 text-[11px] tabular-nums text-muted-foreground",
						children: [
							"· ",
							item.qty,
							" ",
							item.unit
						]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-1.5 text-[10px]",
					children: [suggested && !item.bought && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-full bg-secondary px-1.5 py-0.5 font-semibold text-pine-deep",
						children: "Suggested"
					}), item.pantryItemId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-0.5 text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Package, { className: "h-2.5 w-2.5" }), " restocks pantry"]
					})]
				})]
			}),
			item.bought && !suggested && onCost && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card px-1.5 py-1 text-xs text-muted-foreground focus-within:border-primary",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "₱" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: draft,
					onChange: (e) => setDraft(e.target.value),
					onBlur: commit,
					onKeyDown: (e) => {
						if (e.key === "Enter") e.target.blur();
					},
					inputMode: "decimal",
					placeholder: "—",
					className: "w-14 bg-transparent text-right text-sm tabular-nums text-foreground outline-none"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				onClick: onRemove,
				className: "grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground",
				"aria-label": `Remove ${item.name}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-3.5 w-3.5" })
			})
		]
	});
}
function GroceryModal({ onClose }) {
	const ctx = useGrocery();
	if (!ctx) return null;
	const toBuy = ctx.display.filter((g) => !g.bought);
	const bought = ctx.display.filter((g) => g.bought);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-h-[90vh] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-lift",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between border-b border-border/60 p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
						children: "Palengke run"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mt-1 font-display text-xl text-foreground",
						children: "Grocery & budget"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-0.5 text-xs text-muted-foreground",
						children: [
							toBuy.length,
							" to buy · ",
							bought.length,
							" bought"
						]
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: onClose,
					className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "max-h-[70vh] overflow-y-auto p-4 space-y-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-2xl bg-background/60 p-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
							children: "Spent vs. budget"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BudgetBar, { compact: true })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
						children: "Receipt"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReceiptSlot, {})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
						children: "To buy"
					}), toBuy.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground",
						children: "All checked off. Salamat!"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "space-y-1.5",
						children: toBuy.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroceryRow, {
							item: g,
							onToggle: () => ctx.toggleBought(g),
							onRemove: () => ctx.remove(g),
							onCost: (c) => ctx.setCost(g, c)
						}, g.id))
					})] }),
					bought.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
							children: "Bought"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-1.5",
							children: bought.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroceryRow, {
								item: g,
								onToggle: () => ctx.toggleBought(g),
								onRemove: () => ctx.remove(g),
								onCost: (c) => ctx.setCost(g, c)
							}, g.id))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 px-1 text-[11px] italic text-muted-foreground",
							children: "Enter what each item actually cost. Checking off a suggested item also bumps the pantry back up."
						})
					] })
				]
			})]
		})
	});
}
function RemoteGlance({ active, helperName, adminName }) {
	const doneToday = active.filter((t) => t.status === "done");
	const donePhotos = doneToday.filter((t) => t.photo).slice(0, 6);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-primary/20 bg-secondary/40 p-5 shadow-soft sm:p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "h-4 w-4" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-pine-deep/80",
						children: ["Your OFW view · ", adminName]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-0.5 font-display text-lg text-foreground",
						children: "Home is holding steady."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "You're watching from afar — schedules and off-hours reaches stay with the on-site managers. What you see here is the day, the money, and anything waiting on your yes."
					})
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 rounded-2xl border border-border/70 bg-card p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
						children: [
							"Done today · ",
							helperName,
							" & team"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3 w-3" }),
							" ",
							doneToday.length
						]
					})]
				}),
				donePhotos.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6",
					children: donePhotos.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-hidden rounded-xl border border-border/70",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: t.photo,
							alt: t.title,
							className: "h-16 w-full object-cover",
							loading: "lazy"
						})
					}, t.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-xs italic text-muted-foreground",
					children: "Photos from finished tasks will show up here — a quiet way to see the day."
				}),
				doneToday.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-1.5",
					children: doneToday.slice(0, 4).map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-2 text-xs",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "truncate text-foreground",
							children: t.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "shrink-0 text-muted-foreground",
							children: t.time
						})]
					}, t.id))
				})
			]
		})]
	});
}
function SuggestionsInbox({ suggestions, onApprove, onDismiss }) {
	const groups = /* @__PURE__ */ new Map();
	for (const t of suggestions) {
		const key = t.createdBy ?? "A remote admin";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(t);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-terracotta/40 bg-terracotta-soft/30 p-4 shadow-soft sm:p-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-3 flex items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid h-8 w-8 place-items-center rounded-full bg-terracotta/20 text-[oklch(0.42_0.15_60)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleQuestionMark, { className: "h-4 w-4" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "text-sm font-semibold text-foreground",
				children: ["Suggested by remote admins · ", suggestions.length]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground",
				children: "Approve to place on the board, or dismiss quietly."
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-4",
			children: [...groups.entries()].map(([who, items]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-pine-deep",
				children: ["From ", who]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-2",
				children: items.map((t) => {
					const helper = helperById(t.helperId);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
										className: "text-sm font-semibold text-foreground",
										children: t.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials: helper.initials }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-semibold text-foreground",
												children: helper.short
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "·" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t.time })
										]
									}),
									t.note && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1.5 text-xs text-muted-foreground",
										children: t.note
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[t.station]}`,
								children: t.station
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => onApprove(t.id),
								className: "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3.5 w-3.5" }), " Approve to board"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => onDismiss(t.id),
								className: "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-3.5 w-3.5" }), " Dismiss"]
							})]
						})]
					}, t.id);
				})
			})] }, who))
		})]
	});
}
function MySuggestions({ suggestions, onWithdraw, adminName }) {
	const mine = suggestions.filter((t) => (t.createdBy ?? "") === adminName);
	const others = suggestions.filter((t) => (t.createdBy ?? "") !== adminName);
	if (mine.length === 0 && others.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card/70 p-4 shadow-soft sm:p-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-2 flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleQuestionMark, { className: "h-4 w-4" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-sm font-semibold text-foreground",
					children: "Waiting on the on-site manager"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs text-muted-foreground",
					children: "Your suggestions sit here until Ben or Tina approves them."
				})] })]
			}),
			mine.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-2xl border border-dashed border-border/70 bg-background/60 p-3 text-xs italic text-muted-foreground",
				children: "Nothing pending from you right now."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-2",
				children: mine.map((t) => {
					const helper = helperById(t.helperId);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "rounded-2xl border border-border/70 bg-background/60 p-3",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
									className: "text-sm font-semibold text-foreground",
									children: t.title
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-0.5 text-[11px] text-muted-foreground",
									children: [
										"For ",
										helper.short,
										" · ",
										t.time
									]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => onWithdraw(t.id),
								className: "inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-3 w-3" }), " Withdraw"]
							})]
						})
					}, t.id);
				})
			})
		]
	});
}
function MyNotes({ helperId, onMakeTask }) {
	const STORAGE_KEY = `mynotes:${helperId}`;
	const [notes, setNotes] = (0, import_react.useState)([]);
	const [text, setText] = (0, import_react.useState)("");
	const [holding, setHolding] = (0, import_react.useState)(false);
	const [hydrated, setHydrated] = (0, import_react.useState)(false);
	const holdStart = (0, import_react.useRef)(0);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) setNotes(JSON.parse(raw));
		} catch {}
		setHydrated(true);
	}, [STORAGE_KEY]);
	(0, import_react.useEffect)(() => {
		if (!hydrated) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
		} catch {}
	}, [
		STORAGE_KEY,
		notes,
		hydrated
	]);
	const add = () => {
		const t = text.trim();
		if (!t) return;
		setNotes((prev) => [{
			id: `n-${Date.now()}`,
			text: t,
			done: false,
			createdAt: Date.now()
		}, ...prev]);
		setText("");
	};
	const addVoice = (secs) => {
		const label = `🎙️ Voice note · 0:${String(Math.max(1, Math.min(secs, 59))).padStart(2, "0")}`;
		setNotes((prev) => [{
			id: `n-${Date.now()}`,
			text: label,
			done: false,
			voice: true,
			createdAt: Date.now()
		}, ...prev]);
	};
	const toggle = (id) => setNotes((p) => p.map((n) => n.id === id ? {
		...n,
		done: !n.done
	} : n));
	const remove = (id) => setNotes((p) => p.filter((n) => n.id !== id));
	const startHold = () => {
		holdStart.current = Date.now();
		setHolding(true);
	};
	const endHold = () => {
		if (!holding) return;
		const secs = Math.max(1, Math.round((Date.now() - holdStart.current) / 1e3));
		setHolding(false);
		addVoice(secs || 4);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-3xl border border-border/70 bg-card p-4 shadow-soft sm:p-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-9 w-9 place-items-center rounded-2xl bg-terracotta-soft/70 text-[oklch(0.55_0.13_55)]",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StickyNote, { className: "h-4 w-4" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-lg text-foreground",
						children: "My Notes"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] italic text-muted-foreground",
						children: "Your notes — just for you."
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: text,
					onChange: (e) => setText(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") add();
					},
					placeholder: "e.g. Bumili ng suka mamaya",
					className: "flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: add,
					className: "rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
					children: "Add"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onMouseDown: startHold,
				onMouseUp: endHold,
				onMouseLeave: () => {
					if (holding) endHold();
				},
				onTouchStart: startHold,
				onTouchEnd: endHold,
				className: `mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-semibold transition ${holding ? "border-terracotta bg-terracotta-soft/60 text-[oklch(0.45_0.12_55)]" : "border-border text-muted-foreground hover:text-foreground"}`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, { className: "h-3.5 w-3.5" }), holding ? "Recording… release to save" : "🎙️ Hold to record"]
			}),
			notes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 rounded-2xl bg-secondary/50 px-3 py-3 text-center text-xs italic text-muted-foreground",
				children: "Wala pang notes. Capture anything you hear out loud."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 space-y-2",
				children: notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-2xl border border-border/60 bg-background/60 p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start gap-2.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => toggle(n.id),
								"aria-label": n.done ? "Mark not done" : "Mark done",
								className: `mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${n.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`,
								children: n.done && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3 w-3" })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: `min-w-0 flex-1 text-sm ${n.done ? "text-muted-foreground line-through" : "text-foreground"}`,
								children: n.text
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => remove(n.id),
								className: "rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground",
								"aria-label": "Delete note",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
							})
						]
					}), !n.done && !n.voice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 flex justify-end",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => onMakeTask(n.text),
							className: "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-pine-deep hover:border-primary hover:text-primary",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarClock, { className: "h-3 w-3" }), " Make it a task"]
						})
					})]
				}, n.id))
			})
		]
	});
}
function NoteToTaskModal({ initialTitle, helperId, onClose, onSubmit }) {
	const [title, setTitle] = (0, import_react.useState)(initialTitle);
	const [time, setTime] = (0, import_react.useState)("15:00");
	const [note, setNote] = (0, import_react.useState)("");
	const submit = () => {
		const trimmed = title.trim();
		if (!trimmed) return;
		const [h, m] = time.split(":").map(Number);
		const suffix = h >= 12 ? "PM" : "AM";
		onSubmit({
			title: trimmed,
			helperId,
			time: `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${suffix}`,
			note: note.trim() || void 0,
			recurrence: "none",
			createdBy: "Ate Rosa"
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl text-foreground",
						children: "Make it a task"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "Give this note a time so it gets on the board and has a record."
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full p-1.5 text-muted-foreground hover:bg-secondary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Title",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: title,
								onChange: (e) => setTitle(e.target.value),
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Time",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "time",
								value: time,
								onChange: (e) => setTime(e.target.value),
								className: "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Note (optional)",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								value: note,
								onChange: (e) => setNote(e.target.value),
								rows: 2,
								placeholder: "Any detail to remember",
								className: "w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex items-center justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: submit,
						className: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep",
						children: "Add to board"
					})]
				})
			]
		})
	});
}
//#endregion
export { LinaraApp as component };
