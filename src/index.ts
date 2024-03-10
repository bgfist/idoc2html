import { debug, defaultConfig } from "./config";
import { Page } from "./page";
import { postprocess } from "./postprocess";
import { preprocess } from "./preprocess";
import { assert } from "./utils";
import { SizeSpec, VNode } from "./vnode";
import * as _ from 'lodash';

const TAB = '  ';
function VNode2Code(vnode: VNode, level: number): string {
    const tab = TAB.repeat(level);
    let { tagName = 'div', classList, style, attributes, children, attachNodes, textContent, role = '' } = vnode;
    attributes = {
        ...attributes,
    };
    if (defaultConfig.codeGenOptions.role) {
        attributes['role'] = role;
    }
    if (debug.sizeSpec) {
        attributes['w'] = vnode.widthSpec || SizeSpec.Unknown;
        attributes['h'] = vnode.heightSpec || SizeSpec.Unknown;

        if (debug.buildPreOnly) {
            classList.push(`${vnode.role === 'page' ? 'relative' : tagName === 'span' ? '' : 'absolute'} ${vnode.textContent ? 'z-10' : ''} left-[${vnode.bounds.left}px] top-[${vnode.bounds.top}px] w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`);
        }
    }

    classList.length && Object.assign(attributes, { class: classList.filter(Boolean).join(' ') });
    style && Object.assign(attributes, { style: Object.entries(style).map(([key, value]) => `${_.kebabCase(key)}: ${value}`).join(';') });
    attributes = _.omitBy(attributes, v => _.isNil(v) || v === '');
    const attributesString = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');

    children = _.concat(children || [], attachNodes || []);

    if (_.isArray(textContent)) {
        textContent = _.map(textContent, n => (VNode2Code(n, level + 1))).join('\n');
    }

    if (children && children.length && debug.buildPreOnly) {
        return `${tab}<${tagName} ${attributesString}>\n${children?.map(n => VNode2Code(n, level + 1)).join('\n')}\n${tab}</${tagName}>`;
    }
    return `${tab}<${tagName} ${attributesString}>${textContent || ''}</${tagName}>`;
}

function page2VNode(page: Page) {
    const root = page.layers || (page as unknown as Node);
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

    // 先遍历整棵树，进行预处理，删除一些不必要的节点，将节点的前景背景样式都计算出来，对节点进行分类标记
    const vnode = preprocess(root, 0)!;

    if (!debug.buildPreOnly) {
        postprocess(vnode);
    }

    return vnode;
}

type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
export type Config = DeepPartial<typeof defaultConfig>;

/** 将幕客设计稿json转成html代码 */
export function transform(page: Page, config?: Config) {
    _.merge(defaultConfig, config);

    const vnode = page2VNode(page)

    if (debug.buildPreOnly) {
        let vnodes: VNode[] = [];
        const collectVNodes = (vnode: VNode) => {
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
        return vnodes.map(n => VNode2Code(n, 0)).join('\n');
    }

    return VNode2Code(vnode, 0);
}