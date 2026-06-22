import { auth } from '@/lib/auth';
import { LegalShell } from '@/components/portal/LegalShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: '服務條款 · MOECISH' };

export default async function TermsPage() {
  const session = await auth();
  return (
    <LegalShell authed={!!session} title="服務條款" subtitle="使用本系統前請詳閱下列條款。">
      <section>
        <h2>一、適用範圍</h2>
        <p>本條款適用於 MOECISH 資通安全稽核管考平台(下稱「本系統」)之所有使用者。使用者於登入並使用本系統時,視為已閱讀、瞭解並同意本條款。</p>
      </section>
      <section>
        <h2>二、帳號與權限</h2>
        <p>帳號由中心或所屬機關依職務建立並指派角色(最高管理員、稽核委員、機關承辦)。各角色之功能與資料範圍依權限控管,使用者不得逾越所授予之權限。</p>
      </section>
      <section>
        <h2>三、使用者義務</h2>
        <ul>
          <li>妥善保管帳號與密碼,不得轉讓、共用或交付他人使用。</li>
          <li>所填載之資料應確保正確,並依稽核作業規範辦理。</li>
          <li>不得從事破壞系統運作、未授權存取、或危害他人資料安全之行為。</li>
          <li>對於因業務知悉之稽核內容與機關弱點資訊,負保密義務。</li>
        </ul>
      </section>
      <section>
        <h2>四、智慧財產權</h2>
        <p>本系統之程式、介面、文件及非由使用者填載之內容,其著作權及相關智慧財產權歸主辦及維運單位所有。使用者填載之資料,授權本系統於前述蒐集目的範圍內處理與利用。</p>
      </section>
      <section>
        <h2>五、服務變更與中斷</h2>
        <p>本系統得因維護、升級、不可抗力或主管機關要求,暫停或變更全部或部分服務,並儘可能事前公告。</p>
      </section>
      <section>
        <h2>六、責任限制</h2>
        <p>本系統依現況提供服務。於法令許可範圍內,對於因不可歸責於維運單位之事由所生之損害,不負賠償責任。</p>
      </section>
      <section>
        <h2>七、準據法與管轄</h2>
        <p>本條款以中華民國法律為準據法;因本系統所生之爭議,以維運單位所在地之地方法院為第一審管轄法院。</p>
      </section>
    </LegalShell>
  );
}
