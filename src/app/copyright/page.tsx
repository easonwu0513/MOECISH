import { auth } from '@/lib/auth';
import { LegalShell } from '@/components/portal/LegalShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: '著作權及資料使用宣告 · MOECISH' };

export default async function CopyrightPage() {
  const session = await auth();
  return (
    <LegalShell authed={!!session} title="著作權及資料使用宣告" subtitle="本網站著作權及連結政策說明。">
      <section>
        <h2>一、著作權聲明</h2>
        <p>本網站(含系統介面、文字、圖示、文件範本等)之著作權,除另有標示或屬第三方所有者外,均歸教育部及維運單位所有。非經書面同意,不得以任何形式重製、改作、散布或為商業利用。</p>
      </section>
      <section>
        <h2>二、政府資料開放</h2>
        <p>本網站如有依《政府資料開放授權條款》或政府資料開放平臺提供之開放資料,其授權與使用方式依各該資料所標示之授權條款辦理。</p>
      </section>
      <section>
        <h2>三、第三方素材</h2>
        <p>本網站使用之開放原始碼套件、字型或圖示,其著作權歸原權利人所有,並依其授權條款使用。</p>
      </section>
      <section>
        <h2>四、連結政策</h2>
        <p>本網站之公開頁面歡迎連結;惟不得以使人誤認與本機關有特定關係之方式為之。連結至本網站以外之第三方網站者,其內容由各該網站自負責任。</p>
      </section>
      <section>
        <h2>五、聯絡方式</h2>
        <p>著作權相關事宜請來信 <a href="mailto:moecish@m365.ntu.edu.tw">moecish@m365.ntu.edu.tw</a>。</p>
      </section>
    </LegalShell>
  );
}
