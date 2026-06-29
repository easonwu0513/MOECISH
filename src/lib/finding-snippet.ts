import { DEFICIENCY_ASPECT_LABELS, type DeficiencyAspect } from '@/lib/types';
import { FINDING_KIND_LABELS, type FindingKind } from '@/lib/audit-score';

/** 稽核發現「剪貼簿」片語(前端 DTO;不含時間戳)。 */
export type FindingSnippetDTO = { id: string; aspect: string; kind: string; text: string };

/** 構面選項(含「通用」= 空字串,任何構面皆列出)。 */
export const SNIPPET_ASPECTS: { value: string; label: string }[] = [
  { value: '', label: '通用(所有構面)' },
  ...(['STRATEGY', 'MANAGEMENT', 'TECHNICAL'] as DeficiencyAspect[]).map((a) => ({
    value: a,
    label: DEFICIENCY_ASPECT_LABELS[a],
  })),
];

/** 類型選項(含「通用」= 空字串,任何類型皆列出)。 */
export const SNIPPET_KINDS: { value: string; label: string }[] = [
  { value: '', label: '通用(所有類型)' },
  ...(['COMPLIANCE', 'IMPROVE', 'SUGGEST'] as FindingKind[]).map((k) => ({
    value: k,
    label: FINDING_KIND_LABELS[k],
  })),
];

export function snippetAspectLabel(v: string): string {
  return SNIPPET_ASPECTS.find((o) => o.value === v)?.label ?? '通用';
}
export function snippetKindLabel(v: string): string {
  return SNIPPET_KINDS.find((o) => o.value === v)?.label ?? '通用';
}

/** 委員發現表單篩選:片語符合當前構面+類型,或標為「通用」("")者皆列出。 */
export function snippetMatches(s: { aspect: string; kind: string }, aspect: string, kind: string): boolean {
  return (s.aspect === '' || s.aspect === aspect) && (s.kind === '' || s.kind === kind);
}
