/** The three-line accent stripe under page titles, also used to split sections. Decorative only. */
export function Stripe({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-0.5 ${className}`}>
      <span className="h-1 rounded-full bg-accent" />
      <span className="h-1 rounded-full bg-ochre" />
      <span className="h-1 rounded-full bg-dusk-soft" />
    </div>
  );
}
