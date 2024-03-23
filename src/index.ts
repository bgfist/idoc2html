import * as _ from 'lodash';
import { BuildStage, Config, debug, defaultConfig } from './config';
import { Page } from './page';
import { postprocess } from './postprocess';
import { preprocess } from './preprocess';
import { assert, removeEle } from './utils';
import {
    VNode,
    context,
    getClassList,
    getClassName,
    isRole,
    isVoidElement,
    isVoidElementWrapper
} from './vnode';

export * from './config';
export { Page };

function makeAbsolute(vnode: VNode, parent?: VNode, isAttachNode?: boolean) {
    if (parent) {
        const left = vnode.bounds.left - parent.bounds.left;
        const top = vnode.bounds.top - parent.bounds.top;
        if (isAttachNode) {
            vnode.attributes = {
                is: 'attachNode',
                ...vnode.attributes
            };
        }
        vnode.classList.push(
            `${vnode.tagName === 'span' ? '' : 'absolute'} left-[${left}px] top-[${top}px] w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`
        );
    } else {
        vnode.classList.push(`relative w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`);
    }
    _.each(vnode.children, child => makeAbsolute(child, vnode));
    _.each(vnode.attachNodes, child => makeAbsolute(child, vnode, true));
}

/** 将不必要的空元素包装盒去掉 */
function mayLiftVoidElement(vnode: VNode) {
    if (isVoidElementWrapper(vnode) && vnode.children.length === 0 && vnode.attachNodes.length === 1) {
        removeEle(vnode.classList, context.voidElementMarker);
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
function VNode2Code(vnode: VNode, level: number, recursive: boolean): string {
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
        role = ''
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

    if (debug.buildToStage === BuildStage.Pre) {
        if (!debug.keepOriginalTree) {
            const vnodes: VNode[] = [];
            const collectVNodes = (vnode: VNode) => {
                vnode.classList.push(
                    `${
                        isRole(vnode, 'page') ? 'relative'
                        : vnode.tagName === 'span' ? ''
                        : 'absolute'
                    } left-[${vnode.bounds.left}px] top-[${vnode.bounds.top}px] w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`
                );
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
        } else {
            makeAbsolute(vnode);
            return VNode2Code(vnode, 0, true);
        }
    }

    postprocess(vnode);

    if (debug.buildToStage === BuildStage.Tree) {
        makeAbsolute(vnode);
    }

    return VNode2Code(vnode, 0, true);
}
