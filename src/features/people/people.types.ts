// People in the household: helpers on stations, admins who manage, and pending invites.

export type Station = "Yaya" | "Cook" | "Laundry" | "Driver" | "House";

export type PaydayInterval = "semi_monthly" | "monthly";

export type Helper = {
  id: string;
  name: string;
  short: string;
  initials: string;
  station: Station;
  shift: string;
  restDay: string;
  monthlyRate: number;
  paydayInterval: PaydayInterval;
};

export type AdminType = "primary" | "co" | "remote";
export type Admin = {
  id: string;
  name: string;
  short: string;
  initials: string;
  type: AdminType;
  location: string;
};

export type Employment = "live-in" | "live-out";
export type InviteFlag = { id: string; field: string; note?: string; at: number };
export type Invite = {
  id: string;
  code: string;
  name: string;
  station: Station;
  employment: Employment;
  shift: string;
  restDay: string;
  wagePHP: number;
  phone: string;
  createdAt: number;
  createdBy: string;
  status: "pending" | "active";
  claimedName?: string;
  claimedAt?: number;
  flags: InviteFlag[];
};
