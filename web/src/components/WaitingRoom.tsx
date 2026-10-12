import type { EventStatus } from "@/lib/types";

interface WaitingRoomProps {
  status: EventStatus;
  team: string;
  isStarting?: boolean;
}

export default function WaitingRoom({ status, team, isStarting = false }: WaitingRoomProps) {
  return (
    <section className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#111]">
      <div 
        className={`relative w-full max-w-[1200px] aspect-square sm:aspect-video transition-all duration-[3000ms] ease-in-out ${isStarting ? 'scale-[20] opacity-0' : 'scale-100 opacity-100'}`}
        style={{ transformOrigin: '56% 36%' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stressed_quant.jpg" alt="Stressed Quant" className="absolute inset-0 w-full h-full object-cover grayscale opacity-90" />
        
        {/* Eyelid for blinking */}
        {!isStarting && (
          <div className="absolute top-[36%] left-[56%] w-[8%] h-[5%] bg-black/90 -translate-x-1/2 -translate-y-1/2 animate-blink origin-top mix-blend-multiply"></div>
        )}
      </div>

      {/* Team info overlay at bottom */}
      <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-opacity duration-500 ${isStarting ? 'opacity-0' : 'opacity-100'}`}>
         <h1 className="text-2xl sm:text-4xl font-display font-black uppercase tracking-widest text-text bg-black/60 px-6 py-3 border border-line-strong">
           {team} — {status.assigned_stock.code}
         </h1>
         <p className="mt-3 text-white/80 font-mono text-sm tracking-widest">
            AWAITING MARKET OPEN
         </p>
      </div>
    </section>
  );
}
