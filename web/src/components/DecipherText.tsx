import { useEffect, useRef, useState } from "react";

const GLYPHS = "0123456789ABCDEF!#$@%&*<>/[]_~¥§";

interface DecipherTextProps {
  text: string;
  className?: string;
  speedMs?: number;
  triggerOnHover?: boolean;
  autoStart?: boolean;
  delayMs?: number;
}

export default function DecipherText({
  text,
  className = "",
  speedMs = 35,
  triggerOnHover = true,
  autoStart = true,
  delayMs = 0,
}: DecipherTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const animatingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startDecipher = () => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    let iteration = 0;
    const maxIterations = text.length * 3;

    const interval = setInterval(() => {
      setDisplayText(() => {
        return text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            // Lock in letters progressively
            if (index < iteration / 3) {
              return text[index];
            }
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join("");
      });

      iteration += 1;
      if (iteration >= maxIterations) {
        clearInterval(interval);
        setDisplayText(text);
        animatingRef.current = false;
      }
    }, speedMs);
  };

  useEffect(() => {
    if (autoStart) {
      if (delayMs > 0) {
        timeoutRef.current = setTimeout(startDecipher, delayMs);
      } else {
        startDecipher();
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, autoStart, delayMs]);

  return (
    <span
      className={`inline-block font-mono tabular-nums ${className}`}
      onMouseEnter={triggerOnHover ? startDecipher : undefined}
      title={text}
    >
      {displayText}
    </span>
  );
}
