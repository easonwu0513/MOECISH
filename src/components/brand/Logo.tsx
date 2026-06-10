import { cn } from '@/lib/cn';

/**
 * C.I.S.H 圓徽 — 書本(知識/法遵)× 蛇杖(醫療)× 新芽(成長)。
 * 依機構徽章重繪之向量版,任意尺寸銳利;色票:深青藍 #1B6C97 / 淺藍 #B7D7E8。
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-label="C.I.S.H"
      className={className}
    >
      {/* 外圈 */}
      <circle cx="100" cy="100" r="97" fill="#ffffff" stroke="#1B6C97" strokeWidth="3" />
      <circle cx="100" cy="100" r="89" fill="#ffffff" stroke="#1B6C97" strokeWidth="6" />

      {/* 書本深色封面(V 形) */}
      <path
        d="M38 58 L38 96 L100 152 L100 132 L52 89 L52 58 Z"
        fill="#1B6C97"
      />
      <path
        d="M162 58 L162 96 L100 152 L100 132 L148 89 L148 58 Z"
        fill="#14587E"
      />

      {/* 淺藍書頁(左右,中央留白為書脊) */}
      <path d="M54 56 L96 70 L96 120 L54 92 Z" fill="#B7D7E8" />
      <path d="M146 56 L104 70 L104 120 L146 92 Z" fill="#B7D7E8" />

      {/* 新芽(左頁) */}
      <path
        d="M72 106 C71 98 72 92 76 86"
        stroke="#1B6C97"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M73 96 C64 95 59 89 59 82 C67 83 72 88 73 96 Z" fill="#1B6C97" />
      <path d="M75 90 C83 87 86 81 85 74 C78 77 74 82 75 90 Z" fill="#1B6C97" />

      {/* 蛇杖(右側,跨書頁) */}
      <line x1="120" y1="48" x2="120" y2="126" stroke="#14587E" strokeWidth="6" strokeLinecap="round" />
      {/* 橫翼 */}
      <line x1="99" y1="56" x2="139" y2="56" stroke="#1B6C97" strokeWidth="5" strokeLinecap="round" />
      {/* 蛇頭 + 眼 */}
      <circle cx="96" cy="56" r="6" fill="#1B6C97" />
      <circle cx="94.5" cy="54.5" r="1.6" fill="#ffffff" />
      {/* 蛇身纏繞 */}
      <path
        d="M120 68 C137 70 137 84 120 86 C103 88 103 101 120 103 C135 105 135 117 121 119 C114 120 111 123 113 127"
        stroke="#1B6C97"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* 銘文 */}
      <text
        x="100"
        y="179"
        textAnchor="middle"
        fontFamily="'Inter','Noto Sans TC',sans-serif"
        fontSize="19"
        fontWeight="700"
        letterSpacing="3.5"
        fill="#14587E"
      >
        C.I.S.H
      </text>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Logo size={30} />
      <span className="flex flex-col leading-none gap-[3px]">
        <span className="text-[0.9375rem] font-semibold text-neutral-900 tracking-tight">MOECISH</span>
        <span className="text-[0.6875rem] text-neutral-500 tracking-[0.02em]">資安稽核管考平台</span>
      </span>
    </span>
  );
}
