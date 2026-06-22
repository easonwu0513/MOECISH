import { auth } from '@/lib/auth';
import { LegalShell } from '@/components/portal/LegalShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: '隱私權政策暨個人資料蒐集告知 · MOECISH' };

export default async function PrivacyPage() {
  const session = await auth();
  return (
    <LegalShell
      authed={!!session}
      title="隱私權政策暨個人資料蒐集告知"
      subtitle="依《個人資料保護法》第 8 條告知事項編製。"
    >
      <section>
        <h2>一、蒐集之機關與維運單位</h2>
        <p>本系統由教育部為蒐集機關,委由教育部轄下醫療領域資訊安全推動中心(C.I.S.H)維運。</p>
      </section>
      <section>
        <h2>二、蒐集目的</h2>
        <p>辦理教育部轄下醫療機構之資通安全稽核、缺失矯正管考、相關通知聯繫,以及法定之統計與管理(代號:〇九〇 資(通)訊與資料管理、一五七 調查、統計與研究分析、一八一 其他諮詢與顧問服務等)。</p>
      </section>
      <section>
        <h2>三、蒐集之個人資料類別</h2>
        <ul>
          <li>識別類:姓名、職稱、所屬機關。</li>
          <li>聯絡類:電子郵件信箱。</li>
          <li>由使用者於系統內填載之稽核作業相關資料(其中可能含機關資通系統之弱點資訊,屬高敏感性業務資料)。</li>
        </ul>
      </section>
      <section>
        <h2>四、利用期間、地區、對象及方式</h2>
        <ul>
          <li>期間:稽核業務存續期間,及依法令規定或業務需要之保存期限內。</li>
          <li>地區:我國境內之主機與資料庫。</li>
          <li>對象:教育部、醫療領域資訊安全推動中心,及各該醫療機構經授權之系統使用者。</li>
          <li>方式:於本系統內以電腦或自動化機器處理利用;通知信件透過 Microsoft 365(Microsoft Graph)寄送。</li>
        </ul>
      </section>
      <section>
        <h2>五、當事人之權利</h2>
        <p>依個人資料保護法第 3 條,您得就您的個人資料向維運單位行使下列權利:查詢或請求閱覽、請求製給複製本、請求補充或更正、請求停止蒐集處理或利用、請求刪除。行使方式請來信 <a href="mailto:moecish@m365.ntu.edu.tw">moecish@m365.ntu.edu.tw</a>。</p>
      </section>
      <section>
        <h2>六、不提供個人資料之影響</h2>
        <p>本系統所蒐集者多為執行稽核業務所必要之資料;若不提供,將無法建立帳號或完成相關稽核作業。</p>
      </section>
      <section>
        <h2>七、資料安全維護</h2>
        <p>本系統採取身分驗證與權限控管、傳輸加密、操作稽核軌跡等技術與組織措施(詳見資通安全維護計畫)。惟透過網際網路傳輸仍存在風險,無法保證絕對安全。</p>
      </section>
      <section>
        <h2>八、委外與第三方</h2>
        <p>系統通知信件之寄送委由 Microsoft 365 處理。除為達成上述蒐集目的或依法令規定外,不對外提供您的個人資料,亦不作為目的外之利用。</p>
      </section>
      <section>
        <h2>九、Cookie 之使用</h2>
        <p>本系統僅使用維持登入工作階段所必要之 Cookie,不用於跨站追蹤或廣告。</p>
      </section>
      <section>
        <h2>十、政策修訂</h2>
        <p>本政策得因法令或業務需要不定期修訂,修訂後將於本頁公告。</p>
      </section>
    </LegalShell>
  );
}
