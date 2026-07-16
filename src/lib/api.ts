import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthError } from './rbac';

/**
 * API route 統一錯誤處理:
 * - AuthError → 對應狀態碼(401/403/404)+ 既有中文訊息
 * - ZodError → 400 通用訊息(不外洩完整 issue 結構)
 * - Prisma 已知錯誤 → 409(唯一性 P2002)/ 404(找不到 P2025)
 * - 其餘 → 500 通用訊息 + 伺服器端記錄(供 Loki/Grafana 觀測),不外洩內部訊息/堆疊
 *
 * 用法:`} catch (e) { return errorResponse(e); }`
 */
export function errorResponse(e: unknown, context?: string): NextResponse {
  // Next 內部控制流錯誤(redirect/notFound/動態渲染偵測)必須往外拋,交框架處理,不可吞
  if (
    e && typeof e === 'object' && 'digest' in e &&
    typeof (e as { digest?: unknown }).digest === 'string' &&
    ((e as { digest: string }).digest.startsWith('NEXT_') ||
      (e as { digest: string }).digest === 'DYNAMIC_SERVER_USAGE')
  ) {
    throw e;
  }
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: '輸入格式不正確，請檢查必填與格式' }, { status: 400 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: '資料重複，違反唯一性限制' }, { status: 409 });
    }
    if (e.code === 'P2025') {
      return NextResponse.json({ error: '找不到對象資料' }, { status: 404 });
    }
  }
  // 未預期錯誤:伺服器端留記錄,對外只回通用訊息(避免洩漏資料表/欄位/約束名)
  console.error(`[api]${context ? ` ${context}` : ''}`, e);
  return NextResponse.json({ error: '伺服器發生錯誤，請稍後再試' }, { status: 500 });
}
