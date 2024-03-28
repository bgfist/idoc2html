<script lang="ts">
    import { replaceHtmlImages } from '../src';
    import { ImageResize, TargetPlatform } from '../src/generator';
    import { ResultItem } from './Result.svelte';
    import { makeToast } from './utils';
    import { createEventDispatcher } from 'svelte';

    const dispatcher = createEventDispatcher<{
        close: ResultItem[] | false;
    }>();
    export let warn = false;
    export let code = '';
    export let prefix = '';
    export let tinypngApiKey = '';
    export let imageResize: ImageResize = 1;

    let useTailwindcss = true;
    let useTinypngCompress = false;
    let uploadImage2Remote = false;
    let targetPlatform = 'html';
    let exporting = false;

    function onCloseClick() {
        dispatcher('close', false);
    }

    async function exportReplaceImage() {
        if (exporting) {
            return;
        }

        if (useTinypngCompress && !tinypngApiKey) {
            makeToast('请先去设置中配置tinypng的API KEY', { fontSize: '80px', border: 'success', time: 3000 });
            return;
        }

        exporting = true;
        const { code: html, noImages } = await replaceHtmlImages({
            html: code,
            prefix,
            imageResize,
            uploadImage2Remote,
            useTinypngCompress,
            tinypngApiKey
        }).finally(() => {
            exporting = false;
        });
        if (noImages === 'processedBefore') {
            makeToast('图片已经处理过了', { fontSize: '80px', border: 'success' });
        } else if (noImages) {
            makeToast('代码中没有要处理的图片!', { fontSize: '80px', border: 'success' });
        } else {
            makeToast(uploadImage2Remote ? '图片上传成功' : '图片下载成功', { fontSize: '80px', border: 'success' });
        }
        dispatcher('close', [
            {
                code: html,
                title: 'index.html',
                description: ''
            }
        ]);
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed left-0 right-0 top-0 bottom-0 bg-[hsla(0,0%,0%,0.6)] flex justify-center pt-63 items-start">
    <div class="bg-white rounded-16 p-20 flex flex-col w-650 relative">
        <i
            class="mp-icon iconfont icon-a-18_close_normal mp-icon-solid-disableHoverColor absolute top-10 right-10"
            style="color:#333;font-size:22px;line-height:36px;width:40px;height:36px;"
            on:click={onCloseClick}
        ></i>

        <h1 class="text-center mt-0 mb-8 text-26">导出配置</h1>
        {#if warn}
            <div class="mb-20 text-[#d28d02] text-14/20 p-10 border-2 border-dotted">
                剪贴板内容跟生成的代码不一致，请确认是否只需导出部分代码
            </div>
        {/if}

        <h2>基本选项</h2>
        <div class="flex text-16/30 my-6">
            <div class="mr-10 font-bold">平台:</div>
            <select class="cursor-pointer" bind:value={targetPlatform}>
                {#each Object.entries(TargetPlatform) as [value, label]}
                    <option class="cursor-pointer" {value}>{label}</option>
                {/each}
            </select>
        </div>

        <h2 class="mt-20 mb-8">样式选项</h2>
        <label class="cursor-pointer flex items-center w-200">
            <input type="checkbox" class="w-15 h-15" bind:checked={useTailwindcss} />
            <span class="text-16/30 ml-6">使用tailwindcss</span>
        </label>

        <h2 class="mt-20 mb-8">图片选项</h2>
        <div class="flex text-16/30 my-6">
            <div class="mr-10">图片尺寸:</div>
            <select class="cursor-pointer" bind:value={imageResize}>
                <option class="cursor-pointer" value={4}>1倍图（PC默认采用1倍图）</option>
                <option class="cursor-pointer" value={2}>2倍图（h5默认采用2倍图）</option>
                <option class="cursor-pointer" value={1}>4倍图（原始预览图片）</option>
            </select>
        </div>
        <!-- 有跨域问题 -->
        <!-- <label class="cursor-pointer flex items-center w-200">
            <input type="checkbox" class="w-15 h-15" bind:checked={useTinypngCompress} />
            <span class="text-16/30 ml-6">是否用tinypng压缩图片</span>
        </label> -->
        <div>
            <label class="cursor-pointer flex items-center w-200">
                <input type="checkbox" class="w-15 h-15" bind:checked={uploadImage2Remote} />
                <span class="text-16/30 ml-6">图片上传到远端</span>
            </label>
            <label class="flex items-center my-10 text-16/28">
                <span class="text-16/30 mr-20 italic">图片导出路径</span>
                <input type="text" class="flex-1 rounded-6 py-0 px-8 border text-16/28" value={prefix} />
            </label>
        </div>

        <div
            class="flex items-center justify-center px-20 bg-[#ff296d] text-16/36 text-white rounded-6 w-160 h-44 self-end mt-30 {(
                exporting
            ) ?
                'pointer-events-none cursor-not-allowed opacity-50'
            :   'cursor-pointer'}"
            data-id="generateBtn"
            on:click={exportReplaceImage}
        >
            {exporting ? '导出中...' : '确定'}
        </div>
    </div>
</div>
