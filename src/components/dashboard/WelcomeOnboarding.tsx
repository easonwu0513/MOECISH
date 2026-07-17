'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ChevronRight, X } from '@/components/icons';

const STORAGE_KEY = 'moecish:onboarded:v1';

// UAT 圖8:標題統一「歡迎加入」(不接角色詞)
const COPY = {
  AUDITOR: {
    title: '歡迎加入',
    body: '您的工作是：審閱機關資通安全檢核表、實地稽核評分與開立缺失、審查機關矯正措施。從下方待辦開始；每個週期工作台都有『引導清單』一步步帶您完成當前階段。',
  },
  OBSERVER: {
    title: '歡迎加入',
    body: '您以觀察員身分參與稽核觀摩與『稽核發現撰寫練習』——練習內容僅供指導委員與中心檢視回饋，不會進入正式報告，可安心練習。從下方待辦開始；週期工作台的引導清單會協助您熟悉流程。',
  },
} as const;

// UAT 圖8:事前場次調查的首要提醒(1=第一階段待完成;2=待填第二階段差旅)
const SURVEY_REMINDER = {
  1: '首要事項：請先完成『事前場次調查』第一階段——填寫出席意願並繳交相關文件。',
  2: '請完成『事前場次調查』第二階段——填寫差旅（交通住宿）與飲食需求。',
} as const;

/**
 * 委員／觀察員首次登入的歡迎引導卡（批53）:角色化文案 + 第一步 CTA +「知道了」關閉。
 * 質感比照 PrimaryActionBanner(primary-50 輕盈底,非重色塊)。
 * localStorage(moecish:onboarded:v1)記住已關;為避免 hydration 閃爍,
 * 首次 render 一律不顯示,mounted 後才依 localStorage 決定是否顯示。
 */
export function WelcomeOnboarding({
  role,
  firstHref,
  firstLabel,
  surveyStage = null,
}: {
  role: 'AUDITOR' | 'OBSERVER';
  firstHref?: string;
  firstLabel?: string;
  /** UAT 圖8:事前場次調查待辦階段(1=一階待完成、2=待二階差旅、null=無調查或已完成) */
  surveyStage?: 1 | 2 | null;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      /* localStorage 不可用時略過 */
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* 忽略寫入失敗（無痕模式/停用 storage） */
    }
  }

  if (!show) return null;

  const copy = COPY[role];

  return (
    <section className="mb-6 rounded-lg border border-primary-100 bg-primary-50/70 px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-title-lg text-ink-900 leading-snug">{copy.title}</h2>
          {surveyStage && (
            <p className="mt-1.5 text-body-sm font-medium text-primary-700 leading-relaxed">
              {SURVEY_REMINDER[surveyStage]}
            </p>
          )}
          <p className="mt-1.5 text-body-sm text-ink-500 leading-relaxed">{copy.body}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="關閉"
          className="shrink-0 -m-1 p-1 rounded-full text-ink-500 hover:bg-primary-100/60 focus-ring"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {firstHref && (
          <Button href={firstHref} variant="filled" size="sm" trailingIcon={<ChevronRight size={16} />}>
            {firstLabel || '前往第一項待辦'}
          </Button>
        )}
        {surveyStage ? (
          <Button
            onClick={() => {
              dismiss();
              router.push('/pre-survey'); // 跳轉至事前場次調查自助填報
            }}
            variant="text"
            size="sm"
          >
            {surveyStage === 1 ? '知道了，立即填寫出席意願與繳交相關文件' : '知道了，前往填寫差旅與飲食'}
          </Button>
        ) : (
          <Button onClick={dismiss} variant="text" size="sm">
            知道了
          </Button>
        )}
      </div>
    </section>
  );
}
