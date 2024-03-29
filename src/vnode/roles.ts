import * as _ from 'lodash';
import { Direction, SizeSpec, VNode } from './types';
import { allNumsEqual, collectContinualRanges, numEq } from '../utils';
import {
    addRole,
    getBounds,
    getClassName,
    getItemGaps,
    isEqualBox,
    isImageOrSliceNode,
    isTextNode,
    newVNode
} from './helpers';
import { context } from './context';

/** 判断节点是不是分隔线 */
export function maybeDivider(vnode: VNode) {
    if (numEq(vnode.bounds.width, 1) && vnode.bounds.height >= 20) {
        addRole(vnode, 'divider');
        vnode.widthSpec = SizeSpec.Fixed;
        vnode.heightSpec = SizeSpec.Constrained;
        return true;
    } else if (numEq(vnode.bounds.height, 1) && vnode.bounds.width >= 20) {
        addRole(vnode, 'divider');
        vnode.widthSpec = SizeSpec.Constrained;
        vnode.heightSpec = SizeSpec.Fixed;
        return true;
    }
    return false;
}

/** 判断节点是不是边框 */
export function maybeBorder(child: VNode, parent: VNode) {
    if (numEq(child.bounds.width, 1)) {
        const attachLeftOrRight =
            numEq(child.bounds.left, parent.bounds.left) || numEq(child.bounds.right, parent.bounds.right);

        if (attachLeftOrRight) {
            addRole(child, 'border');
            child.widthSpec = SizeSpec.Fixed;
            child.heightSpec = SizeSpec.Constrained;
            return true;
        }
    } else if (numEq(child.bounds.height, 1)) {
        const attachTopOrBottom =
            numEq(child.bounds.top, parent.bounds.top) || numEq(child.bounds.bottom, parent.bounds.bottom);

        if (attachTopOrBottom) {
            addRole(child, 'border');
            child.widthSpec = SizeSpec.Constrained;
            child.heightSpec = SizeSpec.Fixed;
            return true;
        }
    }
}

/** 判断节点是不是内联按钮，这种有交互的节点不一定能自动扩充 */
export function maybeInlineButton(vnode: VNode) {
    // 按钮要么宽度固定，要么内容撑开，宽度不能用Constrained
    if (vnode.children.length !== 1) {
        return false;
    }
    const onlyChild = vnode.children[0];

    if (
        isTextNode(onlyChild) &&
        vnode.bounds.width < Math.min(context.root.bounds.width, context.root.bounds.height) / 2 &&
        vnode.bounds.height <= onlyChild.bounds.height * 3
    ) {
        addRole(vnode, 'btn');
        return true;
    }
}

/** 文字下面有下划线，可能是tab下的选中状态 */
export function maybeTabLine(vnode: VNode) {}

/** 弹窗不透明蒙层 */
export function maybeDialogMask(vnode: VNode) {
    return isEqualBox(vnode, context.root) && getClassName(vnode).indexOf('bg-[hsla(0,0%,0%,0.)') !== -1;
}

/** 判断是否是表格布局 */
export function maybeTable(rows: VNode[][]) {
    const ranges = collectContinualRanges(
        rows,
        (rowA, rowB) => rowA.length === rowB.length,
        range => {
            if (rows[range.start].length >= 3 && range.end - range.start >= 3 && range.end === rows.length) {
                const tableRows = rows.slice(range.start, range.end);
                const gaps = getItemGaps(
                    tableRows.map(row => _.first(row)!),
                    Direction.Column
                );
                if (allNumsEqual(gaps) && Math.abs(gaps[0]) < 6) {
                    return true;
                }
            }
            return false;
        }
    );

    return ranges.map(range => {
        console.debug('找到表格');
        const tableRows = rows.slice(range.start, range.end);
        const listItems = tableRows.map(tableRow => {
            return newVNode({
                role: ['table-row'],
                children: tableRow,
                bounds: getBounds(tableRow)
            });
        });
        return {
            tableRows,
            tableBody: newVNode({
                role: ['table-body'],
                children: listItems,
                bounds: getBounds(listItems),
                direction: Direction.Column,
                heightSpec: SizeSpec.Auto
            })
        };
    });
}

/** 检查图片是否框死容器尺寸 */
export function maybeFrameImage(vnode: VNode, parent: VNode) {
    const alignDimension = parent.direction === Direction.Row ? 'height' : 'width';
    return isImageOrSliceNode(vnode) && numEq(vnode.bounds[alignDimension], parent.bounds[alignDimension]);
}
