import * as _ from 'lodash';
import { allNumsEqual, anyElesIn, assert, groupByWith, groupWith, numEq, numGt, numGte, numLt, numLte, removeEle, removeEles, unreachable } from "./utils";
import { Direction, SizeSpec, VNode, context } from "./vnode";
import { BuildStage, debug, defaultConfig } from './config';
import { R, R2, getClassList, isContainedWithin, isCrossDirection, isEqualBox, isFlexWrapLike, isGhostNode, isListContainer, isListWrapContainer, isMultiLineText, isOverlapping, isOverlappingX, isSingleLineText, isTextNode, newVNode, normalizeClassName } from './helpers';
import { maybeBorder, maybeInlineButton } from './roles';

/** 处理auto元素内容居中，仅横向 */
function setAutoContentsAlign(vnode: VNode, side: 'center' | 'start' | 'end') {
    if (isTextNode(vnode)) {
        const sideMap = {
            'center': 'center',
            'start': 'left',
            'end': 'right'
        };
        if (!anyElesIn(getClassList(vnode), ['text-left', 'text-center', 'text-right'])) {
            vnode.classList.push(`text-${sideMap[side]}`);
        }
    } else {
        vnode.classList.push(`justify-${side}`);
    }
}

/** 处理auto元素内容超出，仅横向 */
function setAutoOverflow(vnode: VNode) {
    // 文本节点
    if (vnode.role === 'list-x') {
        vnode.classList.push('overflow-x-auto');
    } else if (isSingleLineText(vnode) && vnode.widthSpec === SizeSpec.Auto) {
        vnode.classList.push('overflow-hidden text-ellipsis whitespace-nowrap');
    }
}

/** 寻找父节点，最小的包围盒子 */
function findBestParent(node: VNode, nodes: VNode[]) {
    let bestParent: VNode | null = null;
    let minArea = Infinity;
    for (const potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isContainedWithin(node, potentialParent)) {
            const area = potentialParent.bounds.width * potentialParent.bounds.height;
            if (area < minArea) {
                minArea = area;
                bestParent = potentialParent;
            }
        }
    }
    return bestParent;
}

function findBestIntersectNode(node: VNode, nodes: VNode[]) {
    let bestIntersectNode: VNode | null = null;
    let minArea = Infinity;
    // const nodeArea = isTextNode(node) ? 100000000 : node.bounds.width * node.bounds.height;
    const nodeArea = node.bounds.width * node.bounds.height;
    for (const potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isOverlapping(node, potentialParent)) {
            const area = potentialParent.bounds.width * potentialParent.bounds.height;

            if (area === nodeArea) {
                console.warn('元素互相交叉且面积相等，暂不处理');
            } else if (area > nodeArea && area < minArea) {
                minArea = area;
                bestIntersectNode = potentialParent;
            }
        }
    }
    return bestIntersectNode;
}

/** 删除幽灵节点，这些节点本身没样式 */
function removeGhostNodes(vnode: VNode) {
    if (vnode.children && vnode.children.length) {
        vnode.children = _.filter(vnode.children, n => !isGhostNode(n));
    }
}

/** 扩大幽灵节点(仅做flex盒子用，本身没样式) */
function expandGhostNodes(parent: VNode) {
    const isGhostFlexBox = (child: VNode) => {
        return (
            child.direction &&
            child.direction !== parent.direction &&
            isGhostNode(child) &&
            !isListContainer(child)
        );
    };
    if (parent.direction === Direction.Row) {
        // 只扩充高度
        _.each(parent.children, child => {
            if (isGhostFlexBox(child)) {
                child.bounds.top = parent.bounds.top;
                child.bounds.bottom = parent.bounds.bottom;
                child.bounds.height = parent.bounds.bottom - parent.bounds.top;

                // 此处不需要修改sizeSpec，会在布局时自动扩充
            }
        });
    }
    if (parent.direction === Direction.Column) {
        // 只扩充宽度
        _.each(parent.children, child => {
            if (isGhostFlexBox(child)) {
                child.bounds.left = parent.bounds.left;
                child.bounds.right = parent.bounds.right;
                child.bounds.width = parent.bounds.right - parent.bounds.left;
            }
        });
    }
}

/** 为每个节点找到最佳父节点，保证nodes互不相交 */
function buildMissingNodes(parent: VNode) {
    let nodes = parent.children!;
    if (!nodes || !nodes.length) return;

    // 先将互相包含的节点选一个父节点出来
    const grouped = groupWith(nodes, (a, b) => isContainedWithin(a, b) && isContainedWithin(b, a));
    nodes = _.map(Array.from(grouped.values()), nodes => {
        const [node, ...leftover] = nodes;
        _.each(leftover, child => mergeNode(node, child));
        return node;
    });

    // 剩下的节点都是直接子节点, 互不包含
    nodes = nodes.filter(node => {
        const bestParent = findBestParent(node, nodes);
        if (bestParent) {
            if (isTextNode(bestParent)) {
                (bestParent.attachNodes ??= []).push(node);
            } else {
                (bestParent.children ??= []).push(node);
            }
            return false;
        } else {
            return true;
        }
    });

    // 剩下的节点都是直接子节点, 互不交叉
    nodes = nodes.filter(node => {
        const bestIntersectNode = findBestIntersectNode(node, nodes);
        if (bestIntersectNode) {
            if (isTextNode(bestIntersectNode)) {
                //TODO: 文本节点有子节点？层级需要处理下，文本不能被遮住
            }

            (bestIntersectNode.attachNodes ??= []).push(node);
            return false;
        } else if (maybeBorder(node, parent)) {
            // 过小的元素有可能是边框,做成绝对定位
            (parent.attachNodes ??= []).push(node);
            return false;
        }

        return true;
    });

    parent.children = nodes;
}

/** 两个盒子是否相似 */
function isSimilarBoxX(a: VNode, b: VNode) {
    if (
        isTextNode(a) && isTextNode(b) &&
        numEq(a.bounds.top, b.bounds.top) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) && !isTextNode(b) &&
        numEq(a.bounds.top, b.bounds.top) &&
        // numEq(a.bounds.width, b.bounds.width) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    return false;
}

/** 两个盒子是否相似 */
function isSimilarBoxY(a: VNode, b: VNode) {
    // TODO: 是否不用高度相等

    if (
        isTextNode(a) && isTextNode(b) &&
        numEq(a.bounds.height, b.bounds.height) &&
        numEq(a.bounds.left, b.bounds.left)
    ) {
        return true;
    }
    if (
        !isTextNode(a) && !isTextNode(b) &&
        numEq(a.bounds.left, b.bounds.left) &&
        numEq(a.bounds.height, b.bounds.height) &&
        numEq(a.bounds.width, b.bounds.width)
    ) {
        return true;
    }
    return false;
}

/** 两个盒子是否相似 */
function isSimilarBoxWrap(a: VNode, b: VNode) {
    if (
        isTextNode(a) && isTextNode(b) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) && !isTextNode(b) &&
        // numEq(a.bounds.width, b.bounds.width) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    return false;
}

/** 寻找flex-wrap元素 */
function findFlexWrap(nodes: VNode[], cursor: number, baseRepeatStart: number, repeatGroupCount: number, repeatNodes: VNode[]) {
    const repeatsBounds = getBounds(repeatNodes);
    const belowBox = {
        bounds: {
            left: repeatsBounds.left,
            right: repeatsBounds.right,
            top: repeatsBounds.bottom,
            bottom: Infinity
        }
    } as VNode;
    cursor = _.findIndex(nodes, node => isContainedWithin(node, belowBox), cursor);
    if (cursor === -1) {
        return;
    }

    const repeatStart = cursor;
    let repeatCount = 0;
    while (cursor < nodes.length && isSimilarBoxWrap(nodes[cursor], nodes[baseRepeatStart + repeatCount % repeatGroupCount])) {
        cursor++;
        repeatCount++;
    }

    if (!repeatCount) {
        return;
    }

    // 找到flex-wrap
    const mod = repeatCount % repeatGroupCount;
    if (mod !== 0) {
        console.warn('flex-wrap重复分组不完整!');
        repeatCount -= mod;
    }

    // 重复节点之间断开了
    if (!repeatCount) {
        console.warn('flex-wrap重复节点之间断开了!');
        return;
    }

    repeatNodes.push(...nodes.slice(repeatStart, repeatStart + repeatCount));

    // 接着找
    findFlexWrap(nodes, cursor, baseRepeatStart, repeatGroupCount, repeatNodes);
}

/** 获取一堆节点的边界 */
function getBounds(nodes: VNode[]) {
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
        height: maxBottom - minTop,
    }
}

/** 寻找横向重复节点，将其重新归组 */
function groupListXNodes(nodes: VNode[]): VNode[] {
    // 1. 处理横向重复 ✅
    // 2. 处理竖向列表
    // 3. 处理flex-wrap多行 ✅
    // 4. 处理多行横向重复(需重新归组)

    if (!nodes.length) return [];

    /** 对临时归组的list-item节点，检查其内部结构是否一致 */
    function checkListXItemInner(listX: VNode[]) {
        // 检查item内部相互间距是否一致
        const innerGaps = _.map(listX, function (listItem) {
            const children = listItem.children!;
            const gaps = _.map(children.slice(1), function (current, index) {
                return current.bounds.left - children[index].bounds.right;
            });
            return gaps;
        });
        if (!_.every(_.zip(...innerGaps), gap => allNumsEqual(gap as number[]))) {
            console.warn('item内部结构不一致');
            return false;
        }

        return true;
    }

    /** 给文本节点扩充宽度 */
    function expandRoomForTextNodes(listX: VNode[], rulerGap: number) {
        if (isTextNode(listX[0])) {
            // 文本节点中线间隔一致, 则可以归组, 将其宽度重新等分
            _.each(listX, function (child) {
                const newWidth = Math.round(rulerGap / 2);
                const widthDiff = Math.round(newWidth - child.bounds.width) / 2;
                child.bounds.width = newWidth;
                child.bounds.left = child.bounds.left - widthDiff;
                child.bounds.right = child.bounds.right + widthDiff;
            });
        }
    }

    /** 检查list-item间距 */
    function checkListXItemGap(listX: VNode[]) {
        // 优先检查item分布是否均匀
        const rulers = _.map(listX.slice(1), function (current, index) {
            return current.bounds.left - listX[index].bounds.left;
        });
        const repeatedRuler = allNumsEqual(rulers);

        if (repeatedRuler) {
            return true;
        } else {
            // console.warn('重复文本节点中线间隔不一致! 直接忽略');
            console.debug('item分布不均匀');
        }

        // 检查item间距是否一致
        const gaps = _.map(listX.slice(1), function (current, index) {
            return current.bounds.left - listX[index].bounds.right;
        });
        const equalGap = allNumsEqual(gaps);

        if (equalGap) {
            return true;
        } else {
            // console.warn('重复节点间隔不统一! 直接忽略');
            console.debug('item间距不一致');
        }

        return false;
    }

    /** 检查list-item是否连续 */
    function checkListXItemContinual(possibleRepeats: VNode[]) {
        const leftoverNodes = _.difference(nodes, possibleRepeats);
        for (const [before, after] of _.zip(possibleRepeats.slice(0, -1), possibleRepeats.slice(1))) {
            const inbox = {
                left: before!.bounds.right,
                top: Math.min(before!.bounds.top, after!.bounds.top),
                right: after!.bounds.left,
                bottom: Math.max(before!.bounds.bottom, after!.bounds.bottom)
            };
            const vnode = { bounds: inbox } as VNode;
            if (_.some(leftoverNodes, l => isOverlapping(l, vnode))) {
                return false;
            }
        }
        return true;
    }

    // TODO: 如何真正实现横向重复归组
    // while (nodes.length) {

    // }
    // const grouped = groupWith(nodes, (a, b) => isSimilarBoxX(a, b));
    // const g = _.sortBy(Array.from(grouped.values()).filter(nodes => nodes.length > 1), nodes => nodes[0].bounds.top);

    let compareIndex = 0;
    for (let i = 1; i < nodes.length; i++) {
        // 换行了重新查
        if (!numEq(nodes[i].bounds.top, nodes[i - 1].bounds.top)) {
            compareIndex = i;
            continue;
        }
        if (!isSimilarBoxX(nodes[compareIndex], nodes[i])) {
            continue;
        }

        // 获取重复的节点
        const baseRepeatStart = compareIndex;
        const repeatGroupCount = i - compareIndex;
        let repeatCount = repeatGroupCount + 1;
        while (++i < nodes.length && isSimilarBoxX(nodes[++compareIndex], nodes[i])) {
            repeatCount++;
        }

        const mod = repeatCount % repeatGroupCount;
        if (mod !== 0) {
            console.warn('重复分组不完整!');
            repeatCount -= mod;
            i -= mod;
        }
        const repeatTimes = Math.round(repeatCount / repeatGroupCount);

        // 重复节点之间断开了
        if (repeatTimes === 0) {
            console.warn('重复节点断开了!');
            continue;
        }

        if (repeatTimes === 1) {
            console.warn('只有一个节点，不构成列表');
            continue;
        }

        // 文本节点大概率重复, 如果只有俩个则忽略
        if (repeatGroupCount === 1 && isTextNode(nodes[baseRepeatStart]) && repeatCount === 2) {
            continue;
        }

        // 这些是确认重复可以归组的节点
        let children = nodes.slice(baseRepeatStart, baseRepeatStart + repeatCount);

        // 校验一下这些节点中间没有其他节点横插一脚
        if (!checkListXItemContinual(children)) {
            console.debug('有节点看似重复，其实中间隔着其他节点');
            continue;
        }

        // 继续获取flex-wrap节点
        findFlexWrap(nodes, i, baseRepeatStart, repeatGroupCount, children);

        // 将children进行分组
        if (repeatGroupCount > 1) {
            console.debug('横向列表元素需要先归组');
            const repeatGroups: VNode[] = [];
            for (let j = 0; j < children.length; j += repeatGroupCount) {
                const group = children.slice(j, j + repeatGroupCount);
                const vnode = newVNode({
                    classList: [],
                    bounds: getBounds(group),
                    children: group,
                    role: 'list-item',
                    direction: Direction.Row,
                    index: context.index++
                });
                repeatGroups.push(vnode);
            }
            if (
                children.length === repeatCount &&
                !checkListXItemInner(repeatGroups) &&
                !checkListXItemGap(repeatGroups)
            ) {
                continue;
            }

            removeEles(nodes, children);
            children = repeatGroups;
        } else {
            if (
                children.length === repeatCount &&
                !checkListXItemGap(children)
            ) {
                continue;
            }

            _.each(children, child => {
                child.role = 'list-item';
            });
            removeEles(nodes, children);
        }

        const vnode = newVNode({
            classList: [],
            bounds: getBounds(children),
            children,
            role: 'list-x',
            direction: Direction.Row,
            widthSpec: SizeSpec.Auto,
            index: context.index++
        });
        if (children.length > repeatCount) {
            // 是flex-wrap
            console.debug('找到横向flex-wrap列表');
            vnode.role = 'list-wrap';
            vnode.heightSpec = SizeSpec.Auto;
            _.each(children, child => {
                if (defaultConfig.allocSpaceForAuto.flexWrapItemFixedWidth) {
                    child.widthSpec = SizeSpec.Fixed;
                }
                child.heightSpec = SizeSpec.Fixed;
            });
        } else {
            console.debug('找到横向列表');
            vnode.role = 'list-x';
            _.each(children, child => {
                child.heightSpec = SizeSpec.Fixed;
            });
        }

        return [...nodes.slice(0, baseRepeatStart), vnode, ...groupListXNodes(nodes.slice(baseRepeatStart))];
    }

    return nodes;
}

/** 寻找纵向重复节点，将其重新归组 */
function groupListYNodes(parent: VNode) {
    assert(parent.direction === Direction.Column, '只对column进行list-y列表判断');

    const nodes = parent.children;
    if (!nodes || nodes.length < 2) return;

    for (let i = 1; i < nodes.length; i++) {
        if (isSimilarBoxY(nodes[i], nodes[i - 1])) {
            // 找到纵向重复节点, 目前只处理一组
            const baseRepeatStart = i - 1;
            let repeatCount = 2;
            i++;
            while (i < nodes.length && isSimilarBoxY(nodes[i], nodes[i - 1])) {
                repeatCount++;
                i++;
            }

            const children = nodes.slice(baseRepeatStart, baseRepeatStart + repeatCount);
            const gaps = _.map(children.slice(1), function (current, index) {
                return current.bounds.left - children[index].bounds.right;
            });
            const equalGap = allNumsEqual(gaps);
            if (!equalGap) {
                console.warn('纵向列表节点间距不一致，无法进行list-y处理');
                return;
            }

            console.debug('找到纵向列表');
            _.each(children, child => {
                child.role = 'list-item';
                child.widthSpec = SizeSpec.Fixed;
            });

            if (baseRepeatStart === 0 && repeatCount === nodes.length) {
                console.debug('纵向列表占满父盒子');
                parent.role = 'list-y';
                parent.heightSpec = SizeSpec.Auto;
                return;
            }

            const vnode = newVNode({
                classList: [],
                bounds: getBounds(children),
                children,
                role: 'list-y',
                direction: Direction.Column,
                heightSpec: SizeSpec.Auto,
                index: context.index++,
            });
            nodes.splice(baseRepeatStart, repeatCount, vnode);
            return;
        }
    }
}

/** 寻找可以合并的横向列表 */
function findMergeableListXNodes(nodes: VNode[], toMerge: VNode): VNode[] {
    const nextOverlapNodeIdx = _.findIndex(nodes, node => isOverlappingX(node, toMerge.children![0]));
    const nextOverlapNode = nodes[nextOverlapNodeIdx];

    function getListXGap(vnode: VNode) {
        const middle0 = (vnode.children![0].bounds.left + vnode.children![0].bounds.right) / 2;
        const middle1 = (vnode.children![1].bounds.left + vnode.children![1].bounds.right) / 2;
        return middle1 - middle0;
    }

    if (nextOverlapNode && nextOverlapNode.role === 'list-x' &&
        nextOverlapNode.children!.length === toMerge.children!.length &&
        isOverlappingX(nextOverlapNode.children![0], toMerge.children![0]) &&
        numEq(getListXGap(nextOverlapNode), getListXGap(toMerge))
    ) {
        console.debug('找到可合并的横向列表');
        return [nextOverlapNode, ...findMergeableListXNodes(nodes.slice(nextOverlapNodeIdx + 1), nextOverlapNode)];
    }
    return [];
}

/** 将多个结构一致的横向列表合成为一个 */
function tryMergeListXNodes(nodes: VNode[]): VNode[] {
    if (!nodes.length) return [];

    const firstListXIdx = _.findIndex(nodes, node => node.role === 'list-x');
    if (firstListXIdx === -1) {
        return nodes;
    }

    const firstToMerge = nodes[firstListXIdx];
    const toMergeLists = findMergeableListXNodes(nodes.slice(firstListXIdx + 1), firstToMerge);
    if (toMergeLists.length) {
        // 开始合并
        console.debug('开始合并横向列表');
        toMergeLists.unshift(firstToMerge);
        const children = _.map(_.zip(..._.map(toMergeLists, 'children')), (vChildren) => {
            const group = vChildren as VNode[];
            _.each(group, (vnode) => {
                vnode.role = '';
            });
            const vnode = newVNode({
                classList: [],
                bounds: getBounds(group),
                children: group,
                role: 'list-item',
                direction: Direction.Column,
                // widthSpec: SizeSpec.Fixed,
                index: context.index++
            });
            return vnode;
        });
        const vnode = newVNode({
            classList: [],
            bounds: getBounds(children),
            children,
            role: 'list-x',
            direction: Direction.Row,
            widthSpec: SizeSpec.Auto,
            index: context.index++
        });
        removeEles(nodes, toMergeLists);
        return [...nodes.slice(0, firstListXIdx), vnode, ...tryMergeListXNodes(nodes.slice(firstListXIdx + 1))];
    }

    return nodes;
}

/** 将横坐标有重叠的元素归到一组 */
function groupNodesByOverlapX(nodes: VNode[]) {
    const groups: VNode[][] = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        let addedToGroup = false;
        // 检查节点是否已经属于某个组
        a: for (let n = 0; n < groups.length; n++) {
            const group = groups[n];
            for (let j = 0; j < group.length; j++) {
                if (isOverlappingX(node, group[j])) {
                    // 如果有横坐标上的交叉，将节点添加到组中
                    group.push(node);
                    addedToGroup = true;
                    break a;
                }
            }
        }
        // 如果节点不属于任何组，创建一个新组
        if (!addedToGroup) {
            groups.push([node]);
        }
    }
    return groups;
}

/**
 * TODO: 分组逻辑重构
 * 
 * 1. 交叉的盒子不一定要变成绝对定位，容许负margin的存在
 * 2. 优化绝对定位盒子的判断，如：单纯的文本节点不能作绝对定位
 * 3. 先划分盒子，再进行重复分组
 * 4. 划分盒子不一定先横着划分
 *    > 算法逻辑是，看哪种划分方式生成的直接子节点数量少就用哪种
 * /

/** 将子节点按行或列归组 */
function groupNodes(nodes: VNode[]): VNode[] {
    if (!nodes.length) return [];

    // 先考虑横着排，找高度最高的节点，往后面找底线不超过它的节点
    // 这些元素中，再划分竖着的盒子，只要横坐标重叠的元素，全部用一个竖盒子包裹
    const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
    const [intersectingNodes, leftoverNodes] = _.partition(nodes, node => node.bounds.top >= highestNode.bounds.top && node.bounds.bottom <= highestNode.bounds.bottom);

    if (intersectingNodes.length > 1) {
        const groups = groupNodesByOverlapX(intersectingNodes);
        const nodesx = groups.map(group => {
            if (group.length > 1) {
                const vnode = newVNode({
                    classList: [],
                    direction: Direction.Column,
                    bounds: getBounds(group),
                    children: group,
                    index: context.index++
                });

                if (intersectingNodes.length > group.length) {
                    // 继续分割
                    vnode.children = groupNodes(group);
                }
                // 从上到下
                vnode.children = _.sortBy(vnode.children, n => n.bounds.top);
                groupListYNodes(vnode);
                return vnode;
            } else {
                return group[0];
            }
        });
        const vnode = newVNode({
            classList: [],
            direction: Direction.Row,
            bounds: getBounds(nodesx),
            index: context.index++,
            // 从左到右
            children: _.sortBy(nodesx, n => n.bounds.left),
        });
        return [vnode, ...groupNodes(leftoverNodes)];
    } else {
        return [highestNode, ...groupNodes(leftoverNodes)];
    }
}

/** 生成flexbox盒子 */
function buildFlexBox(parent: VNode) {
    if (parent.children && parent.children.length) {
        assert(!parent.direction, "这里应该还没生成flex盒子");
        // 先从上到下/从左到右排序
        parent.children.sort((a, b) => {
            if (numEq(a.bounds.top, b.bounds.top)) {
                if (numEq(a.bounds.left, b.bounds.left)) {
                    return 0;
                } else {
                    return a.bounds.left - b.bounds.left;
                }
            } else {
                return a.bounds.top - b.bounds.top;
            }
        });
        parent.children = groupListXNodes(parent.children);
        parent.children = tryMergeListXNodes(parent.children);
        parent.children = groupNodes(parent.children);
        mergeUnnessaryFlexBox(parent);
        setFlexDirection(parent);
    }
}

function mergeNode(dest: VNode, src: VNode) {
    if (isTextNode(dest)) {
        console.warn('其他节点往文本节点合并，只能当作依附元素');
        (dest.attachNodes ??= []).push(src);
        return;
    }

    if (isTextNode(src)) {
        console.warn('文本节点往其他节点合并');
        dest.textContent = src.textContent;
        dest.textMultiLine = src.textMultiLine;

        if (dest.children) {
            _.remove(dest.children, src);
            if (dest.children.length) {
                console.warn('其他节点只能当作依附元素');
                (dest.attachNodes ??= []).push(...(src.attachNodes || []).slice());
                dest.children.length = 0;
            }
        }
    }

    // 这里要合并样式，将src合并到dest
    if (src.id) {
        dest.id = src.id;
    }
    dest.tagName = src.tagName;
    dest.classList = _.union(dest.classList, src.classList);

    if (src.widthSpec && dest.widthSpec !== SizeSpec.Fixed) {
        // 尺寸固定的元素不能被覆盖
        dest.widthSpec = src.widthSpec;
    }
    if (src.heightSpec && dest.heightSpec !== SizeSpec.Fixed) {
        dest.heightSpec = src.heightSpec;
    }

    dest.style = _.merge(dest.style, src.style);
    dest.attributes = _.merge(dest.attributes, src.attributes);
    if (src.role) {
        if (dest.role) {
            console.warn('role冲突');
        }
        dest.role = src.role;
    }
    dest.direction = src.direction;
    dest.attachNodes = _.union(dest.attachNodes, src.attachNodes);
}

/** 提前先把和父盒子一样大的消掉 */
function mergeUnnessaryNodes(parent: VNode) {
    const { children } = parent;

    if (!children || !children.length) {
        return;
    }

    const childIdx = _.findIndex(children, child => isEqualBox(parent, child));
    if (childIdx === -1) {
        return;
    }

    const child = children[childIdx];
    console.debug('合并跟父亲一样大的盒子');
    mergeNode(parent, child);
    children.splice(childIdx, 1, ...(child.children || []));

    // 继续移除，这里也可以不加，防止有几个相同大小的盒子连续嵌套
    mergeUnnessaryNodes(parent);
}

/** 移除不必要的中间flex盒子 */
function mergeUnnessaryFlexBox(parent: VNode) {
    const { children } = parent;

    if (!children || children.length !== 1) {
        return;
    }

    const child = children[0];
    // 子盒子可以扩大
    if (
        child.heightSpec !== SizeSpec.Fixed &&
        child.widthSpec !== SizeSpec.Fixed &&
        isGhostNode(child)
    ) {
        child.bounds = {
            ...parent.bounds
        };
    }

    // 两个盒子一样大
    if (isEqualBox(parent, child)) {
        mergeNode(parent, child);
        children.splice(0, 1, ...(child.children || []));
        return;
    }


}

/** 设置自身的flex-direction */
function setFlexDirection(parent: VNode) {
    if (parent.direction || !parent.children || !parent.children.length) {
        return;
    }

    // TODO: 单个子元素的布局相对灵活，需要优化
    // 优化思路：看哪种方式需要的样式少就用哪种
    if (parent.children.length === 1) {
        parent.direction = Direction.Row;
        parent.children = _.sortBy(parent.children, (child) => child.bounds.left);
    } else {
        parent.direction = Direction.Column;
        parent.children = _.sortBy(parent.children, (child) => child.bounds.top);
        groupListYNodes(parent);
    }
}

/** 生成align-items */
function measureFlexAlign(parent: VNode) {
    const children = parent.children!;

    const sf = parent.direction === Direction.Row ? 'top' : 'left';
    const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
    const s = sf[0];
    const e = ef[0];
    const alignSpec = parent.direction === Direction.Row ? 'heightSpec' : 'widthSpec';
    const alignSpecSize = parent.direction === Direction.Row ? 'height' : 'width';

    type Margin = {
        marginStart: number,
        marginEnd: number,
        marginDiff: number
    };
    // 据children在node中的位置计算flex对齐方式
    const margins: Margin[] = children.map(n => {
        const marginStart = n.bounds[sf] - parent.bounds[sf];
        const marginEnd = parent.bounds[ef] - n.bounds[ef];

        let marginDiff = marginStart - marginEnd;
        // 如果任意一边没有边距，则居中没有意义；用NaN来表示伪居中
        if (numEq(marginStart, 0) || numEq(marginEnd, 0)) {
            marginDiff = NaN;
        }

        return {
            marginStart,
            marginEnd,
            marginDiff
        }
    });
    const possibleAlignCenter = (margin: Margin) => {
        return numEq(margin.marginStart, margin.marginEnd);
    };

    function setFlexAlign(parentAlign: string) {
        function mayNeedAlign(childAlign: string) {
            return childAlign === parentAlign ? '' : `self-${childAlign}`;
        }

        function setFixOrAutoAlign(child: VNode, margin: Margin) {
            if (possibleAlignCenter(margin)) {
                child.classList.push(mayNeedAlign('center'));
            } else if (margin.marginStart < margin.marginEnd) {
                child.classList.push(mayNeedAlign('start'));
                child.classList.push(R`m${s}-${margin.marginStart}`);
            } else {
                child.classList.push(mayNeedAlign('end'));
                child.classList.push(R`m${e}-${margin.marginEnd}`);
            }
        }

        function setConstrainedAlign(child: VNode, margin: Margin) {
            child.classList.push(mayNeedAlign('stretch'));
            child.classList.push(R`m${s}-${margin.marginStart} m${e}-${margin.marginEnd}`);
        }

        /** 扩充auto元素的尺寸，并保持内部元素撑开方向 */
        function expandAutoContents(child: VNode, margin: Margin) {
            // TODO: 这里只是粗暴的计算撑开方向，
            // 实际情况可能不是哪边预留空间多就往哪边撑，比如背景是个图
            // 根据策略来扩充
            const allocSpaceForAuto = defaultConfig.allocSpaceForAuto;

            if (
                // 这两种容器横向没法自由撑开, 可以优化判断下，横向只能可以往右撑开
                // 竖向撑开的做法也不一样 align-content/多行文本包一个div然后用flex居中等
                (isFlexWrapLike(child))
            ) {
                if (alignSpec === 'widthSpec') {
                    // 只能处理往右撑开的
                    if (parent[alignSpec] === SizeSpec.Auto) {
                        changeChildSizeSpec(child, alignSpec, SizeSpec.Auto, SizeSpec.Fixed);
                        setFixOrAutoAlign(child, margin);
                        return true;
                    }

                    return;
                }

                if (isListWrapContainer(child)) {
                    // 保留auto元素的位置
                    if (possibleAlignCenter(margin)) {
                        // 往两边撑开
                        child.classList.push('content-center')
                    } else if (margin.marginStart < margin.marginEnd) {
                        // 往下边撑开
                        child.classList.push('content-start');
                    } else {
                        // 往上边撑开
                        child.classList.push('content-end');
                    }
                } else if (isMultiLineText(child)) {
                    // 用一个子元素包起来
                    child.textContent = [
                        newVNode(_.cloneDeep(child))
                    ];
                    child.classList.push('flex');

                    // 保留auto元素的位置
                    if (possibleAlignCenter(margin)) {
                        // 往两边撑开
                        child.classList.push('items-center')
                    } else if (margin.marginStart < margin.marginEnd) {
                        // 往下边撑开
                        child.classList.push('items-start');
                    } else {
                        // 往上边撑开
                        child.classList.push('items-end');
                    }
                }
            } else {
                // 保留auto元素的位置
                if (possibleAlignCenter(margin)) {
                    // 往两边撑开
                    setAutoContentsAlign(child, 'center');
                } else if (margin.marginStart < margin.marginEnd) {
                    // 往右边撑开
                    setAutoContentsAlign(child, 'start');
                } else {
                    // 往左边撑开
                    setAutoContentsAlign(child, 'end');
                }
            }

            // Auto元素需要自动撑开
            const realMargin = Math.min(margin.marginEnd, margin.marginStart);
            margin.marginStart = margin.marginEnd = realMargin;

            child.bounds[sf] = parent.bounds[sf] + realMargin;
            child.bounds[ef] = parent.bounds[ef] - realMargin;
            child.bounds[alignSpecSize] = child.bounds[ef] - child.bounds[sf];
        }

        if (parentAlign !== 'stretch') {
            parent.classList.push(`items-${parentAlign}`);
        }

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (child[alignSpec] === SizeSpec.Fixed) {
                setFixOrAutoAlign(child, margin);
            } else if (child[alignSpec] === SizeSpec.Constrained) {
                setConstrainedAlign(child, margin);
            } else if (child[alignSpec] === SizeSpec.Auto) {
                // 这里主要是把给auto尺寸的元素多留一点空间
                // 除了列表和文本，其他的都不多留，因为只有列表和文本内部可视为一个整体，后续再看
                if (
                    isListContainer(child) ||
                    isTextNode(child) ||
                    (isCrossDirection(child, parent) && isGhostNode(child)) // 没有样式的幽灵节点可以扩充下
                ) {
                    if (expandAutoContents(child, margin)) {
                        return;
                    }
                } else if (maybeInlineButton(child)) {
                    setFixOrAutoAlign(child, margin);
                    return;
                }

                changeChildSizeSpec(child, alignSpec, SizeSpec.Auto, SizeSpec.Constrained);
                setConstrainedAlign(child, margin);

                // TODO: 处理auto元素的最大宽度
            } else {
                unreachable();
            }
        });
    }

    // 这种情况下容器没法撑开，会坍缩成0尺寸，给个最小尺寸兜底
    if (parent[alignSpec] === SizeSpec.Constrained && _.every(children, child => child[alignSpec] === SizeSpec.Constrained)) {
        parent.classList.push(R`min-${alignSpecSize.substring(0, 1)}-${parent.bounds[alignSpecSize]}`);
    }

    // 优先视觉上居中的元素，只要有且不是全部，就不能设置align
    if (_.filter(margins, possibleAlignCenter).length !== margins.length) {
        setFlexAlign('stretch');
        return;
    }

    /** 获取超过一半的元素的共同margin */
    function getCommonMarginOverHalf(key: 'marginStart' | 'marginEnd' | 'marginDiff') {
        // 使用groupBy对数组进行分组
        const grouped = groupByWith(margins, m => m[key], numEq);

        // 这里删除伪居中
        grouped.delete(NaN);

        /** 数量最多&数值最小的优先 */
        const maxMargin = Array.from(grouped.values()).sort((a, b) => {
            if (a.length === b.length) {
                return Math.abs(a[0][key]) - Math.abs(b[0][key]);
            } else {
                return b.length - a.length;
            }
        })[0];
        if (maxMargin && maxMargin.length * 2 > margins.length) {
            return [maxMargin.length, maxMargin[0][key]] as const;
        } else {
            return [0, 0] as const;
        }
    }

    // 归组, 看哪种对齐方式最多
    const [commonMarginStartCount, commonMarginStart] = getCommonMarginOverHalf('marginStart');
    const [commonMarginEndCount, commonMarginEnd] = getCommonMarginOverHalf('marginEnd');
    const [commonMarginDiffCount, commonMarginDiff] = getCommonMarginOverHalf('marginDiff');
    const maxCommonMarginCount = Math.max(commonMarginStartCount, commonMarginEndCount, commonMarginDiffCount);

    if (maxCommonMarginCount <= 1) {
        setFlexAlign('stretch');
    } else if (maxCommonMarginCount === commonMarginDiffCount) {
        // 优先处理居中

        if (numEq(commonMarginDiff / 2, 0)) {
            // 无需处理
        } else if (commonMarginDiff > 0) {
            parent.classList.push(`p${s}-${commonMarginDiff}`);
            margins.forEach(margin => {
                margin.marginStart -= commonMarginDiff;
                margin.marginDiff -= commonMarginDiff;
            });
        } else if (commonMarginDiff < 0) {
            parent.classList.push(`p${e}-${-commonMarginDiff}`);
            margins.forEach(margin => {
                margin.marginEnd += commonMarginDiff;
                margin.marginDiff -= commonMarginDiff;
            });
        }

        setFlexAlign('center');
    } else if (maxCommonMarginCount === commonMarginStartCount) {
        // 只有在共同左边距是最小左边距时，我们才加padding，因为我们不想有负的margin
        if (!numEq(commonMarginStart, 0) && _.min(margins.map(m => m.marginStart)) === commonMarginStart) {
            parent.classList.push(`p${s}-${commonMarginStart}`);
            margins.forEach(margin => {
                margin.marginStart -= commonMarginStart;
                margin.marginDiff -= commonMarginStart;
            });
        }

        setFlexAlign('start');
    } else if (maxCommonMarginCount === commonMarginEndCount) {
        // 只有在共同右边距是最小右边距时，我们才加padding，因为我们不想有负的margin
        if (!numEq(commonMarginEnd, 0) && _.min(margins.map(m => m.marginEnd)) === commonMarginEnd) {
            parent.classList.push(`p${s}-${commonMarginEnd}`);
            margins.forEach(margin => {
                margin.marginStart -= commonMarginEnd;
                margin.marginDiff += commonMarginEnd;
            });
        }

        setFlexAlign('end');
    } else {
        setFlexAlign('stretch');
    }
}

/** 生成justify-content */
function measureFlexJustify(parent: VNode) {
    const children = parent.children!;

    const ssf = parent.direction === Direction.Row ? 'left' : 'top';
    const eef = parent.direction === Direction.Row ? 'right' : 'bottom';
    const ss = ssf[0];
    const ee = eef[0];
    const xy = parent.direction === Direction.Row ? 'x' : 'y';
    const justifySpec = parent.direction === Direction.Row ? 'widthSpec' : 'heightSpec';

    // 根据children在node中的位置计算flex主轴布局
    const ranges = _.zip(
        [...children.map(n => n.bounds[ssf]), parent.bounds[eef]],
        [parent.bounds[ssf], ...children.map(n => n.bounds[eef])]
    ) as [number, number][];
    const gaps = ranges.map(([p, n]) => p - n);
    const startGap = gaps.shift()!;
    const endGap = gaps.pop()!;
    const equalMiddleGaps = allNumsEqual(gaps);
    let justifySide = numEq(startGap, endGap) && !numEq(startGap, 0) ? 'center' : numLt(startGap, endGap) ? 'start' : 'end';

    function maybeInsertFlex1() {
        if (
            parent[justifySpec] === SizeSpec.Auto &&
            !getClassList(parent).some(className => className.startsWith(`min-${justifySpec.slice(0, 1)}-`))
        ) {
            // 由内容自动撑开，则必须具有最小尺寸，否则flex1无效
            return;
        }

        // 第一个间隙是左边距

        if (gaps.length - 1 < 2) {
            // 2个及以上元素才能用flex1做弹性拉伸
            return;
        }

        // 可以通过flex1实现和stretch类似的效果
        const flex1GapIndex = (() => {
            // TODO: 生成多个flex1
            const maxGap = _.max(gaps)!;
            return gaps.indexOf(maxGap);
        })();

        if (flex1GapIndex === 0) {
            // 第一个间隙不能撑开
            return;
        }

        gaps[flex1GapIndex] = 0;
        gaps.splice(flex1GapIndex, 0, 0);

        const sf = parent.direction === Direction.Row ? 'top' : 'left';
        const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
        const spec1 = parent.direction === Direction.Row ? 'width' : 'height';
        const spec2 = parent.direction === Direction.Row ? 'height' : 'width';
        const pos = Math.round(parent.bounds[sf] + parent.bounds[ef] / 2);
        const [eefn, ssfn] = ranges[flex1GapIndex];

        const flex1Vnode = newVNode({
            bounds: {
                [sf]: pos,
                [ef]: pos,
                [ssf]: ssfn,
                [eef]: eefn,
                [spec1]: eefn - ssfn,
                [spec2]: 0,
            } as any,
            classList: [],
            [`${spec1}Spec`]: SizeSpec.Constrained,
            [`${spec2}Spec`]: SizeSpec.Fixed,
            index: context.index++
        });
        if (parent[justifySpec] === SizeSpec.Auto) {
            flex1Vnode.classList.push(R`min-${spec1.slice(0, 1)}-${flex1Vnode.bounds[spec1]}`);
        }

        children.splice(flex1GapIndex, 0, flex1Vnode);
    }

    function defaultJustify() {
        gaps.unshift(startGap);

        maybeInsertFlex1();

        if (justifySide === 'center') {
            gaps.forEach((g, i) => {
                if (i < 2) {
                    return;
                }
                children[i].classList.push(R`m${ss}-${g}`);
            });
            parent.classList.push(R`p${xy}-${startGap}`);
        } else if (justifySide === 'start') {
            gaps.push(endGap);
            gaps.slice(1).forEach((g, i) => {
                children[i].classList.push(R`m${ee}-${g}`);
            });
            parent.classList.push(R`p${ss}-${endGap}`);
        } else if (justifySide === 'end') {
            gaps.forEach((g, i) => {
                children[i].classList.push(R`m${ss}-${g}`);
            });
            parent.classList.push(R`p${ee}-${endGap}`);
        }
    }

    function sideJustify() {
        if (justifySide === 'center') {
            parent.classList.push('justify-center');
        } else if (justifySide === 'start') {
            // 
        } else if (justifySide === 'end') {
            parent.classList.push('justify-end');
        }

        if (equalMiddleGaps && children.length > 1) {
            parent.classList.push(R`space-${xy}-${gaps[0]}`);

            if (justifySide === 'start') {
                parent.classList.push(R`p${ss}-${startGap}`);
            } else if (justifySide === 'end') {
                parent.classList.push(R`p${ee}-${endGap}`);
            }
        } else {
            if (justifySide === 'center') {
                _.each(children.slice(1), (child, i) => {
                    child.classList.push(R`m${ss}-${gaps[i]}`);
                });
            } else if (justifySide === 'start') {
                gaps.unshift(startGap);
                _.each(children, (child, i) => {
                    child.classList.push(R`m${ss}-${gaps[i]}`);
                });
            } else if (justifySide === 'end') {
                gaps.push(endGap);
                _.each(children, (child, i) => {
                    child.classList.push(R`m${ee}-${gaps[i]}`);
                });
            }
        }
    }

    // if (parent[justifySpec] === SizeSpec.Auto) {
    //     // 对多行元素需要设置固定尺寸
    //     _.each(children, child => {
    //         if (isFlexWrapLike(child) && child[justifySpec] === SizeSpec.Auto) {
    //             child[justifySpec] = SizeSpec.Fixed;
    //         }
    //     });
    // }

    // 已经在扩充auto元素尺寸时指定过了
    parent.classList = getClassList(parent);
    const specifiedSide = parent.classList.find(className => className.startsWith('justify-'));
    if (specifiedSide) {
        removeEle(parent.classList, specifiedSide);
        justifySide = specifiedSide.split('justify-')[1];
        sideJustify();
        return;
    }

    if (parent[justifySpec] === SizeSpec.Auto) {
        defaultJustify();
    }
    // 一个子元素, 或者子元素之间紧挨在一起视同为一个元素
    else if (!gaps.length || (equalMiddleGaps && numEq(gaps[0], 0))) {
        // TODO: 单行居中，多行居左?
        // children.length === 1 && justifySpec === 'widthSpec' && isFlexWrapLike(children[0])
        sideJustify();
    }
    // 中间间隔相等
    else if (equalMiddleGaps) {
        const sameGap = gaps[0];

        if (numEq(startGap, endGap) && numEq(startGap * 2, gaps[0]) && !numEq(startGap, 0)) {
            parent.classList.push('justify-around');
        } else if (numGt(sameGap, startGap) && numGt(sameGap, endGap)) {
            parent.classList.push(R`justify-between p${ss}-${startGap} p${ee}-${endGap}`);
        } else {
            sideJustify();
        }
    } else {
        const maxGap = _.max(gaps)!;
        if (numGt(maxGap, startGap) && numGt(maxGap, endGap)) {
            defaultJustify();
        } else {
            sideJustify();
        }
    }

    // 对所有灵活伸缩的元素设置flex1
    _.each(children, child => {
        if (child[justifySpec] === SizeSpec.Constrained) {
            child.classList.push('flex-1');
        }
    });
}

/** 
 * 
 * 修改flexbox子元素的尺寸类型, 只有两种情况 
 * 1. Auto -> Constrained
 * 2. Auto -> Fixed
 */
function changeChildSizeSpec(
    child: VNode,
    alignSpec: 'widthSpec' | 'heightSpec',
    from: SizeSpec,
    to: SizeSpec
) {
    assert(child[alignSpec] === from, `不允许修改的尺寸类型: ${from}`);

    if (from === SizeSpec.Auto) {
        assert(to === SizeSpec.Constrained || to === SizeSpec.Fixed, `不允许这样修改尺寸类型: ${from} -> ${to}`);
    }

    child[alignSpec] = to;
}

/** 根据子元素确定父盒子的尺寸类型 */
function measureParentSizeSpec(parent: VNode, grandParent: VNode) {
    const children = parent.children;
    if (!children || !children.length) {
        // if (maybeDivider(parent)) {
        //     return;
        // }

        // TODO: 裸盒子的尺寸如何确定
        if (!parent.widthSpec || !parent.heightSpec) {
            console.debug('遇到裸盒子', parent.id, parent.role);
        }

        if (!parent.widthSpec) {
            if (_.includes(grandParent.attachNodes, parent)) {
                // 绝对定位的没法确定尺寸了，先用Fixed
                parent.widthSpec = SizeSpec.Fixed;
            } else if (grandParent.direction === Direction.Column) {
                parent.widthSpec = SizeSpec.Constrained;
            } else {
                parent.widthSpec = SizeSpec.Fixed;
            }
        }

        if (!parent.heightSpec) {
            if (_.includes(grandParent.attachNodes, parent)) {
                // 绝对定位的没法确定尺寸了，先用Fixed
                parent.heightSpec = SizeSpec.Fixed;
            } else if (grandParent.direction === Direction.Row) {
                parent.heightSpec = SizeSpec.Constrained;
            } else {
                parent.heightSpec = SizeSpec.Fixed;
            }
        }
        return;
    }

    if (parent.direction === Direction.Row) {
        if (!parent.widthSpec) {
            parent.widthSpec = SizeSpec.Auto;
        }
        if (!parent.heightSpec) {
            if (_.some(children, child => child.heightSpec === SizeSpec.Auto)) {
                parent.heightSpec = SizeSpec.Auto;
            } else {
                parent.heightSpec = SizeSpec.Fixed;
            }
        }
    }

    if (parent.direction === Direction.Column) {
        if (!parent.heightSpec) {
            parent.heightSpec = SizeSpec.Auto;
        }
        if (!parent.widthSpec) {
            if (_.some(children, child => child.widthSpec === SizeSpec.Auto)) {
                parent.widthSpec = SizeSpec.Auto;
            } else {
                parent.widthSpec = SizeSpec.Fixed;
            }
        }
    }
}

/** 生成flex-wrap布局 */
function measureFlexWrapLayout(parent: VNode) {
    parent.classList.push('flex-wrap');
    const firstChild = parent.children![0];
    const secondChild = parent.children![1];
    const xGap = secondChild.bounds.left - firstChild.bounds.right;
    const firstWrapChild = _.find(parent.children, (child) => !numEq(child.bounds.top, firstChild.bounds.top), 1)!;
    assert(numEq(firstWrapChild.bounds.left, firstChild.bounds.left), 'flex-wrap不规范，左边没对齐');
    const yGap = firstWrapChild.bounds.top - firstChild.bounds.bottom;
    _.each(parent.children, (child) => {
        child.classList.push(R`ml-${xGap} mt-${yGap}`);
    });

    // flex-wrap应该留出左边的间距, 再多预留两像素吧
    parent.bounds.width += xGap + 2;

    // vnode.classList.push(R`ml-${-xGap} mt-${-yGap}`);
    // 合并margin
    mergeMargin();

    function mergeMargin() {
        parent.classList = getClassList(parent);
        const mlCls = _.find(parent.classList, (c) => c.startsWith('ml-') || c.startsWith('mx-')) || 'ml-0';
        const [p, v] = mlCls.split('-');
        removeEle(parent.classList, mlCls);
        if (p === 'ml') {
            parent.classList.push(R`ml-${+v - xGap}`);
        } else if (p === 'mx') {
            parent.classList.push(R`ml-${+v - xGap} mr-${v}`);
        }
        const mtCls = _.find(parent.classList, (c) => c.startsWith('mt-') || c.startsWith('my-')) || 'mt-0';
        const [p2, v2] = mtCls.split('-');
        removeEle(parent.classList, mtCls);
        if (p2 === 'mt') {
            parent.classList.push(R`mt-${+v2 - yGap}`);
        } else if (p2 === 'my') {
            parent.classList.push(R`mt-${+v2 - yGap} mb-${v2}`);
        }
    }
}

/** 生成列表布局 */
function measureFlexListLayout(parent: VNode) {
    const firstChild = parent.children![0];
    const secondChild = parent.children![1];

    if (parent.role === 'list-x') {
        const xGap = secondChild.bounds.left - firstChild.bounds.right;
        parent.classList.push(R`space-x-${xGap}`);
    } else if (parent.role === 'list-y') {
        const yGap = secondChild.bounds.top - firstChild.bounds.bottom;
        parent.classList.push(R`space-y-${yGap}`);
    }
}

/** 生成flexbox布局 */
function measureFlexLayout(parent: VNode) {
    if (parent.children?.length) {
        parent.classList.push('flex');
        if (parent.direction === Direction.Column) {
            parent.classList.push('flex-col');
        }

        if (parent.role === 'list-wrap') {
            measureFlexWrapLayout(parent);
        } else if (parent.role === 'list-x' || parent.role === 'list-y') {
            measureFlexListLayout(parent);
        } else {
            measureFlexAlign(parent);
            measureFlexJustify(parent);
        }
    }

    if (parent.widthSpec === SizeSpec.Fixed) {
        parent.classList.push(R`w-${parent.bounds.width}`);
    }
    if (parent.heightSpec === SizeSpec.Fixed) {
        parent.classList.push(R`h-${parent.bounds.height}`);
    }
}

/** 生成绝对定位 */
function measureAttachPosition(parent: VNode) {
    const attachNodes = parent.attachNodes;
    if (!attachNodes || !attachNodes.length) {
        return;
    }
    _.each(attachNodes, (attachNode) => {
        const [left, right, top, bottom] = [
            attachNode.bounds.left - parent.bounds.left,
            parent.bounds.right - attachNode.bounds.right,
            attachNode.bounds.top - parent.bounds.top,
            parent.bounds.bottom - attachNode.bounds.bottom,
        ];
        if (anyElesIn(getClassList(parent), ['relative', 'absolute', 'fixed'])) {
            // 已经脱离文档流
        } else {
            parent.classList.push('relative');
        }
        attachNode.classList.push('absolute');

        function decideAutoExpandSide(horizontal: boolean) {
            if (horizontal) {
                let leftSpace = left, rightSpace = right;
                if (left < 0 && right > 0) {
                    rightSpace = parent.bounds.width - rightSpace;
                } else if (right < 0 && left > 0) {
                    leftSpace = parent.bounds.width - leftSpace;
                }
                return Math.abs(leftSpace) < Math.abs(rightSpace) ? `left-${left}` : `right-${right}`;
            } else {
                let topSpace = top, bottomSpace = bottom;
                if (top < 0 && bottom > 0) {
                    bottomSpace = parent.bounds.height - bottomSpace;
                } else if (bottom < 0 && top > 0) {
                    topSpace = parent.bounds.height - topSpace;
                }
                return Math.abs(topSpace) < Math.abs(bottomSpace) ? `top-${top}` : `bottom-${bottom}`;
            }
        }

        if (
            attachNode.widthSpec === SizeSpec.Auto &&
            numEq(left, right) &&
            attachNode.bounds.width * 2 > parent.bounds.width
        ) {
            attachNode.widthSpec = SizeSpec.Constrained;
        }

        if (attachNode.widthSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`left-${left} right-${right}`);
        } else {
            if (attachNode.widthSpec === SizeSpec.Fixed && numEq(left, right)) {
                // 绝对定位居中
                attachNode.classList.push('left-1/2 -translate-x-1/2');
            } else {
                attachNode.classList.push(normalizeClassName(decideAutoExpandSide(true), false));
            }
        }

        if (
            attachNode.heightSpec === SizeSpec.Auto &&
            numEq(top, bottom) &&
            attachNode.bounds.height * 2 > parent.bounds.height
        ) {
            attachNode.heightSpec = SizeSpec.Constrained;
        }

        if (attachNode.heightSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`top-${top} bottom-${bottom}`);
        } else {
            if (attachNode.heightSpec === SizeSpec.Fixed && numEq(top, bottom)) {
                // 绝对定位居中
                attachNode.classList.push('top-1/2 -translate-y-1/2');
            } else {
                attachNode.classList.push(normalizeClassName(decideAutoExpandSide(false), false));
            }
        }
    });
}

/** 生成规范的flexbox树结构 */
function buildTree(vnode: VNode) {
    if (!vnode.direction) {
        mergeUnnessaryNodes(vnode);
        buildMissingNodes(vnode);
        buildFlexBox(vnode);
    }

    _.each(vnode.children, buildTree);
    _.each(vnode.attachNodes, buildTree);
    _.each(vnode.children, child => measureParentSizeSpec(child, vnode));
    _.each(vnode.attachNodes, child => measureParentSizeSpec(child, vnode));
}

/** 计算flexbox布局 */
function measureTree(vnode: VNode) {
    // TODO: 前面会创建一些幽灵盒子，都是flex容器，需尝试扩大容器
    // expandGhostNodes(vnode);

    // 从根节点开始，根节点宽高都是弹性尺寸
    measureFlexLayout(vnode);
    // 计算好自身的尺寸，才能计算绝对定位元素的尺寸
    measureAttachPosition(vnode);

    _.each(vnode.children, measureTree);
    _.each(vnode.attachNodes, measureTree);
}

/** 对节点树进行重建/重组/布局 */
export function postprocess(vnode: VNode) {
    if (!debug.keepOriginalTree) {
        ; (function unwrapAllNodes() {
            const vnodes: VNode[] = [];
            const collectVNodes = (vnode: VNode) => {
                vnodes.push(vnode);
                _.each(vnode.children, collectVNodes);
                vnode.children = [];
            };
            _.each(vnode.children, collectVNodes);
            vnode.children = vnodes;
        })();
        removeGhostNodes(vnode);
    }

    if (debug.buildToStage >= BuildStage.Tree) {
        buildTree(vnode);
    }

    if (debug.buildToStage >= BuildStage.Measure) {
        measureTree(vnode);
    }
}