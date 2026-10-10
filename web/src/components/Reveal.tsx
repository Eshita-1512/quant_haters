import type { CSSProperties, ReactNode } from "react";
import { useInView } from "@/hooks/useInView";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export default function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const style = { "--i-delay": `${delay}ms` } as CSSProperties;
  return (
    <div ref={ref} style={style} className={`reveal-item ${inView ? "is-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
