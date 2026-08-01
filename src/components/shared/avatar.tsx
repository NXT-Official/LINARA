export function Avatar({ initials }: { initials: string }) {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
      {initials}
    </div>
  );
}
