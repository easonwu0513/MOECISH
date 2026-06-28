'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { FilterChipButton } from '@/components/ui/FilterChip';
import { Send } from '@/components/icons';

type Org = { id: string; name: string };

const DEFAULT_SUBJECT = '[MOECISH] 資通安全稽核改善情形追蹤提醒';
const DEFAULT_BODY = `{{orgName}} 機關管理員您好，

提醒貴機關之資通安全稽核矯正措施尚有未完成項目，
請於期限內登入系統完成填報與佐證上傳：

{{loginUrl}}

— MOECISH 資通安全稽核管考平台`;

export default function ComposeTracking({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  // 從 ?orgIds=a,b,c 預選收件機關(由 dashboard 逾期催辦一鍵帶入,免回頭逐家勾)
  const [selected, setSelected] = useState<Set<string>>(() => {
    const raw = searchParams.get('orgIds');
    const valid = new Set(orgs.map((o) => o.id));
    return new Set((raw ? raw.split(',') : []).filter((id) => valid.has(id)));
  });
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [sending, setSending] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (selected.size === 0) { toast.error('請選擇至少一個機關'); return; }
    setSending(true);
    const res = await fetch('/api/admin/emails/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationIds: Array.from(selected),
        subject,
        body,
      }),
    });
    setSending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '寄送失敗' }));
      toast.error('寄送失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success('已寄送追蹤信', `共 ${j.sent} 封,紀錄如下方列表。`);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <Card className="mb-8" variant="elevated">
      <CardTitle>寄送追蹤信</CardTitle>
      <CardDescription>
        群發給所選機關的機關管理員;內文支援變數 <code className="font-mono">{'{{orgName}}'}</code>、<code className="font-mono">{'{{loginUrl}}'}</code>。
      </CardDescription>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="text-label text-on-surface mb-2">收件機關({selected.size} 已選)</p>
          <div className="flex flex-wrap gap-2">
            {orgs.map((o) => (
              <FilterChipButton key={o.id} selected={selected.has(o.id)} onClick={() => toggle(o.id)}>
                {o.name}
              </FilterChipButton>
            ))}
          </div>
        </div>

        <TextField label="主旨" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="內文" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />

        <div>
          <Button onClick={send} loading={sending} leadingIcon={<Send size={16} />}>
            寄送({selected.size} 個機關)
          </Button>
        </div>
      </div>
    </Card>
  );
}
