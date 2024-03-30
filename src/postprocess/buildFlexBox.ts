import * as _ from 'lodash';
import { assert, removeEle } from '../utils';
import {
    Direction,
    VNode,
    getBounds,
    getCrossDirection,
    getIntersectionX,
    getIntersectionY,
    isContainedWithinX,
    isContainedWithinY,
    newVNode
} from '../vnode';
import { mergeUnnessaryFlexBox } from './mergeNodes';

/**
 * 决定盒子的排列方向，算法逻辑是，页面默认Column，父子之间方向交叉。
 * 如果划分时遇到有问题的重叠，则尝试换个方向划分
 */
function decideFlexDirection(children: VNode[], preferDirection: Direction) {
    const dimensionFields = {
        [Direction.Row]: {
            getIntersectionFn: getIntersectionX,
            dimension: 'width'
        },
        [Direction.Column]: {
            getIntersectionFn: getIntersectionY,
            dimension: 'height'
        }
    } as const;

    /**  检查是否有节点在坐标上重叠超过一半 */
    function checkNodesOverlapping(direction: Direction, group1: VNode[], group2: VNode[]) {
        const { getIntersectionFn, dimension } = dimensionFields[direction];

        for (let i = 0; i < group1.length; i++) {
            for (let j = 0; j < group2.length; j++) {
                const a = group1[i];
                const b = group2[j];

                const intersectionLen = getIntersectionFn(a, b);
                const smallerSize = Math.min(a.bounds[dimension], b.bounds[dimension]);
                if (intersectionLen > smallerSize / 2) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 以基准盒子为中心划分九宫格，判断周围八个格子有没有可以连到一起的
     *
     * @param direction 划分方向
     * @param baseNode 基准盒子(最高的/最宽的)
     * @param coveredNodes 和基准盒子分到一行/一列的其他盒子
     * @param leftoverNodes 剩下的其他盒子
     */
    function checkSideOverlapping(
        direction: Direction,
        baseNode: VNode,
        coveredNodes: VNode[],
        leftoverNodes: VNode[]
    ) {
        const { dimension, getIntersectionFn } = dimensionFields[direction];
        // 刨除掉跟基准盒子有重叠的
        const omitOverlapped = (child: VNode) =>
            getIntersectionFn(child, baseNode) <
            Math.min(child.bounds[dimension], baseNode.bounds[dimension]) / 2;
        const sideCoveredNodes = _.filter(coveredNodes, omitOverlapped);
        const sideLeftoverNodes = _.filter(leftoverNodes, omitOverlapped);
        // 剩下的都是可以用负的margin搞定的

        if (
            checkNodesOverlapping(direction, sideCoveredNodes, sideLeftoverNodes)
            // 有节点可以换个方向划分
        ) {
            console.debug('换个方向划分');
            return true;
        }
    }

    /**
     * 是否能按这个方向完美划分
     */
    function canDivideByDirection(nodes: VNode[], direction: Direction) {
        let canDivide = true;
        getDivideIteration(nodes, direction, (biggestNode, intersectingNodes, leftoverNodes) => {
            removeEle(intersectingNodes, biggestNode);
            if (
                intersectingNodes.length &&
                leftoverNodes.length &&
                checkSideOverlapping(
                    getCrossDirection(preferDirection),
                    biggestNode,
                    intersectingNodes,
                    leftoverNodes
                )
            ) {
                canDivide = false;
                return true;
            }
        });
        return canDivide;
    }

    const crossDirection = getCrossDirection(preferDirection);
    if (canDivideByDirection(children, preferDirection)) {
        return preferDirection;
    } else if (canDivideByDirection(children, crossDirection)) {
        return crossDirection;
    } else {
        return preferDirection;
    }
}

/**
 * 切分迭代器
 * @param iteratee 返回true表示跳出循环
 */
function getDivideIteration(
    nodes: VNode[],
    direction: Direction,
    iteratee: (biggestNode: VNode, intersectingNodes: VNode[], leftoverNodes: VNode[]) => void | boolean
) {
    const dimensionFields = {
        [Direction.Row]: {
            dimension: 'width',
            isContainedWithinFn: isContainedWithinX,
            getIntersectionFn: getIntersectionX
        },
        [Direction.Column]: {
            dimension: 'height',
            isContainedWithinFn: isContainedWithinY,
            getIntersectionFn: getIntersectionY
        }
    } as const;
    const { dimension, isContainedWithinFn, getIntersectionFn } = dimensionFields[direction];
    while (nodes.length) {
        const biggestNode = _.maxBy(nodes, node => node.bounds[dimension])!;
        const [intersectingNodes, leftoverNodes] = _.partition(
            nodes,
            node =>
                isContainedWithinFn(node, biggestNode) ||
                // 超过一半都侵入基准盒子了，我们就带上它
                // TODO: 这个还得限制下，边框有问题，会导致横竖都能分在一起
                getIntersectionFn(node, biggestNode) > node.bounds[dimension] / 2
        );
        // 返回true表示跳出循环
        if (iteratee(biggestNode, intersectingNodes, leftoverNodes)) {
            break;
        }
        nodes = leftoverNodes;
    }
}

/** 将子节点按行或列归组 */
function groupNodes(parent: VNode, checkCrossCount?: boolean) {
    let nodes = parent.children;
    let direction = parent.direction!;
    assert(!!nodes.length && !!direction, '有children才能归组');

    // 看下能不能按原方向划分
    // parent.direction = direction = decideFlexDirection(nodes, direction);

    const prevCrossCount = nodes.length;
    const children: VNode[] = [];
    const sortSide = direction === Direction.Row ? 'left' : 'top';

    getDivideIteration(nodes, direction, (biggestNode, intersectingNodes) => {
        if (intersectingNodes.length > 1) {
            // 有可能两个盒子互相交叉，横竖都能分在一组，此时不能再往下分了
            if (checkCrossCount && intersectingNodes.length === prevCrossCount) {
                console.warn(`${prevCrossCount}个盒子互相交叉，横竖都能分在一组`);

                // 一次性给到，跳出循环
                children.push(...intersectingNodes);
                return true;
            }

            const vnode = newVNode({
                children: intersectingNodes,
                bounds: getBounds(intersectingNodes),
                direction: getCrossDirection(direction)
            });
            groupNodes(vnode, true);
            children.push(vnode);
        } else {
            children.push(biggestNode);
        }
    });

    parent.children = _.sortBy(children, node => node.bounds[sortSide]);
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
