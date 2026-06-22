/**
 * 跨環境複製文字。
 * navigator.clipboard 僅在安全環境(HTTPS / localhost)可用;
 * 正式機目前為 http://IP(非安全環境)→ 退回 execCommand('copy') fallback。
 * 回傳是否成功,由呼叫端決定 toast。
 */
export async function copyText(text: string): Promise<boolean> {
  // 安全環境優先用標準 API
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 落到 fallback */
    }
  }
  // HTTP / 非安全環境 fallback
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
