import { Page } from "./page";
import { postprocess } from "./postprocess";
import { preprocess } from "./preprocess";
import { assert } from "./utils";
import { SizeSpec, VNode } from "./vnode";
import * as _ from 'lodash';

export let debug = true;

const TAB = '  ';
function VNode2Code(vnode: VNode, level: number): string {
    const tab = TAB.repeat(level);
    let { tagName = 'div', classList, style, attributes, children, attachNodes, textContent, role = '' } = vnode;
    attributes = {
        ...attributes,
        role
    };
    if (debug) {
        attributes['w'] = vnode.widthSpec || SizeSpec.Unknown;
        attributes['h'] = vnode.heightSpec || SizeSpec.Unknown;
    }

    classList.length && Object.assign(attributes, { class: classList.filter(Boolean).join(' ') });
    style && Object.assign(attributes, { style: Object.entries(style).map(([key, value]) => `${_.kebabCase(key)}: ${value}`).join(';') });
    attributes = _.omitBy(attributes, v => _.isNil(v) || v === '');
    const attributesString = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');

    children = _.concat(children || [], attachNodes || []);

    if (children && children.length) {
        return `${tab}<${tagName} ${attributesString}>\n${children?.map(n => VNode2Code(n, level + 1)).join('\n')}\n${tab}</${tagName}>`;
    } else if (textContent) {
        if (!_.isArray(textContent)) {
            return `${tab}<${tagName} ${attributesString}>${textContent}</${tagName}>`;
        } else {
            return `${tab}<${tagName} ${attributesString}>${_.map(textContent, n => (VNode2Code(n, level + 1))).join('\n')}${tab}</${tagName}>`;
        }
    } else {
        return `${tab}<${tagName} ${attributesString}></${tagName}>`;
    }
}

function page2VNode(page: Page) {
    const root = page.layers || (page as unknown as Node);
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

    // 先遍历整棵树，进行预处理，删除一些不必要的节点，将节点的前景背景样式都计算出来，对节点进行分类标记
    const vnode = preprocess(root, 0)!;
    postprocess(vnode);

    return vnode;
}

/** 将幕客设计稿json转成html代码 */
export function transform(page: Page) {
    return VNode2Code(page2VNode(page), 0);
}