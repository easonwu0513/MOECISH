'use client';

/**
 * 全畫面浮水印(防外流 / 可溯源):平鋪登入者「姓名・信箱」,讓委員/使用者知道其身分已標記於畫面;
 * 截圖或外流可溯源到檢視人。借鏡 ISMS 程序書浮水印做法。
 * - pointer-events-none:不影響任何操作
 * - 低透明度:不干擾閱讀
 * - print:hidden:正式列印/公文輸出不帶個人浮水印(螢幕截圖仍會帶到)
 * 以 SVG data-URI 背景平鋪(單一節點、GPU 合成,效能佳)。
 */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function ScreenWatermark({ name, email }: { name: string; email: string }) {
  const text = `${name}・${email}・禁止外流`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='380' height='190'>` +
    `<text x='12' y='120' transform='rotate(-28 190 95)' font-family='sans-serif' font-size='13' fill='#334155' fill-opacity='0.085'>${escXml(text)}</text>` +
    `</svg>`;
  const backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 print:hidden"
      style={{ backgroundImage, backgroundRepeat: 'repeat' }}
    />
  );
}
