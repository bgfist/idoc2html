// src/main.ts
import './app.css';
import App from './components/App.svelte';
import { makeToast } from './utils';

declare global {
    interface Window {
        __iDocJson2Html: boolean;
    }
}

if (window.__iDocJson2Html) {
    makeToast('请不要重复加载此脚本!', { fontSize: '80px', border: 'error' });
} else {
    window.__iDocJson2Html = true;

    new App({
        target: document.body,
        props: {
            // 组件属性可以在这里传递
        }
    });
}
