import { Page } from '../page';
import { debug, iDocJson2Html } from '..';

main();

/** 拦截幕客设计稿json请求 */
function interceptIDocJsonRequest(callback: (page: Page) => void) {
    // 保存原始的open方法
    var originalOpen = XMLHttpRequest.prototype.open;
    // 重写open方法以拦截请求
    XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        async?: boolean,
        user?: string | null,
        password?: string | null
    ) {
        this.addEventListener(
            'readystatechange',
            function () {
                const [pathname] = url.toString().split('?');
                if (this.readyState === 4 && pathname.endsWith('.json')) {
                    try {
                        var responseJSON = JSON.parse(this.responseText);
                        console.log('从XMLHttpRequest拦截到幕客设计稿json请求');
                        callback(responseJSON);
                    } catch (error) {
                        console.error('Error parsing JSON response:', error);
                    }
                }
            },
            false
        );
        originalOpen.call(this, method, url, async!, user, password);
    };
    // 保存原始的fetch方法
    var originalFetch = window.fetch;
    // 重写fetch方法以拦截请求
    window.fetch = function (input, init) {
        return originalFetch.call(this, input, init).then(response => {
            // 检查响应URL是否以.json结尾
            if (typeof input === 'string' && input.endsWith('.json')) {
                // 解析响应体为JSON
                return response.json().then(json => {
                    console.log('从fetch拦截到幕客设计稿json请求');
                    callback(json);
                    return response; // 返回原始响应
                });
            } else {
                // 如果不是.json请求，直接返回响应
                return response;
            }
        });
    };
}

function createPanelUI(props: { onGenerateClick(): void }) {
    const settings = {
        previewInNewWindow: false,
        showId: false
    };
    const cacheSettings = JSON.parse(localStorage.getItem('iDocJson2HtmlSettings') || '{}');
    Object.assign(settings, cacheSettings);

    const panel = document.createElement('div');
    panel.innerHTML = `
<div>
    <style>
    .invisible{
        visibility: hidden;
      }
      
      .fixed{
        position: fixed;
      }
      
      .absolute{
        position: absolute;
      }
      
      .bottom-0{
        bottom: 0;
      }
      
      .bottom-60{
        bottom: 60px;
      }
      
      .left-0{
        left: 0;
      }
      
      .left-1\\\/2{
        left: 50%;
      }
      
      .right-0{
        right: 0;
      }
      
      .right-20{
        right: 20px;
      }
      
      .top-0{
        top: 0;
      }
      
      .top-4{
        top: 4px;
      }
      
      .mt-10{
        margin-top: 10px;
      }
      
      .flex{
        display: flex;
      }
      
      .-translate-x-1\\\/2{
        --tw-translate-x: -50%;
        transform: translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
      }
      
      .cursor-pointer{
        cursor: pointer;
      }
      
      .items-center{
        align-items: center;
      }
      
      .justify-center{
        justify-content: center;
      }
      
      .rounded-6{
        border-radius: 6px;
      }
      
      .bg-\\\[\\\#eee\\\]{
        --tw-bg-opacity: 1;
        background-color: rgb(238 238 238 / var(--tw-bg-opacity));
      }
      
      .bg-\\\[\\\#ff296d\\\]{
        --tw-bg-opacity: 1;
        background-color: rgb(255 41 109 / var(--tw-bg-opacity));
      }
      
      .bg-white{
        background-color: hsla(0, 0%, 100%, 1);
      }
      
      .p-10{
        padding: 10px;
      }
      
      .px-20{
        padding-left: 20px;
        padding-right: 20px;
      }
      
      .text-16\\\/30{
        font-size: 16px;
        line-height: 30px;
      }
      
      .text-16\\\/36{
        font-size: 16px;
        line-height: 36px;
      }
      
      .text-white{
        color: hsla(0, 0%, 100%, 1);
      }
      
      .shadow-2xl{
        --tw-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
        --tw-shadow-colored: 0 25px 50px -12px var(--tw-shadow-color);
        box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
      }      
    </style>
    <div class="fixed right-20 bottom-60 rounded-6 shadow-2xl bg-white p-10" style="z-index:100;">
    <div class="flex items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer" data-id="generateBtn">生成html代码</div>
    <div class="mt-10 flex items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer" data-id="openBtn">打开预览</div>
    <div class="fixed left-0 top-0 right-0 bottom-0 bg-[#eee] invisible" data-id="previewDialog">
      <iframe width="100%" height="100%" src="https://play.tailwindcss.com/uxo6W8G4dq"></iframe>
      <div class="absolute left-1/2 -translate-x-1/2 top-4 px-20 text-16/30 bg-[#ff296d] text-white rounded-6 cursor-pointer" data-id="closeBtn">关闭预览</div>
    </div>
  </div>
</div>
`;
    const previewDialog = panel.querySelector('[data-id="previewDialog"]')!;
    const generateBtn = panel.querySelector('[data-id="generateBtn"]')!;
    const openBtn = panel.querySelector('[data-id="openBtn"]')!;
    const closeBtn = panel.querySelector('[data-id="closeBtn"]')!;
    document.body.append(panel);

    function goPreview() {
        previewDialog.classList.remove('invisible');
    }

    generateBtn.addEventListener('click', props.onGenerateClick);
    openBtn.addEventListener('click', goPreview);
    closeBtn.addEventListener('click', () => {
        previewDialog.classList.add('invisible');
    });

    return {
        goPreview
    };
}

function main() {
    let currentPage: Page;

    const panel = createPanelUI({
        onGenerateClick() {
            if (!currentPage) {
                alert('当前没有页面');
                return;
            } else if (!location.href.match(/develop\/design\//)) {
                alert('当前不在开发模式');
            }
            debug.showId = true;
            debug.showDirection = true;
            debug.showSizeSpec = true;
            const html = iDocJson2Html(currentPage);
            navigator.clipboard.writeText(html).then(
                () => {
                    alert('html代码已复制到剪贴板中');
                    panel.goPreview();
                },
                function (err) {
                    alert('代码复制失败!');
                    console.error('Could not copy text: ', err);
                }
            );
        }
    });

    interceptIDocJsonRequest(page => {
        currentPage = page;
    });
}
