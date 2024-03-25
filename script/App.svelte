<script lang="ts">
    import { iDocJson2Html, type Page } from '../src';
    import { interceptIDocJsonRequest } from './intercepter';
    import Settings from './Settings.svelte';
    import { makeToast } from './utils';

    const previewUrl = 'https://play.tailwindcss.com/uxo6W8G4dq';

    let currentPage: Page;
    let showPreviewDialog = false;
    let showSettings = false;
    let settingsComp: Settings;
    interceptIDocJsonRequest(page => {
        currentPage = page;
    });

    let alreadyOpened = false;
    function onGenerateClick() {
        if (!currentPage) {
            makeToast('当前没有页面', { fontSize: '80px', border: 'error' });
            return;
        } else if (!location.href.match(/develop\/design\//)) {
            makeToast('当前不在开发模式', { fontSize: '80px', border: 'error' });
        }
        const html = iDocJson2Html(currentPage, settingsComp.settings.configOptions);
        navigator.clipboard.writeText(html).then(
            () => {
                makeToast('html代码已复制到剪贴板中', { fontSize: '80px', border: 'success', time: 500 });
                if (settingsComp.settings.previewInNewWindow) {
                    if (alreadyOpened) {
                        return;
                    }
                    window.open(
                        previewUrl,
                        '__blank',
                        `left=100,top=100,width=${window.screen.availWidth},height=${window.screen.availHeight}`
                    );
                    alreadyOpened = true;
                } else {
                    alreadyOpened = false;
                    showPreviewDialog = true;
                }
            },
            function (err) {
                makeToast('代码复制失败!', { fontSize: '80px', border: 'error' });
                console.error('Could not copy text: ', err);
            }
        );
    }
</script>

<div class="fixed right-20 bottom-60 rounded-6 shadow-2xl bg-white p-10" style="z-index:100;">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="flex items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer"
        data-id="generateBtn"
        on:click={onGenerateClick}
    >
        生成html代码
    </div>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="flex mt-10 items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer"
        data-id="openBtn"
        on:click={() => (showPreviewDialog = true)}
    >
        打开预览
        <i
            class="mp-icon iconfont icon-a-18_setting mp-icon-solid-disableHoverColor"
            style="color:white;font-size:18px;line-height:36px;width:40px;height:36px;margin-left:6px;margin-right:-20px"
            on:click={e => {
                e.stopPropagation();
                showSettings = true;
            }}
        ></i>
    </div>
    <div
        class="fixed left-0 top-0 right-0 bottom-0 bg-[#eee]"
        class:invisible={!showPreviewDialog}
        data-id="previewDialog"
    >
        <iframe title="" width="100%" height="100%" src={previewUrl}></iframe>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="flex items-center absolute left-1/2 -translate-x-1/2 top-4 px-20 text-16/30 bg-[#ff296d] text-white rounded-6 cursor-pointer"
            style="transform: translateX(-50%)"
            data-id="closeBtn"
            on:click={() => (showPreviewDialog = false)}
        >
            关闭预览
            <i
                class="mp-icon iconfont icon-a-18_setting mp-icon-solid-disableHoverColor"
                style="color:white;font-size:18px;line-height:36px;width:40px;height:36px;margin-left:6px;margin-right:-20px"
                on:click={e => {
                    e.stopPropagation();
                    showSettings = true;
                }}
            ></i>
        </div>
    </div>
    <div class:invisible={!showSettings}>
        <Settings
            bind:this={settingsComp}
            on:close={() => {
                if (showPreviewDialog) {
                    onGenerateClick();
                }
                showSettings = false;
            }}
        />
    </div>
</div>
