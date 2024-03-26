<script lang="ts">
    import { iDocJson2Html, type Page } from '../src';
    import Export from './Export.svelte';
    import { interceptIDocJsonRequest } from './intercepter';
    import Preview from './Preview.svelte';
    import Result, { ResultItem } from './Result.svelte';
    import Settings from './Settings.svelte';
    import { makeToast } from './utils';

    const previewUrl = 'https://play.tailwindcss.com/uxo6W8G4dq';

    let currentPage: Page;
    let showPreviewDialog = false;
    let showSettings = false;
    let showExportSettings = false as boolean | 'warn';
    let settingsComp: Settings;
    let generatedHtml: string;
    interceptIDocJsonRequest(page => {
        currentPage = page;
    });

    function onGenerateClick() {
        if (!currentPage) {
            makeToast('当前没有页面', { fontSize: '80px', border: 'error' });
            return;
        } else if (!location.href.match(/develop\/design\//)) {
            makeToast('当前不在开发模式', { fontSize: '80px', border: 'error' });
        }
        generatedHtml = iDocJson2Html(currentPage, settingsComp.settings.configOptions);
        navigator.clipboard.writeText(generatedHtml).then(
            () => {
                makeToast('html代码已复制到剪贴板中', { fontSize: '80px', border: 'success', time: 500 });
                openPreview();
            },
            function (err) {
                makeToast('代码复制失败!', { fontSize: '80px', border: 'error' });
                console.error('Could not copy text: ', err);
            }
        );
    }

    function openSettings() {
        showSettings = true;
    }

    function closeSettings() {
        showSettings = false;
    }

    let alreadyOpened = false;
    function openPreview() {
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
            showPreviewDialog = true;
        } else {
            alreadyOpened = false;
            showPreviewDialog = true;
        }
    }
    function closePreview() {
        showPreviewDialog = false;
    }

    let code = '';
    let warn = false;
    async function onExportClick() {
        code = await navigator.clipboard.readText().catch(err => {
            makeToast('读取剪贴板失败!', { fontSize: '80px', border: 'error' });
            return generatedHtml;
        });

        if (code !== generatedHtml) {
            warn = true;
        } else {
            warn = false;
        }
        openExportSettings();
    }

    function openExportSettings() {
        showExportSettings = true;
    }

    function closeExportSettings() {
        showExportSettings = false;
    }

    let showExportResult = false as false | ResultItem[];
    function openExportResult(results: ResultItem[]) {
        showExportResult = results;
    }

    function closeExportResult() {
        showExportResult = false;
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed right-20 bottom-60 rounded-6 shadow-2xl bg-white p-10" style="z-index:100;">
    <div
        class="flex items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer"
        data-id="generateBtn"
        on:click={onGenerateClick}
    >
        生成html代码
    </div>
    <div
        class="mt-10 items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer hidden"
        class:!flex={!showPreviewDialog}
        data-id="openBtn"
        on:click={openPreview}
    >
        打开预览
        <i
            class="mp-icon iconfont icon-a-18_setting mp-icon-solid-disableHoverColor"
            style="color:white;font-size:18px;line-height:36px;width:40px;height:36px;margin-left:6px;margin-right:-20px"
            on:click={e => {
                e.stopPropagation();
                openSettings();
            }}
        ></i>
    </div>
    <div
        class="mt-10 items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer hidden"
        class:!flex={showPreviewDialog}
        data-id="openBtn"
        on:click={onExportClick}
    >
        导出
    </div>
    <div
        class="fixed left-0 top-0 right-0 bottom-0"
        class:!invisible={!showPreviewDialog}
        data-id="previewDialog"
    >
        <Preview {previewUrl} />
        <div
            class="absolute left-1/2 -translate-x-1/2 top-4 flex items-center"
            style="transform: translateX(-50%)"
        >
            <div
                class="flex items-center px-20 text-16/30 bg-[#ff296d] text-white rounded-6 cursor-pointer"
                data-id="closeBtn"
                on:click={closePreview}
            >
                关闭预览
                <i
                    class="mp-icon iconfont icon-a-18_setting mp-icon-solid-disableHoverColor"
                    style="color:white;font-size:18px;line-height:36px;width:40px;height:36px;margin-left:6px;margin-right:-20px"
                    on:click={e => {
                        e.stopPropagation();
                        openSettings();
                    }}
                ></i>
            </div>
            <div
                class="flex ml-16 items-center justify-center px-10 bg-[#ff296d] text-14/36 text-white rounded-6 cursor-pointer"
                data-id="openBtn"
                on:click={onExportClick}
            >
                导出
            </div>
        </div>
    </div>
    <div class:invisible={!showSettings}>
        <Settings
            bind:this={settingsComp}
            on:close={() => {
                if (showPreviewDialog) {
                    onGenerateClick();
                }
                closeSettings();
            }}
        />
    </div>
    {#if showExportSettings}
        <Export
            warn
            {code}
            on:close={e => {
                closeExportSettings();
                if (e.detail) {
                    openExportResult(e.detail);
                }
            }}
        />
    {/if}
    {#if showExportResult}
        <Result
            results={showExportResult}
            on:close={() => {
                closeExportResult();
            }}
        />
    {/if}
</div>
