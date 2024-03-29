import * as _ from 'lodash';
import { VNode, context, getClassList, getClassName, isVoidElement, isVoidElementWrapper } from '../vnode';
import { debug, defaultConfig } from '../main/config';
import { removeEle, assert } from '../utils';

/** 将不必要的空元素包装盒去掉 */
function mayLiftVoidElement(vnode: VNode) {
    if (isVoidElementWrapper(vnode)) {
        removeEle(vnode.classList, context.voidElementMarker);
        vnode.tagName = 'div';

        const canRemoveWrapper = vnode.children.length === 0 && vnode.attachNodes.length === 1;
        if (!canRemoveWrapper) {
            return;
        }

        const voidElement = vnode.attachNodes[0];
        assert(
            isVoidElement(voidElement) && !voidElement.textContent && !voidElement.children.length,
            `不是有效的空元素`
        );
        if (voidElement.id) {
            vnode.id = voidElement.id;
        }
        vnode.tagName = voidElement.tagName;
        // 去掉定位和宽高类的class
        const validClassList = _.filter(
            getClassList(voidElement),
            cls =>
                cls !== 'absolute' &&
                !cls.startsWith('left-') &&
                !cls.startsWith('top-') &&
                !cls.startsWith('right-') &&
                !cls.startsWith('bottom-') &&
                !cls.startsWith('w-') &&
                !cls.startsWith('h-')
        );
        vnode.classList = _.union(vnode.classList, validClassList);
        vnode.style = _.merge(vnode.style, voidElement.style);
        vnode.attributes = _.merge(vnode.attributes, voidElement.attributes);
        vnode.role = _.merge(vnode.role, voidElement.role);
        vnode.attachNodes = [];
    }
}

const TAB = '  ';

/**
 * 根据vnode信息生成html代码
 *
 * @param vnode
 * @param level
 * @param recursive 是否递归生成
 * @returns
 */
export function VNode2Code(vnode: VNode, level: number, recursive: boolean): string {
    mayLiftVoidElement(vnode);
    const tab = TAB.repeat(level);
    let {
        tagName = 'div',
        classList,
        style,
        attributes,
        children,
        attachNodes,
        textContent = '',
        role
    } = vnode;
    const prependAttrs: Record<string, string> = {};
    if (debug.showId) {
        prependAttrs['id'] = vnode.id || '';
    }
    if (defaultConfig.codeGenOptions.role) {
        prependAttrs['role'] = _.uniq(role).join(',');
    }
    if (debug.showDirection) {
        prependAttrs['d'] = vnode.direction || '';
    }
    if (debug.showSizeSpec) {
        prependAttrs['w'] = vnode.widthSpec || '';
        prependAttrs['h'] = vnode.heightSpec || '';
    }
    attributes = {
        ...prependAttrs,
        ...attributes
    };

    if (classList.length) {
        Object.assign(attributes, { class: getClassName(vnode) });
    }
    if (style) {
        Object.assign(attributes, {
            style: Object.entries(style)
                .map(([key, value]) => `${key}: ${value}`)
                .join(';')
        });
    }
    attributes = _.omitBy(attributes, v => _.isNil(v) || v === '');
    const attributesString = Object.entries(attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

    children = _.concat(children || [], attachNodes || []);

    if (_.isArray(textContent)) {
        textContent = `\n${_.map(textContent, n => VNode2Code(n, level + 1, recursive)).join('\n')}\n${tab}`;
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
