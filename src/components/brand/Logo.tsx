import { cn } from '@/lib/cn';

/**
 * C.I.S.H 圓徽 — 書本(知識/法遵)× 蛇杖(醫療)× 新芽(成長)。
 * 依機構徽章重繪之向量版;色票:深青藍 #1B6C97 / 墨藍 #14587E / 淺藍 #B7D7E8。
 * 蛇身與杖採前後交錯(中段杖壓蛇)營造纏繞立體感。
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
      {/* 外圈(細)+ 主圈 */}
      <circle cx="100" cy="100" r="96" fill="#ffffff" stroke="#1B6C97" strokeWidth="2.5" />
      <circle cx="100" cy="100" r="88" fill="#ffffff" stroke="#1B6C97" strokeWidth="5.5" />

      {/* 書本封面 — 左右兩翼,外角微圓,底部交會成 V(右翼較深作摺痕) */}
      <path
        d="M40 60 L40 90 Q40 95 43.5 98.5 L100 150 L100 130 L57 91 Q54 88 54 84 L54 60 Z"
        fill="#1B6C97"
      />
      <path
        d="M160 60 L160 90 Q160 95 156.5 98.5 L100 150 L100 130 L143 91 Q146 88 146 84 L146 60 Z"
        fill="#14587E"
      />

      {/* 書頁 — 弧形頁面,朝書脊下沉 */}
      <path d="M56 57 Q79 63 97 74 L97 124 Q77 111 56 96 Z" fill="#B7D7E8" />
      <path d="M144 57 Q121 63 103 74 L103 124 Q123 111 144 96 Z" fill="#B7D7E8" />
      {/* 頁緣線(疊頁感) */}
      <path d="M59 66 Q79 71 94 81" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M141 66 Q121 71 106 81" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* 新芽(左頁):莖 + 雙葉 */}
      <path d="M71 108 C70 100 71 93 76 87" stroke="#1B6C97" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M71 98 C61 97 56 90 57 82 C66 84 71 90 71 98 Z" fill="#1B6C97" />
      <path d="M73 92 C81 89 85 82 84 75 C76 78 72 84 73 92 Z" fill="#1B6C97" />

      {/* 蛇杖 — 杖身 + 杖頭圓珠 */}
      <line x1="120" y1="50" x2="120" y2="128" stroke="#14587E" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="120" cy="47" r="4" fill="#14587E" />

      {/* 蛇 — 頭在左,頸水平延伸,三圈纏繞,尾端收細上揚 */}
      <circle cx="97" cy="58" r="6.2" fill="#1B6C97" />
      <circle cx="95.2" cy="56.2" r="1.7" fill="#ffffff" />
      <path
        d="M102 58 C110 58 115 58.5 120 61
           C134 65 134 76 120 79.5
           C106 83 106 94 120 97.5
           C133 100.5 133 111 121 114
           C112 116.5 108.5 120.5 111 126"
        stroke="#1B6C97"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      {/* 杖壓過蛇身(中段)→ 纏繞交錯的立體感 */}
      <line x1="120" y1="92" x2="120" y2="103" stroke="#14587E" strokeWidth="5.5" strokeLinecap="butt" />

      {/* 銘文 */}
      <text
        x="100"
        y="177"
        textAnchor="middle"
        fontFamily="'Inter','Noto Sans TC',sans-serif"
        fontSize="19"
        fontWeight="700"
        letterSpacing="4"
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
