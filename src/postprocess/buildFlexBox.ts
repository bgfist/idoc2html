import * as _ from 'lodash';
import { assert } from '../utils';
import { Direction, VNode, getBounds, isContainedWithinX, isContainedWithinY, newVNode } from '../vnode';
import { mergeUnnessaryFlexBox } from './mergeNodes';

/**
 * 决定盒子的排列方向，算法逻辑是，看哪种划分方式生成的直接子节点数量少就用哪种
 * @deprecated 默认应该横着划分
 */
function decideFlexDirection(children: VNode[]) {
    let rowCount = 0;
    let nodes = children;
    while (nodes.length) {
        const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
        rowCount++;
        nodes = _.filter(nodes, node => !isContainedWithinY(node, highestNode));
    }
    let columnCount = 0;
    nodes = children;
    while (nodes.length) {
        const widestNode = _.maxBy(nodes, node => node.bounds.width)!;
        columnCount++;
        nodes = _.filter(nodes, node => !isContainedWithinX(node, widestNode));
    }

    if (rowCount === 1) {
        return Direction.Row;
    } else if (columnCount === 1) {
        return Direction.Column;
    } else if (rowCount <= columnCount) {
        return Direction.Column;
    } else {
        return Direction.Row;
    }
}

/** 将子节点按行或列归组 */
function groupNodes(parent: VNode, checkCrossCount?: boolean) {
    let nodes = parent.children;
    const direction = parent.direction;
    assert(!!nodes.length && !!direction, '有children才能归组');

    const prevCrossCount = nodes.length;
    const children: VNode[] = [];

    if (direction === Direction.Column) {
        while (nodes.length) {
            const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
            const [intersectingNodes, leftoverNodes] = _.partition(nodes, node =>
                isContainedWithinY(node, highestNode)
            );
            if (intersectingNodes.length > 1) {
                // 有可能两个盒子互相交叉，横竖都能分在一组，此时不能再往下分了
                if (checkCrossCount && intersectingNodes.length === prevCrossCount) {
                    console.warn(`${prevCrossCount}个盒子互相交叉，横竖都能分在一组`);
                    parent.children = _.sortBy(intersectingNodes, node => node.bounds.top);
                    return;
                }

                const vnode = newVNode({
                    children: intersectingNodes,
                    bounds: getBounds(intersectingNodes),
                    direction: Direction.Row
                });
                groupNodes(vnode, true);
                children.push(vnode);
            } else {
                children.push(highestNode);
            }
            nodes = leftoverNodes;
        }
        parent.children = _.sortBy(children, node => node.bounds.top);
    } else {
        while (nodes.length) {
            const widestNode = _.maxBy(nodes, node => node.bounds.width)!;
            const [intersectingNodes, leftoverNodes] = _.partition(nodes, node =>
                isContainedWithinX(node, widestNode)
            );
            if (intersectingNodes.length > 1) {
                // 有可能两个盒子互相交叉，横竖都能分在一组，此时不能再往下分了
                if (checkCrossCount && intersectingNodes.length === prevCrossCount) {
                    console.warn(`${prevCrossCount}个盒子互相交叉，横竖都能分在一组`);
                    parent.children = _.sortBy(intersectingNodes, node => node.bounds.left);
                    return;
                }

                const vnode = newVNode({
                    children: intersectingNodes,
                    bounds: getBounds(intersectingNodes),
                    direction: Direction.Column
                });
                groupNodes(vnode, true);
                children.push(vnode);
            } else {
                children.push(widestNode);
            }
            nodes = leftoverNodes;
        }
        parent.children = _.sortBy(children, node => node.bounds.left);
    }
}

/** 生成flexbox盒子 */
export function buildFlexBox(parent: VNode) {
    if (parent.children.length) {
        assert(!parent.direction, '这里应该还没生成flex盒子');
        // 默认先横着划分, 符合人眼的阅读顺序
        // TODO: 单个子节点可能更适合用Row
        parent.direction = Direction.Column;
        groupNodes(parent);
        // 只有一个子元素
        mergeUnnessaryFlexBox(parent);
    }
}
