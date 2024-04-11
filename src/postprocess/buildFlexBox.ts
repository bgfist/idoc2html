import * as _ from 'lodash';
import { assert, collectContinualRanges, filterMap, pairPrevNext, removeEle, removeEles } from '../utils';
import {
    Direction,
    VNode,
    VNodeBounds,
    getBounds,
    getCrossDirection,
    getMiddleLine,
    getNodeArea,
    isContainedWithinX,
    isContainedWithinY,
    isIntersectOverHalf,
    isListWrapContainer,
    isListYContainer,
    isMultiLineText,
    isOverlapping,
    isSingleLineText,
    newVNode
} from '../vnode';
import { mergeUnnessaryFlexBox } from './mergeNodes';

/**
 * 决定盒子的排列方向，算法逻辑是，页面默认Column，父子之间方向交叉。
 * 如果划分时遇到有问题的重叠，则尝试换个方向划分
 */
function decideFlexDirection(children: VNode[], preferDirection: Direction) {
    /**  检查是否有节点在坐标上重叠超过一半 */
    function checkNodesOverlapping(direction: Direction, group1: VNode[], group2: VNode[]) {
        for (let i = 0; i < group1.length; i++) {
            for (let j = 0; j < group2.length; j++) {
                const a = group1[i];
                const b = group2[j];

                if (isIntersectOverHalf(a, b, direction)) {
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
        // 刨除掉跟基准盒子有重叠的
        const omitOverlapped = (child: VNode) => !isIntersectOverHalf(baseNode, child, direction);
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
                console.debug('换个方向划分');
                canDivide = false;
                return true;
            }
        });
        return canDivide;
    }

    /**
     * 是否能按这个方向完美划分
     */
    function canDivideByDirection2(nodes: VNode[], direction: Direction) {
        let canDivide = true;
        getDivideIteration(nodes, direction, (biggestNode, intersectingNodes, leftoverNodes) => {
            const bounds = getBounds(intersectingNodes);
            if (_.some(leftoverNodes, node => isOverlapping({ bounds }, node))) {
                canDivide = false;
                return true;
            }
        });
        return canDivide;
    }

    const crossDirection = getCrossDirection(preferDirection);
    if (canDivideByDirection2(children, preferDirection)) {
        return preferDirection;
    } else if (canDivideByDirection2(children, crossDirection)) {
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
            side: 'right',
            isContainedWithinFn: isContainedWithinX
        },
        [Direction.Column]: {
            dimension: 'height',
            side: 'bottom',
            isContainedWithinFn: isContainedWithinY
        }
    } as const;
    const { dimension, side, isContainedWithinFn } = dimensionFields[direction];

    const groups = [nodes];
    while (groups.length) {
        const nodes = groups.pop()!;
        const biggestNode = _.maxBy(nodes, node => node.bounds[dimension])!;
        let [intersectingNodes, leftoverNodes] = _.partition(
            nodes,
            node => isContainedWithinFn(node, biggestNode)
            // 超过一半都侵入基准盒子了，我们就带上它
            // TODO: 这个还得限制下，边框有问题，会导致横竖都能分在一起
            // || isIntersectOverHalf(biggestNode, node, direction)
        );

        if (intersectingNodes.length > 1) {
            // 如果划分到的这行与其他节点有重叠，则往两边继续找重叠的，一起换个方向划分
            let [overlappedNodes, nonOverlappedNodes] = _.partition(leftoverNodes, node =>
                isOverlapping({ bounds: getBounds(intersectingNodes) }, node)
            );
            while (overlappedNodes.length) {
                intersectingNodes.push(...overlappedNodes);
                leftoverNodes = nonOverlappedNodes;
                [overlappedNodes, nonOverlappedNodes] = _.partition(leftoverNodes, node =>
                    isOverlapping({ bounds: getBounds(intersectingNodes) }, node)
                );
            }
        }

        // 返回true表示跳出循环
        if (iteratee(biggestNode, intersectingNodes, leftoverNodes)) {
            break;
        }

        // 否则，往两边分开继续切
        const [startSideNodes, endSideNodes] = _.partition(
            leftoverNodes,
            node => node.bounds[side] < getMiddleLine({ bounds: getBounds(intersectingNodes) }, direction)
        );

        if (startSideNodes.length) {
            groups.push(startSideNodes);
        }
        if (endSideNodes.length) {
            groups.push(endSideNodes);
        }
    }
}

/**
 * 切分迭代器
 * @param iteratee 返回true表示跳出循环
 */
function getDivideIteration2(
    nodes: VNode[],
    direction: Direction,
    iteratee: (biggestNode: VNode, intersectingNodes: VNode[]) => void | boolean
) {
    function getDivideRanges(nodes: VNode[], direction: Direction) {
        const dimensionFields = {
            [Direction.Row]: {
                dimension: 'width',
                isContainedWithinFn: isContainedWithinX
            },
            [Direction.Column]: {
                dimension: 'height',
                isContainedWithinFn: isContainedWithinY
            }
        } as const;
        const { dimension, isContainedWithinFn } = dimensionFields[direction];
        let ranges: Array<{
            biggestNode: VNode;
            intersectingNodes: VNode[];
            bounds: VNodeBounds['bounds'];
        }> = [];
        const sortSide = direction === Direction.Row ? 'left' : 'top';

        while (nodes.length) {
            const biggestNode = _.maxBy(nodes, node => node.bounds[dimension])!;
            const [intersectingNodes, leftoverNodes] = _.partition(
                nodes,
                node =>
                    isContainedWithinFn(node, biggestNode) ||
                    // 超过一半都侵入基准盒子了，我们就带上它
                    // TODO: 这个还得限制下，边框有问题，会导致横竖都能分在一起
                    isIntersectOverHalf(biggestNode, node, direction)
            );
            ranges.push({
                biggestNode,
                intersectingNodes,
                bounds: getBounds(intersectingNodes)
            });
            nodes = leftoverNodes;
        }

        ranges = _.sortBy(ranges, node => node.bounds[sortSide]);
        return ranges;
    }

    let ranges = getDivideRanges(nodes, direction);

    const overlappingRanges = collectContinualRanges(
        ranges,
        (a, b) => {
            return isOverlapping(a, b) && (a.intersectingNodes.length > 1 || b.intersectingNodes.length > 1);
        },
        _.constant(true)
    );
    const mergedRanges = filterMap(overlappingRanges, range => {
        const overlappings = ranges.slice(range.start, range.end);
        const intersectingNodes = _.flatten(overlappings.map(range => range.intersectingNodes));

        // 换个方向可能也有交叉，就不换了
        const crossRanges = getDivideRanges(intersectingNodes, getCrossDirection(direction));
        if (
            crossRanges.length <= 1 ||
            pairPrevNext(crossRanges).some(([prev, next]) => isOverlapping(prev, next))
        ) {
            return false;
        }

        console.debug('这些节点需要换个方向划分');
        removeEles(ranges, overlappings);

        return {
            biggestNode: overlappings[0].biggestNode, // 这里不重要
            intersectingNodes
        };
    });

    _.concat(ranges, mergedRanges).forEach(range => {
        iteratee(range.biggestNode, range.intersectingNodes);
    });
}

/** 将子节点按行或列归组 */
function groupNodes(parent: VNode, checkCrossCount?: boolean) {
    let nodes = parent.children;
    let direction = parent.direction!;
    assert(!!nodes.length && !!direction, '有children才能归组');

    const prevCrossCount = nodes.length;
    const children: VNode[] = [];
    const sortSide = direction === Direction.Row ? 'left' : 'top';

    getDivideIteration2(nodes, direction, (biggestNode, intersectingNodes) => {
        if (intersectingNodes.length > 1) {
            // 有可能两个盒子互相交叉，横竖都能分在一组，此时不能再往下分了
            if (checkCrossCount && intersectingNodes.length === prevCrossCount) {
                console.warn(`${prevCrossCount}个盒子互相交叉，横竖都能分在一组`);

                // 那就尝试将小的做成绝对定位，其他的继续划分
                const otherNodes = intersectingNodes.filter(node => node !== biggestNode);
                if (otherNodes.length > 1) {
                    const vnode = newVNode({
                        children: otherNodes,
                        bounds: getBounds(otherNodes)
                    });
                    // TODO: 判断是否可以为绝对定位
                    if (
                        isIntersectOverHalf(biggestNode, vnode, direction)
                        // && !isTextNode(biggestNode)
                    ) {
                        parent.attachNodes.push(biggestNode);
                        parent.children = otherNodes;
                        // 继续分割
                        groupNodes(parent, true);
                        return true;
                    }
                } else if (
                    otherNodes.length === 1 &&
                    isIntersectOverHalf(biggestNode, otherNodes[0], direction)
                    // && !isTextNode(biggestNode) &&
                    // !isTextNode(otherNodes[0])
                ) {
                    if (getNodeArea(biggestNode) > getNodeArea(otherNodes[0])) {
                        parent.attachNodes.push(otherNodes[0]);
                        parent.children = [biggestNode];
                    } else {
                        parent.attachNodes.push(biggestNode);
                        parent.children = otherNodes;
                    }
                    return true;
                }

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

    if (children.length) {
        parent.children = _.sortBy(children, node => node.bounds[sortSide]);
    }
}

/** 生成flexbox盒子 */
export function buildFlexBox(parent: VNode) {
    if (parent.children.length) {
        assert(!parent.direction, '这里应该还没生成flex盒子');
        // 默认先横着划分, 符合人眼的阅读顺序
        // TODO: 单个子节点可能更适合用Row
        parent.direction = Direction.Column;
        if (parent.children.length === 1) {
            const child = parent.children[0];

            if (isListWrapContainer(child)) {
                parent.direction = Direction.Column;
            } else if (child.direction) {
                // 跟列表方向保持一致
                parent.direction = child.direction;
            } else if (isMultiLineText(child)) {
                parent.direction = Direction.Column;
            } else {
                parent.direction = Direction.Row;
            }
        }
        groupNodes(parent);
        // 只有一个子元素
        mergeUnnessaryFlexBox(parent);
    }
}
