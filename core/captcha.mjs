// 校验页识别与处理
import { sleep } from '../cdp.mjs';

export function isVerifyPage(url) {
  return /antispiderShowVerify/.test(url || '');
}

// 读取校验页图片
export async function grabCaptcha(page) {
  return page.eval(`(async () => {
    const img = document.querySelector('img[src*="processVerifyPng"]');
    if (!img) return null;
    const url = img.src.split('&_=')[0] + '&_=' + Date.now();
    const res = await fetch(url, { credentials: 'include' });
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    img.src = url;
    return btoa(s);
  })()`, { awaitPromise: true }).catch(() => null);
}

// 提交校验码
export async function submitCode(page, code) {
  return page.eval(`(() => {
    const input = document.querySelector('#ucode, input[name=ucode]');
    if (!input) return false;
    input.value = ${JSON.stringify(code)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.querySelector('input[type=submit], button[type=submit], button');
    if (btn) btn.click();
    else if (input.form) input.form.submit();
    return true;
  })()`).catch(() => false);
}

// 等待页面离开校验态
export async function waitLeaveVerify(page, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!isVerifyPage(await page.url())) return true;
    await sleep(1000);
  }
  return false;
}
