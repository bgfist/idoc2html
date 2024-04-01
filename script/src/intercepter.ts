import type { Page } from '../../src';

/** 拦截幕客设计稿json请求 */
export function interceptIDocJsonRequest(callback: (page: Page) => void) {
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
