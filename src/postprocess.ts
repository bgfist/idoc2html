import * as _ from 'lodash';
import { R, R2, assert, groupByWith, groupWith, numSame, removeEle, removeEles, unreachable } from "./utils";
import { Direction, SizeSpec, VNode, context } from "./vnode";
import { BuildStage, debug } from './config';

function isContainedWithinX(child: VNode, parent: VNode) {
    return (
        (numSame(child.bounds.left, parent.bounds.left) || child.bounds.left >= parent.bounds.left) &&
        (numSame(child.bounds.right, parent.bounds.right) || child.bounds.right <= parent.bounds.right)
    );
}

function isContainedWithinY(child: VNode, parent: VNode) {
    return (
        (numSame(child.bounds.top, parent.bounds.top) || child.bounds.top >= parent.bounds.top) &&
        (numSame(child.bounds.bottom, parent.bounds.bottom) || child.bounds.bottom <= parent.bounds.bottom)
    );
}

/** 处理元素之间的包含关系 */
function isContainedWithin(child: VNode, parent: VNode) {
    return isContainedWithinX(child, parent) && isContainedWithinY(child, parent);
}

function isOverlappingX(child: VNode, parent: VNode) {
    return (
        (!numSame(child.bounds.left, parent.bounds.right) && child.bounds.left < parent.bounds.right) &&
        (!numSame(child.bounds.right, parent.bounds.left) && child.bounds.right > parent.bounds.left)
    );
}

function isOverlappingY(child: VNode, parent: VNode) {
    return (
        (!numSame(child.bounds.top, parent.bounds.bottom) && child.bounds.top < parent.bounds.bottom) &&
        (!numSame(child.bounds.bottom, parent.bounds.top) && child.bounds.bottom > parent.bounds.top)
    );
}

/** 处理元素之间的重叠关系 */
function isOverlapping(child: VNode, parent: VNode,) {
    return isOverlappingX(child, parent) && isOverlappingY(child, parent);
}

/** 判断节点是不是边框/分隔线 */
function maybeBorder(child: VNode, parent: VNode) {
    if (numSame(child.bounds.width, 1)) {
        return (numSame(child.bounds.left, parent.bounds.left) || numSame(child.bounds.right, parent.bounds.right)) && 'width';
    }
    if (numSame(child.bounds.height, 1)) {
        return (numSame(child.bounds.top, parent.bounds.top) || numSame(child.bounds.bottom, parent.bounds.bottom)) && 'height';
    }
}

function isTextNode(vnode: VNode) {
    return !!vnode.textContent;
}

function isGhostNode(vnode: VNode) {
    return _.isEmpty(vnode.classList);
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
            (bestParent.children ??= []).push(node);
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
        }

        // 过小的元素有可能是边框,做成绝对定位
        const borderSpec = maybeBorder(node, parent);
        if (borderSpec) {
            node.role = 'border';
            node[`${borderSpec}Spec`] = SizeSpec.Fixed;
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
        numSame(a.bounds.top, b.bounds.top) &&
        numSame(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) && !isTextNode(b) &&
        numSame(a.bounds.top, b.bounds.top) &&
        numSame(a.bounds.width, b.bounds.width) &&
        numSame(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    return false;
}

/** 两个盒子是否相似 */
function isSimilarBoxY(a: VNode, b: VNode) {
    if (
        isTextNode(a) && isTextNode(b) &&
        numSame(a.bounds.left, b.bounds.left) &&
        numSame(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) && !isTextNode(b) &&
        numSame(a.bounds.left, b.bounds.left) &&
        numSame(a.bounds.width, b.bounds.width) &&
        numSame(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    return false;
}

/** 两个盒子是否相似 */
function isSimilarBoxWrap(a: VNode, b: VNode) {
    if (
        isTextNode(a) && isTextNode(b) &&
        numSame(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) && !isTextNode(b) &&
        numSame(a.bounds.width, b.bounds.width) &&
        numSame(a.bounds.height, b.bounds.height)
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
    while (isSimilarBoxWrap(nodes[cursor], nodes[baseRepeatStart + repeatCount % repeatGroupCount])) {
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

    /** 对临时归组的列表元素节点，检查其结构是否一致 */
    function checkListXNodesSimilar(children: VNode[]) {
        // 检查item内部相互间距是否一致
        const innerGaps = _.map(children, function (child) {
            const children = child.children!;
            const gaps = _.map(children.slice(1), function (current, index) {
                return current.bounds.left - children[index].bounds.right;
            });
            return gaps;
        });
        if (!_.every(_.zip(innerGaps), gap => _.uniqWith(gap as any, numSame).length === 1)) {
            console.warn('item内部结构不一致');
            return false;
        }

        // 优先检查item分布是否均匀
        const rulers = _.map(children.slice(1), function (current, index) {
            return current.bounds.left - children[index].bounds.left;
        });
        const repeatedRuler = _.uniqWith(rulers, numSame).length === 1;

        if (!repeatedRuler) {
            // 检查item间距是否一致
            const gaps = _.map(children.slice(1), function (current, index) {
                return current.bounds.left - children[index].bounds.right;
            });
            const equalGap = _.uniqWith(gaps, numSame).length === 1;

            if (equalGap) {
                return true;
            } else {
                console.warn('item间距不一致');
            }

            console.warn('item分布不均匀');
            return false;
        }

        // 扩充item宽度到至少80%间距
        const newWidth = _.max([
            Math.round(rulers[0] * 0.8),
            ..._.map(children, child => child.bounds.width)
        ])!;
        _.forEach(children, child => {
            child.bounds.width = newWidth;
            child.bounds.right = child.bounds.left + newWidth;
        });

        return true;
    }

    function checkListXNodesGap(children: VNode[]) {
        if (children.length > 2) {
            const gaps = _.map(children.slice(1), function (current, index) {
                return current.bounds.left - children[index].bounds.right;
            });
            const equalGap = _.uniqWith(gaps, numSame).length === 1;
            if (!equalGap) {
                // 文本节点有可能中线间隔一致
                if (isTextNode(children[0])) {
                    const gaps = _.map(children.slice(1), function (current, index) {
                        return (current.bounds.left + current.bounds.width / 2) - (children[index].bounds.right + children[index].bounds.width / 2);
                    });
                    const equalGap = _.uniqWith(gaps, numSame).length === 1;
                    if (!equalGap) {
                        console.warn('重复文本节点中线间隔不一致! 直接忽略');
                        return false;
                    } else {
                        // 文本节点中线间隔一致, 则可以归组, 将其宽度重新等分
                        _.each(children, function (child) {
                            const newWidth = Math.round(gaps[0] / 2);
                            const widthDiff = Math.round(newWidth - child.bounds.width) / 2;
                            child.bounds.width = newWidth;
                            child.bounds.left = child.bounds.left - widthDiff;
                            child.bounds.right = child.bounds.right + widthDiff;
                        });
                    }
                } else {
                    console.warn('重复节点间隔不统一! 直接忽略');
                    return false;
                }
            }
        }
        return true;
    }

    function checkNodesContinual(possibleRepeats: VNode[]) {
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
        if (!numSame(nodes[i].bounds.top, nodes[i - 1].bounds.top)) {
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

        // 重复节点之间断开了
        if (!repeatCount) {
            console.warn('重复节点断开了!');
            continue;
        }

        // 文本节点大概率重复, 如果只有俩个则忽略
        if (repeatGroupCount === 1 && isTextNode(nodes[baseRepeatStart]) && repeatCount === 2) {
            continue;
        }

        // 这些是确认重复可以归组的节点
        let children = nodes.slice(baseRepeatStart, baseRepeatStart + repeatCount);

        // 校验一下这些节点中间没有其他节点横插一脚
        if (!checkNodesContinual(children)) {
            console.debug('有节点看似重复，其实中间隔着其他节点');
            continue;
        }

        // 继续获取flex-wrap节点
        findFlexWrap(nodes, i, baseRepeatStart, repeatGroupCount, children);

        // 将children进行分组
        if (repeatGroupCount > 1) {
            console.debug('横向列表元素需要先归组');
            const repeatGroups = [];
            for (let j = 0; j < children.length; j += repeatGroupCount) {
                const group = children.slice(j, j + repeatGroupCount);
                const vnode: VNode = {
                    classList: [],
                    bounds: getBounds(group),
                    children: group,
                    role: 'list-item',
                    direction: Direction.Row,
                    index: context.index++
                };
                repeatGroups.push(vnode);
            }
            if (children.length === repeatCount && !checkListXNodesSimilar(repeatGroups)) {
                continue;
            }

            removeEles(nodes, children);
            children = repeatGroups;
        } else {
            if (children.length === repeatCount && !checkListXNodesGap(children)) {
                continue;
            }

            _.each(children, child => {
                child.role = 'list-item';
            });
            removeEles(nodes, children);
        }

        const vnode: VNode = {
            classList: [],
            bounds: getBounds(children),
            children,
            role: 'list-x',
            direction: Direction.Row,
            widthSpec: SizeSpec.Auto,
            index: context.index++
        };
        if (children.length > repeatCount) {
            // 是flex-wrap
            console.debug('找到横向flex-wrap列表');
            vnode.role = 'list-wrap';
            vnode.heightSpec = SizeSpec.Auto;
            _.each(children, child => {
                child.widthSpec = SizeSpec.Fixed;
                child.heightSpec = SizeSpec.Fixed;
            });
        } else {
            console.debug('找到横向列表');
            vnode.role = 'list-x';
            _.each(children, child => {
                child.widthSpec = SizeSpec.Fixed;
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
            }

            const children = nodes.slice(baseRepeatStart, baseRepeatStart + repeatCount);
            const gaps = _.map(children.slice(1), function (current, index) {
                return current.bounds.left - children[index].bounds.right;
            });
            const equalGap = _.uniqWith(gaps, numSame).length === 1;
            if (!equalGap) {
                console.warn('纵向列表节点间距不一致，无法进行list-y处理');
                return;
            }

            console.debug('找到纵向列表');
            _.each(children, child => {
                child.role = 'list-item';
                child.heightSpec = SizeSpec.Fixed;
            });

            if (baseRepeatStart === 0 && repeatCount === nodes.length) {
                console.debug('纵向列表占满父盒子');
                parent.role = 'list-y';
                parent.heightSpec = SizeSpec.Auto;
                return;
            }

            const vnode: VNode = {
                classList: [],
                bounds: getBounds(children),
                children,
                role: 'list-y',
                heightSpec: SizeSpec.Auto,
                index: context.index++,
            };
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
        return vnode.children![1].bounds.left - vnode.children![0].bounds.right;
    }

    if (nextOverlapNode && nextOverlapNode.role === 'list-x' &&
        nextOverlapNode.children!.length === toMerge.children!.length &&
        isOverlappingX(nextOverlapNode.children![0], toMerge.children![0]) &&
        getListXGap(nextOverlapNode) === getListXGap(toMerge)
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
            const vnode: VNode = {
                classList: [],
                bounds: getBounds(group),
                children: group,
                role: 'list-item',
                direction: Direction.Column,
                widthSpec: SizeSpec.Fixed,
                index: context.index++
            };
            return vnode;
        });
        const vnode: VNode = {
            classList: [],
            bounds: getBounds(children),
            children,
            role: 'list-x',
            direction: Direction.Row,
            widthSpec: SizeSpec.Auto,
            index: context.index++
        };
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
                const vnode: VNode = {
                    classList: [],
                    direction: Direction.Column,
                    bounds: getBounds(group),
                    index: context.index++
                };
                // 从上到下
                group = _.sortBy(group, n => n.bounds.top);

                vnode.children = groupNodes(group);
                groupListYNodes(vnode);
                return vnode;
            } else {
                return group[0];
            }
        });
        const vnode: VNode = {
            classList: [],
            direction: Direction.Row,
            bounds: getBounds(nodesx),
            index: context.index++,
            // 从左到右
            children: _.sortBy(nodesx, n => n.bounds.left),
        };
        return [vnode, ...groupNodes(leftoverNodes)];
    } else {
        return [highestNode, ...groupNodes(leftoverNodes)];
    }
}

/** 生成flexbox盒子 */
function buildFlexBox(parent: VNode) {
    if (parent.children) {
        assert(!parent.direction, "这里应该还没生成flex盒子");
        // 先从上到下/从左到右排序
        parent.children.sort((a, b) => {
            if (numSame(a.bounds.top, b.bounds.top)) {
                if (numSame(a.bounds.left, b.bounds.left)) {
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

/** 两个盒子是否一样 */
function isEqualBox(a: VNode, b: VNode) {
    return numSame(a.bounds.width, b.bounds.width) && numSame(a.bounds.height, b.bounds.height);
}

function mergeNode(dest: VNode, src: VNode) {
    // 这里要合并样式，将src合并到dest
    dest.tagName = src.tagName;
    dest.classList = _.union(dest.classList, src.classList);

    if (src.widthSpec) {
        dest.widthSpec = src.widthSpec;
    }
    if (src.heightSpec) {
        dest.heightSpec = src.heightSpec;
    }

    dest.style = _.merge(dest.style, src.style);
    dest.attributes = _.merge(dest.attributes, src.attributes);
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
        (isGhostNode(child) || isTextNode(child))
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
    const xy = parent.direction === Direction.Row ? 'y' : 'x';
    const alignSpec = parent.direction === Direction.Row ? 'heightSpec' : 'widthSpec';

    // 据children在node中的位置计算flex对齐方式
    const margins = children.map(n => ({
        marginStart: n.bounds[sf] - parent.bounds[sf],
        marginEnd: parent.bounds[ef] - n.bounds[ef],
        marginDiff: n.bounds[sf] - parent.bounds[sf] - (parent.bounds[ef] - n.bounds[ef])
    }));

    /** 获取超过一半的元素的共同margin */
    function getCommonMarginOverHalf(key: 'marginStart' | 'marginEnd' | 'marginDiff') {
        // 使用groupBy对数组进行分组
        const grouped = groupByWith(margins, m => m[key], numSame);
        /** 数量最多&数值最小的优先 */
        const maxMagin = Array.from(grouped.values()).sort((a, b) => {
            if (a.length === b.length) {
                return Math.abs(a[0][key]) - Math.abs(b[0][key]);
            } else {
                return b.length - a.length;
            }
        })[0];
        if (maxMagin.length * 2 > margins.length) {
            return [maxMagin.length, maxMagin[0][key]] as const;
        } else {
            return [0, 0] as const;
        }
    }
    // 归组
    const [commonMarginStartCount, commonMarginStart] = getCommonMarginOverHalf('marginStart');
    const [commonMarginEndCount, commonMarginEnd] = getCommonMarginOverHalf('marginEnd');
    const [commonMarginDiffCount, commonMarginDiff] = getCommonMarginOverHalf('marginDiff');
    const maxCommonMarginCount = Math.max(commonMarginStartCount, commonMarginEndCount, commonMarginDiffCount);

    function defaultAlignStretch() {
        // if (numSame(commonMarginStart, commonMarginEnd)) {
        //     parent.classList.push(R`p${xy}-${commonMarginEnd}`);
        // } else {
        //     parent.classList.push(R`p${s}-${commonMarginStart} p${e}-${commonMarginEnd}`);
        //     margins.forEach(margin => {
        //         margin.marginStart -= commonMarginStart;
        //         margin.marginEnd -= commonMarginEnd;
        //     });
        // }

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (child[alignSpec] === SizeSpec.Fixed) {
                if (numSame(margin.marginStart, margin.marginEnd)) {
                    child.classList.push('self-center');
                } else if (margin.marginStart < margin.marginEnd) {
                    child.classList.push(R`self-start m${s}-${margin.marginStart}`);
                } else {
                    child.classList.push(R`self-end m${e}-${margin.marginEnd}`);
                }
            } else if (child[alignSpec] === SizeSpec.Constrained) {
                child.classList.push(R`m${s}-${margin.marginStart} m${e}-${margin.marginEnd}`);
            } else if (child[alignSpec] === SizeSpec.Auto) {
                child[alignSpec] = SizeSpec.Constrained;
                child.classList.push(R`m${s}-${margin.marginStart} m${e}-${Math.min(margin.marginEnd, margin.marginStart)}`);
                // TODO: 处理auto元素的最大宽度
            } else {
                unreachable();
            }
        });
    }

    function selfAlign(child: VNode, margin: {
        marginStart: number;
        marginEnd: number;
        marginDiff: number;
    }) {
        if (numSame(margin.marginDiff, 0)) {
            if (!parent.classList.includes('items-center')) {
                child.classList.push('self-center');
            }
        } else if (margin.marginDiff < 0) {
            if (!parent.classList.includes('items-start')) {
                child.classList.push('self-start');
            }
            child.classList.push(R`m${s}-${margin.marginStart}`);
        } else {
            if (!parent.classList.includes('items-end')) {
                child.classList.push('self-end');
            }
            child.classList.push(R`m${e}-${margin.marginEnd}`);
        }
    }

    if (parent[alignSpec] === SizeSpec.Constrained) {
        defaultAlignStretch();
        return;
    }

    if (maxCommonMarginCount <= 1) {
        defaultAlignStretch();
    }
    // 优先处理居中
    else if (maxCommonMarginCount === commonMarginDiffCount) {
        parent.classList.push('items-center');

        if (numSame(commonMarginDiff / 2, 0)) {
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

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (numSame(margin.marginDiff / 2, 0)) {
                // 直接居中的
            } else {
                selfAlign(child, margin);
            }
            // TODO: 处理auto元素的最大宽度，不能居中了
        });
    } else if (maxCommonMarginCount === commonMarginStartCount) {
        parent.classList.push('items-start');
        if (!numSame(commonMarginStart, 0)) {
            parent.classList.push(`p${s}-${commonMarginStart}`);
            margins.forEach(margin => {
                margin.marginStart -= commonMarginStart;
                margin.marginDiff -= commonMarginStart;
            });
        }

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (numSame(margin.marginStart, 0)) {
                // 直接与起始边对齐
            } else {
                selfAlign(child, margin);
            }
        });
    } else if (maxCommonMarginCount === commonMarginEndCount) {
        parent.classList.push('items-end');
        if (!numSame(commonMarginEnd, 0)) {
            parent.classList.push(`p${e}-${commonMarginEnd}`);
            margins.forEach(margin => {
                margin.marginEnd -= commonMarginEnd;
                margin.marginDiff += commonMarginEnd;
            });
        }

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (numSame(margin.marginEnd, 0)) {
                // 直接与结束边对齐
            } else {
                selfAlign(child, margin);
            }
        });
    } else {
        defaultAlignStretch();
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
    const equalMiddleGaps = _.uniqWith(gaps, numSame).length === 1;

    function maybeInsertFlex1() {
        if (gaps.length < 2) {
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

        children.splice(flex1GapIndex, 0, {
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

        if (numSame(startGap, endGap)) {
            gaps[0] = 0;
            parent.classList.push(R`p${xy}-${startGap}`);
        } else {
            // 这里加了flex1会把最后一个元素挤到边上
            parent.classList.push(R`p${ee}-${endGap}`);
        }
    }

    function defaultJustify() {
        gaps.unshift(startGap);

        maybeInsertFlex1();

        gaps.forEach((g, i) => {
            children[i].classList.push(R`m${ss}-${g}`);
        });
    }

    function isMultiLineText(vnode: VNode) {
        return _.isArray(vnode.textContent);
    }

    // 行盒子只有一个多行元素，如果只有一行，则居中展示，如果多行，则
    function isFlexWrapLike(vnode: VNode) {
        return vnode.role === 'list-wrap' || isMultiLineText(vnode);
    }

    /** 处理auto元素内容超出 */
    function overflowAuto(vnode: VNode) {
        // 文本节点
        if (isTextNode(vnode) && vnode[justifySpec] === SizeSpec.Auto) {
            if (justifySpec === 'heightSpec' && vnode.heightSpec === SizeSpec.Auto) {
                // 多行
            } else {
                // 单行
            }
        } else if (justifySpec === 'widthSpec' && vnode.role === 'list-x') {

        } else if (justifySpec === 'heightSpec' && vnode.role === 'list-y') {

        }
    }

    if (parent[justifySpec] === SizeSpec.Auto) {
        defaultJustify();
    }
    // 一个子元素, 或者子元素之间紧挨在一起视同为一个元素
    else if (!gaps.length || (equalMiddleGaps && numSame(gaps[0], 0))) {
        if (children.length === 1 && justifySpec === 'widthSpec' && isFlexWrapLike(children[0])) {
            // TODO: 
        } else {
            if (numSame(startGap, endGap)) {
                parent.classList.push('justify-center');
            } else if (startGap < endGap) {
                parent.classList.push(R`p${ss}-${startGap}`);
            } else {
                parent.classList.push(R`justify-end p${ee}-${startGap}`);
            }
        }
    }
    // 中间间隔相等
    else if (equalMiddleGaps) {
        const sameGap = gaps[0];
        /** 无需再设置子元素之间的间距 */
        let childMarginNoNeed = false;

        if (numSame(startGap, endGap) && numSame(startGap * 2, gaps[0]) && startGap) {
            parent.classList.push('justify-around');
            childMarginNoNeed = true;
        } else if (sameGap > startGap && sameGap > endGap) {
            parent.classList.push(R`justify-between p${ss}-${startGap} p${ee}-${endGap}`);
            childMarginNoNeed = true;
        } else if (numSame(startGap, endGap)) {
            parent.classList.push('justify-center');
        } else if (startGap < endGap) {
            parent.classList.push(R`p${ss}-${startGap}`);
        } else {
            parent.classList.push(R`justify-end p${ee}-${startGap}`);
        }

        if (!childMarginNoNeed) {
            if (gaps.length === 1) {
                children[0].classList.push(R`m${ee}-${sameGap}`);
            } else {
                parent.classList.push(R`space-${xy}-${sameGap}`);
            }
        }
    } else {
        const maxGap = _.max(gaps)!;
        if (maxGap > startGap && maxGap > endGap) {
            defaultJustify();
        } else if (numSame(startGap, endGap)) {
            parent.classList.push('justify-center');
            _.each(children.slice(1), (child, i) => {
                child.classList.push(R`m${ss}-${gaps[i]}`);
            });
        } else if (startGap < endGap) {
            parent.classList.push('justify-start');
            gaps.unshift(startGap);
            _.each(children, (child, i) => {
                child.classList.push(R`m${ss}-${gaps[i]}`);
            });
        } else {
            parent.classList.push('justify-end');
            gaps.push(endGap);
            _.each(children, (child, i) => {
                child.classList.push(R`m${ee}-${gaps[i]}`);
            });
        }
    }

    // 对所有灵活伸缩的元素设置flex1
    _.each(children, child => {
        if (child[justifySpec] === SizeSpec.Constrained) {
            child.classList.push('flex-1');
        }
    });
}

/** 确定flexbox子元素的尺寸类型 */
function measureChildSizeSpec(parent: VNode) {
    _.each(parent.children, (child) => {
        if (parent.direction === Direction.Row) {
            if (parent.heightSpec === SizeSpec.Constrained) {
                if (child.heightSpec === SizeSpec.Auto) {
                    child.heightSpec = SizeSpec.Constrained;
                }
            }
        }

        if (parent.direction === Direction.Column) {
            if (parent.widthSpec === SizeSpec.Constrained) {
                if (child.widthSpec === SizeSpec.Auto) {
                    child.widthSpec = SizeSpec.Constrained;
                }
            }
        }
    });
}

/** 根据子元素确定父盒子的尺寸类型 */
function measureParentSizeSpec(parent: VNode) {
    const children = parent.children;
    if (!children || !children.length) {
        // TODO: 裸盒子的尺寸如何确定
        if (!parent.widthSpec) {
            parent.widthSpec = SizeSpec.Constrained;
        }
        if (!parent.heightSpec) {
            parent.heightSpec = SizeSpec.Constrained;
        }
        return;
    }

    if (parent.direction === Direction.Row) {
        if (!parent.widthSpec) {
            parent.widthSpec = SizeSpec.Auto;
        }
        if (!parent.heightSpec) {
            if (_.some(children, child => child.heightSpec === SizeSpec.Auto)) {
                parent.heightSpec = SizeSpec.Constrained;
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
                parent.widthSpec = SizeSpec.Constrained;
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
    const firstWrapChild = _.find(parent.children, (child) => !numSame(child.bounds.top, firstChild.bounds.top), 1)!;
    assert(numSame(firstWrapChild.bounds.left, firstChild.bounds.left), 'flex-wrap不规范，左边没对齐');
    const yGap = firstWrapChild.bounds.top - firstChild.bounds.bottom;
    _.each(parent.children, (child) => {
        child.classList.push(R`ml-${xGap} mt-${yGap}`);
    });

    // vnode.classList.push(R`ml-${-xGap} mt-${-yGap}`);
    // 合并margin
    mergeMargin();

    function mergeMargin() {
        parent.classList = parent.classList.filter(Boolean).join(' ').split(' ');
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
    if (parent.widthSpec === SizeSpec.Fixed) {
        parent.classList.push(R`w-${parent.bounds.width}`);
    }
    if (parent.heightSpec === SizeSpec.Fixed) {
        parent.classList.push(R`h-${parent.bounds.height}`);
    }

    if (!parent.direction || !parent.children || !parent.children.length) {
        return;
    }

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

    measureChildSizeSpec(parent);
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
        if (_.some(parent.classList, className => _.includes(['relative', 'absolute', 'fixed'], className))) {
            // 已经脱离文档流
        } else {
            parent.classList.push('relative');
        }
        attachNode.classList.push('absolute');

        if (
            attachNode.widthSpec === SizeSpec.Auto &&
            numSame(left, right) &&
            attachNode.bounds.width * 2 > parent.bounds.width
        ) {
            attachNode.widthSpec = SizeSpec.Constrained;
        }

        if (attachNode.widthSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`left-${left} right-${right}`);
        } else {
            if (attachNode.widthSpec === SizeSpec.Fixed && numSame(left, right)) {
                // 绝对定位居中
                attachNode.classList.push('left-1/2 -translate-x-1/2');
            } else if (left <= right) {
                attachNode.classList.push(R2`left-${left}`);
            } else {
                attachNode.classList.push(R2`right-${right}`);
            }
        }

        if (
            attachNode.heightSpec === SizeSpec.Auto &&
            numSame(top, bottom) &&
            attachNode.bounds.height * 2 > parent.bounds.height
        ) {
            attachNode.heightSpec = SizeSpec.Constrained;
        }

        if (attachNode.heightSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`top-${top} bottom-${bottom}`);
        } else {
            if (top <= bottom) {
                attachNode.classList.push(R2`top-${top}`);
            } else {
                attachNode.classList.push(R2`bottom-${bottom}`);
            }
        }
    });
}

/** 生成规范的flexbox树结构 */
function buildTree(vnode: VNode) {
    if (!vnode.direction) {
        removeGhostNodes(vnode);
        mergeUnnessaryNodes(vnode);
        buildMissingNodes(vnode);
        buildFlexBox(vnode);
    }

    _.each(vnode.children, buildTree);
    _.each(vnode.attachNodes, buildTree);

    measureParentSizeSpec(vnode);
}

/** 计算flexbox布局 */
function measureTree(vnode: VNode) {
    // 从根节点开始，根节点宽高都是弹性尺寸
    measureFlexLayout(vnode);
    // 计算好自身的尺寸，才能计算绝对定位元素的尺寸
    measureAttachPosition(vnode);

    _.each(vnode.children, measureTree);
    _.each(vnode.attachNodes, measureTree);
}

/** 对节点树进行重建/重组/布局 */
export function postprocess(vnode: VNode) {
    if (debug.buildToStage >= BuildStage.Tree) {
        buildTree(vnode);
    }

    if (debug.buildToStage >= BuildStage.Measure) {
        measureTree(vnode);
    }
}