import * as _ from 'lodash';
import { assert, numEq, numGt, numGte, numLt, numLte, removeEle } from '../utils';
import { Direction, Role, VNode, context } from './';

type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** 仅便于调试 */
export function newVNode(
    vnode: OptionalKeys<VNode, 'children' | 'classList' | 'attributes' | 'style' | 'role' | 'attachNodes'>
): VNode {
    return {
        classList: [],
        children: [],
        attachNodes: [],
        attributes: {},
        style: {},
        role: [],
        ...vnode
    };
}

export function getClassName(vnode: VNode) {
    return getClassList(vnode).join(' ');
}

export function getClassList(vnode: VNode) {
    return vnode.classList.join(' ').split(' ').filter(Boolean);
}

export function isRole(vnode: VNode, role: Role) {
    return _.includes(vnode.role, role);
}

export function addRole(vnode: VNode, role: Role) {
    vnode.role.push(role);
}

export function removeRole(vnode: VNode, role: Role) {
    removeEle(vnode.role, role);
}

/**
 * 规范className
 *
 * 将className中的负号前移
 * @param removeZero 是否去掉带0值的className
 */
export function normalizeClassName(className: string, removeZero: boolean) {
    return className.replace(
        /(\s?)(\S+?-)(-?\d+)(\s|$)/g,
        function (substring: string, ...[$0, $1, $2, $3]: any[]) {
            if ($2[0] === '-') {
                $2 = $2.substring(1);
                $1 = '-' + $1;
            } else if (removeZero && $2[0] == 0) {
                return $3;
            }
            return $0 + $1 + $2 + $3;
        }
    );
}

export function R(strings: TemplateStringsArray, ...values: any[]) {
    // strings 是一个包含模板字符串静态部分的数组
    // values 是模板字符串中插入的表达式的值
    // 在这里可以添加自定义的逻辑来处理字符串和值
    let result = '';
    // 可以遍历 strings 数组和 values 数组来构建结果字符串
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            // 这里可以添加自定义的逻辑来处理每个值
            result += values[i];
        }
    }
    return normalizeClassName(result, true);
}

/** 将className中的负号前移 */
export function R2(strings: TemplateStringsArray, ...values: any[]) {
    // strings 是一个包含模板字符串静态部分的数组
    // values 是模板字符串中插入的表达式的值
    // 在这里可以添加自定义的逻辑来处理字符串和值
    let result = '';
    // 可以遍历 strings 数组和 values 数组来构建结果字符串
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            // 这里可以添加自定义的逻辑来处理每个值
            result += values[i];
        }
    }
    return normalizeClassName(result, false);
}

/** 两个盒子是否一样大 */
export function isEqualBox(a: VNode, b: VNode) {
    return numEq(a.bounds.width, b.bounds.width) && numEq(a.bounds.height, b.bounds.height);
}

export function isContainedWithinX(child: VNode, parent: VNode) {
    return numGte(child.bounds.left, parent.bounds.left) && numLte(child.bounds.right, parent.bounds.right);
}

export function isContainedWithinY(child: VNode, parent: VNode) {
    return numGte(child.bounds.top, parent.bounds.top) && numLte(child.bounds.bottom, parent.bounds.bottom);
}

/** 处理元素之间的包含关系 */
export function isContainedWithin(child: VNode, parent: VNode) {
    return isContainedWithinX(child, parent) && isContainedWithinY(child, parent);
}

export function isOverlappingX(child: VNode, parent: VNode) {
    return numLt(child.bounds.left, parent.bounds.right) && numGt(child.bounds.right, parent.bounds.left);
}

export function isOverlappingY(child: VNode, parent: VNode) {
    return numLt(child.bounds.top, parent.bounds.bottom) && numGt(child.bounds.bottom, parent.bounds.top);
}

/** 处理元素之间的重叠关系 */
export function isOverlapping(child: VNode, parent: VNode) {
    return isOverlappingX(child, parent) && isOverlappingY(child, parent);
}

export function getIntersectionArea(a: VNode, b: VNode) {
    return (
        (Math.min(a.bounds.right, b.bounds.right) - Math.max(a.bounds.left, b.bounds.left)) *
        (Math.min(a.bounds.bottom, b.bounds.bottom) - Math.max(a.bounds.top, b.bounds.top))
    );
}

export function getMiddleLine(vnode: VNode, direction: Direction) {
    if (direction === Direction.Row) {
        return vnode.bounds.left + vnode.bounds.width / 2;
    } else {
        return vnode.bounds.top + vnode.bounds.height / 2;
    }
}

export function getItemGaps(vnodes: VNode[], direction: Direction) {
    assert(vnodes.length > 1, '至少两个元素才能计算间距');
    const gaps = vnodes.slice(1).map((current, index) => {
        const prev = vnodes[index];
        if (direction === Direction.Row) {
            return current.bounds.left - prev.bounds.right;
        } else {
            return current.bounds.top - prev.bounds.bottom;
        }
    });
    return gaps;
}

/** 获取一堆节点的边界 */
export function getBounds(nodes: VNode[]) {
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = Infinity;
    let maxBottom = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        minLeft = Math.min(minLeft, node.bounds.left);
        maxRight = Math.max(maxRight, node.bounds.right);
        minTop = Math.min(minTop, node.bounds.top);
        maxBottom = Math.max(maxBottom, node.bounds.bottom);
    }
    return {
        left: minLeft,
        top: minTop,
        right: maxRight,
        bottom: maxBottom,
        width: maxRight - minLeft,
        height: maxBottom - minTop
    };
}

/** flex盒子方向一横一竖 */
export function isCrossDirection(a: VNode, b: VNode) {
    return a.direction && b.direction && a.direction !== b.direction;
}

export function isTextNode(vnode: VNode) {
    return !!vnode.textContent;
}

export function isTextRight(vnode: VNode) {
    return _.includes(getClassList(vnode), 'text-right');
}

export function isOriginalNode(vnode: VNode) {
    return Boolean(vnode.id);
}

export function isGeneratedNode(vnode: VNode) {
    return !vnode.id;
}

// TODO: 只有背景且背景跟父亲一样的，也属于不可见
export function isOriginalGhostNode(vnode: VNode) {
    return isOriginalNode(vnode) && !vnode.textContent && _.isEmpty(vnode.classList);
}

export function isSingleLineText(vnode: VNode) {
    return isTextNode(vnode) && !isMultiLineText(vnode);
}

export function makeSingleLineTextNoWrap(textNode: VNode) {
    if (!_.includes(textNode.classList, 'whitespace-nowrap')) {
        textNode.classList.push('whitespace-nowrap');
    }
}

export function makeSingleLineTextEllipsis(textNode: VNode) {
    makeSingleLineTextNoWrap(textNode);
    textNode.classList.push('text-ellipsis overflow-hidden');
}

export function isMultiLineText(vnode: VNode) {
    return !!vnode.textMultiLine;
}

/** 获取多行文本行高 */
export function getMultiLineTextLineHeight(textVNode: VNode) {
    const firstSpan = (textVNode.textContent as VNode[])[0];
    const match = getClassName(firstSpan).match(/text-\d+\/(\d+)/);
    assert(!_.isNull(match), '多行元素找不到行高');
    const lineHeight = _.toNumber(match![1]);
    return lineHeight;
}

export function makeMultiLineTextClamp(textNode: VNode) {
    const maxLineCount = Math.floor(textNode.bounds.height / getMultiLineTextLineHeight(textNode));
    _.assign(textNode.style, {
        display: '-webkit-box',
        '-webkit-box-orient': 'vertical',
        overflow: 'hidden',
        '-webkit-line-clamp': maxLineCount
    });
}

export function isListWrapContainer(vnode: VNode) {
    return isRole(vnode, 'list-wrap');
}

export function isListXContainer(vnode: VNode) {
    return isRole(vnode, 'list-x');
}

export function isListYContainer(vnode: VNode) {
    return isRole(vnode, 'list-y');
}

export function isListContainer(vnode: VNode) {
    return isListXContainer(vnode) || isListYContainer(vnode) || isListWrapContainer(vnode);
}

/** 多行元素 */
export function isFlexWrapLike(vnode: VNode) {
    return isListWrapContainer(vnode) || isMultiLineText(vnode);
}

/** 列表元素是否包了一层盒子 */
export function isListItemWrapped(listItem: VNode) {
    return !listItem.id;
}

export function isFlexBox(vnode: VNode) {
    return Boolean(vnode.direction) && Boolean(vnode.children.length);
}

/** 空元素下面不能有children */
export function isVoidElement(node: VNode) {
    // <area>
    // <base>
    // <br>
    // <col>
    // <embed>
    // <hr>
    // <img>
    // <input>
    // <link>
    // <meta>
    // <param>
    // <source>
    // <track>
    // <wbr>
    return _.includes(['img', 'input'], node.tagName);
}

export function isVoidElementWrapper(node: VNode) {
    return _.includes(node.classList, context.voidElementMarker);
}

export function isTableBody(vnode: VNode) {
    return isRole(vnode, 'table-body');
}

export function isTableRow(vnode: VNode) {
    return isRole(vnode, 'table-row');
}

export function refreshBoxBounds(vnode: VNode) {
    assert(isGeneratedNode(vnode), 'refreshBoxBounds: 非生成节点');
    vnode.bounds = getBounds(vnode.children);
}
