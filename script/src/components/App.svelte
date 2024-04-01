<script lang="ts">
    import { iDocJson2Html, type Page, ImageResize } from '../../../src';
    import Export from './Export.svelte';
    import { interceptIDocJsonRequest } from '../intercepter';
    import Preview from './Preview.svelte';
    import Result, { ResultItem } from './Result.svelte';
    import Settings from './Settings.svelte';
    import { makeToast } from '../utils';

    const previewUrl = 'https://play.tailwindcss.com/Dz6aGsv8WA';

    let currentPage: Page;
    let showPreviewDialog = false;
    let showSettings = false;
    let showExportSettings = false as boolean | 'warn';
    let settingsComp: Settings;
    let generatedHtml: string;
    let defaultImageResize: ImageResize = 1;
    interceptIDocJsonRequest(page => {
        currentPage = page;
    });

    function calcImageResize() {
        const { width, height } = currentPage.layers.bounds;
        if (width === 375 || height === 375) {
            defaultImageResize = 2;
        } else if (width === 750 || height === 750) {
            defaultImageResize = 1;
        } else if (width > 800 || height > 800) {
            // PC
            defaultImageResize = 4;
        }
    }

    function onGenerateClick() {
        if (!currentPage) {
            makeToast('当前没有页面', { fontSize: '80px', border: 'error' });
            return;
        }
        generatedHtml = iDocJson2Html(currentPage, settingsComp.settings.configOptions);
        calcImageResize();
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
        // 去掉windows下可能生成了\r\n,我们只要\n
        code = code.replace(/\r/g, '');

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

    let showExportResult = false;
    let exportResults: ResultItem[] = [];
    function openExportResult() {
        showExportResult = true;
    }

    function closeExportResult() {
        showExportResult = false;
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    class="fixed right-20 bottom-60 rounded-6 shadow-2xl bg-white p-10 text-[#333] {!currentPage ?
        'border-2 border-solid border-[#ff296d]'
    :   ''}"
    style="z-index:100;"
>
    {#if currentPage}
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
            <i
                class="mp-icon iconfont icon-a-18_history background-icon-wrap mp-icon-solid-disableHoverColor"
                class:!hidden={!exportResults.length}
                style="color:white;font-size:17px;line-height:36px;width:40px;height:36px;margin-left:6px;margin-right:-20px"
                on:click={e => {
                    e.stopPropagation();
                    openExportResult();
                }}
            ></i>
        </div>
    {:else}
        <div class="text-16/30 text-[#ff296d] text-center">
            {#if !location.pathname.match(/\/app\//) || location.pathname.match(/\/design$/)}
                请先选择设计稿页面<br />
                并双击进入详情
            {:else}
                请先切换一下设计稿
            {/if}
        </div>
    {/if}
    <div
        class="fixed left-0 top-0 right-0 bottom-0 pointer-events-none"
        class:!invisible={!showPreviewDialog}
        data-id="previewDialog"
    >
        <Preview {previewUrl} />
        <div
            class="absolute left-1/2 -translate-x-1/2 top-4 flex items-center pointer-events-auto"
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
                class="flex ml-16 items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer"
                data-id="openBtn"
                on:click={onExportClick}
            >
                导出
                <i
                    class="mp-icon iconfont icon-a-18_history background-icon-wrap mp-icon-solid-disableHoverColor"
                    class:!hidden={!exportResults.length}
                    style="color:white;font-size:17px;line-height:36px;width:40px;height:36px;margin-left:6px;margin-right:-20px"
                    on:click={e => {
                        e.stopPropagation();
                        openExportResult();
                    }}
                ></i>
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
            {warn}
            {code}
            imageResize={defaultImageResize}
            prefix={settingsComp.settings.localImagePrefix}
            tinypngApiKey={settingsComp.settings.tinypngApiKey}
            on:close={e => {
                closeExportSettings();
                if (e.detail) {
                    exportResults = e.detail;
                    openExportResult();
                }
            }}
        />
    {/if}
    {#if showExportResult}
        <Result
            results={exportResults}
            on:close={() => {
                closeExportResult();
            }}
        />
    {/if}
</div>
