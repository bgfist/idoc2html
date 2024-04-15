import _ from 'lodash';
import { html2VNode } from '../differ/deCompile';
import { debug } from '../main/config';
import tailwindConfigTemplate from '../templates/tailwind.config.template';
import { VNode } from '../vnode';
import * as android from './android';
import * as flutter from './flutter';
import * as harmony from './harmony';
import * as html from './html';
import * as ios from './ios';
import * as jetpackCompose from './jetpackCompose';
import * as miniApp from './miniApp';
import * as reactNative from './reactNative';
import * as swiftUI from './swiftUI';
import { extractColorPresets } from './tailwind/extractColorPresets';
import { extractImagePresets } from './tailwind/extractImagePresets';

export enum TargetPlatform {
    html = 'html',
    miniApp = '小程序',
    flutter = 'Flutter',
    reactNative = 'React Native',
    android = 'Android',
    ios = 'iOS',
    harmony = '鸿蒙',
    swiftUI = 'SwiftUI',
    jetpackCompose = 'JetpackCompose'
}

export interface Generator {
    VNode2Code(vnode: VNode, level: number, recursive: boolean): string;
}

export interface Template {
    code: string;
    description: string;
    title: string;
}

export function html2Platform(
    targetPlatform: string,
    code: string,
    params: {
        useTailwindcss: boolean;
        extractColorPresets: boolean;
        useRemUnit: boolean;
        remBase: number;
        imagePrefix: string;
    }
): Template[] {
    const generators: Record<string, Generator> = {
        html,
        miniApp,
        flutter,
        reactNative,
        android,
        ios,
        harmony,
        swiftUI,
        jetpackCompose
    };
    if (!generators[targetPlatform]) {
        throw new Error(`Unsupported target platform: ${targetPlatform}`);
    }

    function maskDebug<T extends (...args: any[]) => any>(fn: T) {
        return function (...args: any[]) {
            const { showId, showDirection, showSizeSpec } = debug;
            debug.showId = false;
            debug.showDirection = false;
            debug.showSizeSpec = false;

            function resetDebug() {
                debug.showId = showId;
                debug.showDirection = showDirection;
                debug.showSizeSpec = showSizeSpec;
            }

            let res;
            try {
                res = fn.apply(null, args);
            } catch (err) {
                resetDebug();
                throw err;
            }
            resetDebug();
            return res;
        } as T;
    }

    function generateTemplates() {
        let cssTemplate: Template | undefined;
        let htmlTemplate: Template | undefined;
        let configTemplate: Template | undefined;

        configTemplate = {
            code: tailwindConfigTemplate as any,
            title: 'taiwind.config.js',
            description: 'Tailwind配置文件'
        };
        if (params.extractColorPresets) {
            const res = extractColorPresets(code);
            code = res.code;

            if (!_.isEmpty(res.colors)) {
                const colorLines = JSON.stringify(res.colors, null, 4);
                const tabs = _.repeat(' ', 8);
                const tabStart = (str: string) =>
                    str
                        .split('\n')
                        .map(line => tabs + line)
                        .join('\n');
                configTemplate.code = configTemplate.code.replace(
                    'colors: {}',
                    'colors: {\n' + tabStart(colorLines.slice(2))
                );
            }
        }
        if (targetPlatform === 'miniApp') {
            configTemplate.code = configTemplate.code.replace(`i + 'px'`, `i * 2 + 'rpx'`);
            configTemplate.code = configTemplate.code.replace(`*.html`, `*.wxml`);

            // 将图片路径改为预设值
            code = extractImagePresets(code);
            configTemplate.code = configTemplate.code.replace(
                'backgroundImage: {}',
                `backgroundImage: require('fs').readdirSync('这里填你的图片存放路径').reduce((obj, filename) => (obj[require('path').parse(filename).name] = '${params.imagePrefix}' + filename), {})`
            );

            code = splitTextLineHeight(code);

            code = extractNumDivider(code);
            configTemplate.code = configTemplate.code.replace('inset: {}', `inset: { half: '50%' }`);
        } else if (targetPlatform === 'html' && params.useRemUnit) {
            configTemplate.code = configTemplate.code.replace(`i + 'px'`, `i / ${params.remBase} + 'rem'`);
        }

        const vnode = html2VNode(code);

        htmlTemplate = {
            code: generators[targetPlatform].VNode2Code(vnode, 0, true),
            title: 'index' + (targetPlatform === 'html' ? '.html' : '.wxml'),
            description: ''
        };

        return [htmlTemplate, configTemplate, cssTemplate].filter(t => t) as Template[];
    }

    return maskDebug(generateTemplates)();
}
