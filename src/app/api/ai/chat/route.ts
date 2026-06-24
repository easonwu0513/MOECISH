import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/rbac';
import { ROLE_LABELS, type Role } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MOECISH 操作小幫手:把對話轉送到「本地」OpenAI 相容 LLM(LLM_BASE_URL),串流回前端。
 * - 全程在內網,資料不出機器;未設定 LLM_BASE_URL/LLM_MODEL 時回 503(小幫手前端也會隱藏)。
 * - 唯讀:本路由只讀使用者身分組系統提示,不碰任何 DB 寫入;模型只產草稿,不代為送出/變更。
 * - 模型無關:接 /chat/completions(Ollama / llama.cpp / vLLM 皆相容),換模型只改環境變數。
 */
function systemPrompt(roleLabel: string): string {
  return [
    '你是「MOECISH 操作小幫手」。MOECISH 是教育部資通安全稽核管考平台。',
    `目前對話的使用者角色:${roleLabel}。一律用繁體中文、簡潔回答。`,
    '平台流程 7 階段(依序):開立中 → 資料準備中 → 資料齊備 → 實地稽核 → 缺失發布中 → 矯正執行中 → 結案。',
    '三種角色職責:',
    '・中心/最高管理員:建立週期、設定截止日、指派委員、逐項確認機關繳交資料齊備、安排實地稽核、發布缺失、結案。',
    '・稽核委員:資料齊備後檢視資料、依排定日期到場查核、填寫評分與稽核發現、審查矯正措施。',
    '・機關管理員:上傳稽核前資料與佐證(或敘明無相關文件理由)、填報資安自評檢核表、確定繳交、填報矯正措施、上傳用印報告。',
    '',
    '你「能」做:解釋平台操作與流程、說明各角色的下一步、協助摘要或草擬文字(例如稽核發現敘述、通知信)。',
    '你「不能」做也不可宣稱:代替使用者送出/鎖定/變更任何資料;提供權威數字或正式稽核結論;編造法規條文或事實。',
    '不確定時直接說不確定,並建議到對應頁面操作或查看。所有回覆僅為輔助草稿,使用者須自行核對後才採用。',
  ].join('\n');
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const base = process.env.LLM_BASE_URL;
    const model = process.env.LLM_MODEL;
    if (!base || !model) {
      return NextResponse.json({ error: 'AI 小幫手尚未設定(未設定 LLM_BASE_URL / LLM_MODEL)' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body?.messages) ? body.messages : [];
    const messages = incoming
      .slice(-12) // 只帶最近數則,避免脈絡過長
      .map((m: { role?: string; content?: unknown }) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content ?? '').slice(0, 4000),
      }))
      .filter((m: { content: string }) => m.content.trim().length > 0);
    if (messages.length === 0) {
      return NextResponse.json({ error: '請輸入訊息' }, { status: 400 });
    }

    const roleLabel = ROLE_LABELS[user.role as Role] ?? '使用者';
    const upstream = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.LLM_API_KEY ? { authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.3,
        messages: [{ role: 'system', content: systemPrompt(roleLabel) }, ...messages],
      }),
    }).catch(() => null);

    if (!upstream || !upstream.ok || !upstream.body) {
      return NextResponse.json({ error: '小幫手暫時無法回應,請稍後再試' }, { status: 502 });
    }

    // 解析 OpenAI 相容 SSE,只把文字增量(delta.content)以純文字串流回前端
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buf = '';
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (data === '[DONE]') {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) controller.enqueue(encoder.encode(delta));
          } catch {
            /* 非 JSON 行(keep-alive 等)略過 */
          }
        }
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });

    return new Response(stream, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: '小幫手發生錯誤' }, { status: 500 });
  }
}
