import { BuildStage, Config, debug, defaultConfig } from "./config";
import { Page } from "./page";
import { postprocess } from "./postprocess";
import { preprocess } from "./preprocess";
import { assert } from "./utils";
import { SizeSpec, VNode, getClassName } from "./vnode";
import * as _ from 'lodash';

const TAB = '  ';

/**
 * 根据vnode信息生成html代码
 * 
 * @param vnode 
 * @param level 
 * @param recursive 是否递归生成
 * @returns 
 */
function VNode2Code(vnode: VNode, level: number, recursive: boolean): string {
    const tab = TAB.repeat(level);
    let { tagName = 'div', classList, style, attributes, children, attachNodes, textContent = '', role = '' } = vnode;
    const prependAttrs: Record<string, string> = {};
    if (debug.showId) {
        prependAttrs['id'] = vnode.id || '';
    }
    if (defaultConfig.codeGenOptions.role) {
        prependAttrs['role'] = role;
    }
    if (debug.showSizeSpec) {
        prependAttrs['w'] = vnode.widthSpec || SizeSpec.Unknown;
        prependAttrs['h'] = vnode.heightSpec || SizeSpec.Unknown;
    }
    attributes = {
        ...prependAttrs,
        ...attributes,
    };

    classList.length && Object.assign(attributes, { class: getClassName(vnode) });
    style && Object.assign(attributes, { style: Object.entries(style).map(([key, value]) => `${_.kebabCase(key)}: ${value}`).join(';') });
    attributes = _.omitBy(attributes, v => _.isNil(v) || v === '');
    const attributesString = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');

    children = _.concat(children || [], attachNodes || []);

    if (_.isArray(textContent)) {
        textContent = _.map(textContent, n => (VNode2Code(n, level + 1, recursive))).join('\n');
    }

    if (children && children.length && recursive) {
        // 文本节点可能有依附的绝对定位元素, 文本保持最高层级
        if (textContent) {
            textContent = `\n${tab}${TAB}<div class="relative z-10">${textContent}</div>`;
        }
        return `${tab}<${tagName} ${attributesString}>${textContent}\n${children.map(n => VNode2Code(n, level + 1, recursive)).join('\n')}\n${tab}</${tagName}>`;
    }
    return `${tab}<${tagName} ${attributesString}>${textContent}</${tagName}>`;
}

export * from './config';

/** 
 * 将幕客设计稿json转成html代码 
 * 
 * @param page 幕客设计稿json
 * @param config 生成配置
 * @returns 可用的html代码，样式用tailwind.css实现
 */
export function iDocJson2Html(page: Page, config?: Config) {
    _.merge(defaultConfig, config);

    const root = page.layers || (page as unknown as Node);
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

    // 先遍历整棵树，进行预处理，删除一些不必要的节点，将节点的前景背景样式都计算出来，对节点进行分类标记
    const vnode = preprocess(root, 0)!;

    if (!debug.keepOriginalTree) {
        ; (function unwrapAllNodes() {
            const vnodes: VNode[] = [];
            const collectVNodes = (vnode: VNode) => {
                vnodes.push(vnode);
                _.each(vnode.children, collectVNodes);
                vnode.children = [];
            };
            _.each(vnode.children, collectVNodes);
            vnode.children = vnodes;
        })();
    }

    postprocess(vnode);

    if (debug.buildToStage === BuildStage.Pre) {
        const vnodes: VNode[] = [];
        const collectVNodes = (vnode: VNode) => {
            vnode.classList.push(`${vnode.role === 'page' ? 'relative' : vnode.tagName === 'span' ? '' : 'absolute'} left-[${vnode.bounds.left}px] top-[${vnode.bounds.top}px] w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`);
            vnodes.push(vnode);
            _.each(vnode.children, collectVNodes);
        };
        collectVNodes(vnode);
        vnodes.sort((a, b) => {
            if (a.bounds.top === b.bounds.top) {
                if (a.bounds.left === b.bounds.left) {
                    return 0;
                } else {
                    return a.bounds.left - b.bounds.left;
                }
            } else {
                return a.bounds.top - b.bounds.top;
            }
        });
        return vnodes.map(n => VNode2Code(n, 0, false)).join('\n');
    } else if (debug.buildToStage === BuildStage.Tree) {
        const makeAbsolute = (vnode: VNode, parent?: VNode, isAttachNode?: boolean) => {
            if (parent) {
                const left = vnode.bounds.left - parent.bounds.left;
                const top = vnode.bounds.top - parent.bounds.top;
                if (isAttachNode) {
                    vnode.attributes = {
                        is: 'attachNode',
                        ...vnode.attributes
                    };
                }
                vnode.classList.push(`${vnode.tagName === 'span' ? '' : 'absolute'} left-[${left}px] top-[${top}px] w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`);
            } else {
                vnode.classList.push(`relative w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`);
            }
            _.each(vnode.children, child => makeAbsolute(child, vnode));
            _.each(vnode.attachNodes, child => makeAbsolute(child, vnode, true));
        };
        makeAbsolute(vnode);
        return VNode2Code(vnode, 0, true);
    } else {
        return VNode2Code(vnode, 0, true);
    }
}