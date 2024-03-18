import * as _ from 'lodash';
import { assert } from '../utils';
import { Direction, VNode, getBounds, isContainedWithinX, isContainedWithinY, newVNode } from '../vnode';

/** 决定盒子的排列方向，算法逻辑是，看哪种划分方式生成的直接子节点数量少就用哪种 */
function decideFlexDirection(nodes: VNode[]) {
    let rowCount = 0;
    while (nodes.length) {
        const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
        rowCount++;
        nodes = _.filter(nodes, node => !isContainedWithinY(node, highestNode));
    }
    let columnCount = 0;
    while (nodes.length) {
        const widestNode = _.maxBy(nodes, node => node.bounds.width)!;
        columnCount++;
        nodes = _.filter(nodes, node => !isContainedWithinX(node, widestNode));
    }

    if (rowCount < columnCount) {
        return Direction.Row;
    } else if (rowCount > columnCount) {
        return Direction.Column;
    } else if (rowCount === 1) {
        return Direction.Row;
    } else {
        return Direction.Column;
    }
}

/** 将子节点按行或列归组 */
function groupNodes(nodes: VNode[], direction: Direction, prevCrossCount?: number): VNode[] {
    assert(!!nodes.length, '有children才能归组');

    const children: VNode[] = [];

    if (direction === Direction.Column) {
        while (nodes.length) {
            const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
            const [intersectingNodes, leftoverNodes] = _.partition(nodes, node =>
                isContainedWithinY(node, highestNode)
            );
            if (intersectingNodes.length > 1) {
                const vnode = newVNode({
                    children: intersectingNodes,
                    bounds: getBounds(intersectingNodes),
                    direction: Direction.Row
                });
                // 有可能两个盒子互相交叉，横竖都能分在一组，此时不能再往下分了
                if (intersectingNodes.length === prevCrossCount) {
                    console.warn(`${prevCrossCount}个盒子互相交叉，横竖都能分在一组`);
                } else {
                    vnode.children = groupNodes(intersectingNodes, Direction.Row, intersectingNodes.length);
                }
                children.push(vnode);
            } else {
                children.push(highestNode);
            }
            nodes = leftoverNodes;
        }
        return _.sortBy(children, node => node.bounds.top);
    } else {
        while (nodes.length) {
            const widestNode = _.maxBy(nodes, node => node.bounds.width)!;
            const [intersectingNodes, leftoverNodes] = _.partition(nodes, node =>
                isContainedWithinX(node, widestNode)
            );
            if (intersectingNodes.length > 1) {
                const vnode = newVNode({
                    children: intersectingNodes,
                    bounds: getBounds(intersectingNodes),
                    direction: Direction.Column
                });
                // 有可能两个盒子互相交叉，横竖都能分在一组，此时不能再往下分了
                if (intersectingNodes.length === prevCrossCount) {
                    console.warn(`${prevCrossCount}个盒子互相交叉，横竖都能分在一组`);
                } else {
                    vnode.children = groupNodes(
                        intersectingNodes,
                        Direction.Column,
                        intersectingNodes.length
                    );
                }
                children.push(vnode);
            } else {
                children.push(widestNode);
            }
            nodes = leftoverNodes;
        }
        return _.sortBy(children, node => node.bounds.left);
    }
}

/** 生成flexbox盒子 */
export function buildFlexBox(parent: VNode) {
    if (parent.children.length) {
        assert(!parent.direction, '这里应该还没生成flex盒子');
        parent.direction = decideFlexDirection(parent.children);
        parent.children = groupNodes(parent.children, parent.direction);
    }
}
