'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Sparkles, Send, X } from '@/components/icons';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '這個週期我下一步該做什麼？',
  '機關要繳交哪些稽核前資料？',
  '幫我把這段稽核發現寫得更精簡：',
];

/**
 * MOECISH 浮動操作小幫手(小機器人):右下角啟動鈕 → 對話面板,串流接本地 LLM(/api/ai/chat)。
 * 唯讀輔助:只說明/草擬,不代為送出或變更資料;由 AppShell 以 NEXT_PUBLIC_AI_ASSISTANT 旗標決定是否掛載。
 */
export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // 首次造訪顯示一次招呼泡泡(讓人知道可以問它),關閉後不再出現
  useEffect(() => {
    try {
      if (!localStorage.getItem('moecish-ai-hint')) setShowHint(true);
    } catch {
      /* localStorage 不可用時略過 */
    }
  }, []);
  function dismissHint() {
    setShowHint(false);
    try {
      localStorage.setItem('moecish-ai-hint', '1');
    } catch {
      /* ignore */
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setBusy(true);
    const setLast = (content: string) =>
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content };
        return copy;
      });
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setLast(`⚠️ ${(j as { error?: string }).error ?? '小幫手暫時無法回應'}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setLast(acc);
      }
      if (!acc.trim()) setLast('（沒有回覆內容）');
    } catch {
      setLast('⚠️ 連線中斷，請再試一次');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 print:hidden">
          {showHint && (
            <div className="relative max-w-[230px] rounded-lg rounded-br-sm bg-card border border-rule shadow-elev-2 px-3.5 py-2.5 text-body-sm text-ink-900 animate-in fade-in slide-in-from-bottom-1">
              <button
                type="button"
                onClick={dismissHint}
                aria-label="關閉提示"
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-paper-sunk border border-rule inline-flex items-center justify-center text-ink-500 hover:bg-paper-sunk focus-ring"
              >
                <X size={11} aria-hidden />
              </button>
              <span className="font-medium">👋 嗨，我是 AI 小幫手</span>
              <br />
              平台操作、各角色下一步，或幫你草擬文字，都可以問我！
            </div>
          )}
          {/* 啟動鈕縮為 44px 圓形圖示(UAT:原含字 pill 太占畫面);44px 維持觸控目標下限 */}
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              dismissHint();
            }}
            aria-label="開啟 AI 小幫手"
            title="AI 小幫手"
            className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary-600 text-white shadow-elev-2 hover:bg-primary-700 transition-colors focus-ring"
          >
            <Sparkles size={19} aria-hidden />
          </button>
        </div>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] h-[min(78vh,560px)] flex flex-col rounded-lg border border-rule bg-card shadow-elev-3 overflow-hidden print:hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-rule bg-focus-wash">
            <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-600 text-white">
              <Sparkles size={16} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-title-md text-ink-900 leading-tight">MOECISH AI 小幫手</p>
              <p className="text-label-sm text-ink-500">AI 輔助草稿，內容請自行核對</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="關閉"
              className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md text-ink-500 hover:bg-paper-sunk focus-ring"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="text-body-sm text-ink-500">
                <p>嗨！我可以說明平台操作、各角色的下一步，或協助摘要/草擬文字。試試：</p>
                <div className="mt-3 flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="text-left rounded-md border border-rule px-3 py-2 text-body-sm text-ink-900 hover:bg-paper-sunk focus-ring"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-body-sm whitespace-pre-wrap break-words',
                    m.role === 'user'
                      ? 'self-end bg-primary-600 text-white'
                      : 'self-start bg-paper-sunk text-ink-900',
                  )}
                >
                  {m.content || (busy && i === messages.length - 1 ? '思考中…' : '')}
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-rule p-2 flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="輸入您的問題…（Enter 送出）"
              className="flex-1 resize-none max-h-28 rounded-md border border-neutral-400 hover:border-neutral-500 bg-card px-3 py-2 text-body-sm text-ink-900 focus-ring"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="送出"
              className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors focus-ring"
            >
              <Send size={18} aria-hidden />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
