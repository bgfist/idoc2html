import { R, assert, groupByWith, groupWith, numSame } from "./utils";
import { Direction, SizeSpec, VNode, context } from "./vnode";
import * as _ from 'lodash';

function isContainedWithinX(child: VNode, parent: VNode) {
    return (
        child.bounds.left >= parent.bounds.left &&
        child.bounds.right <= parent.bounds.right
    );
}

function isContainedWithinY(child: VNode, parent: VNode) {
    return (
        child.bounds.top >= parent.bounds.top &&
        child.bounds.bottom <= parent.bounds.bottom
    );
}

/** 处理元素之间的包含关系 */
function isContainedWithin(child: VNode, parent: VNode) {
    return isContainedWithinX(child, parent) && isContainedWithinY(child, parent);
}

function isOverlappingX(child: VNode, parent: VNode) {
    return (
        child.bounds.left < parent.bounds.right &&
        child.bounds.right > parent.bounds.left
    );
}

function isOverlappingY(child: VNode, parent: VNode) {
    return (
        child.bounds.top < parent.bounds.bottom &&
        child.bounds.bottom > parent.bounds.top
    );
}

/** 处理元素之间的重叠关系 */
function isOverlapping(child: VNode, parent: VNode,) {
    return isOverlappingX(child, parent) && isOverlappingY(child, parent);
}

/** 判断节点是不是边框/分隔线 */
function maybeBorder(child: VNode, parent: VNode) {
    if (numSame(child.bounds.width, 1)) {
        return numSame(child.bounds.left, parent.bounds.left) || numSame(child.bounds.right, parent.bounds.right);
    }
    if (numSame(child.bounds.height, 1)) {
        return numSame(child.bounds.top, parent.bounds.top) || numSame(child.bounds.bottom, parent.bounds.bottom);
    }
}

/** 寻找父节点，最小的包围盒子 */
function findBestParent(node: VNode, nodes: VNode[]) {
    let bestParent: VNode | null = null;
    let minArea = Infinity;
    let type: 'contained' | 'overlapping' = 'contained';
    const nodeArea = node.bounds.width * node.bounds.height;
    for (let potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isContainedWithin(node, potentialParent) && type === 'contained') {
            let area = potentialParent.bounds.width * potentialParent.bounds.height;
            if (area < minArea) {
                minArea = area;
                bestParent = potentialParent;
            }
        } else if (isOverlapping(node, potentialParent) && !isContainedWithin(potentialParent, node)) {
            type = 'overlapping';
            let area = potentialParent.bounds.width * potentialParent.bounds.height;
            if (area >= nodeArea && node.index > potentialParent.index && area < minArea) {
                minArea = area;
                bestParent = potentialParent;
            }
        }
    }
    return [bestParent, type] as const;
}

/** 为每个节点找到最佳父节点，保证nodes互不相交 */
function buildMissingTree(parent: VNode) {
    const nodes = parent.children;
    if (!nodes) return;
    parent.children = nodes.filter(node => {
        let [bestParent, type] = findBestParent(node, nodes);
        if (bestParent) {
            if (type === 'contained') {
                (bestParent.children ??= []).push(node);
            } else {
                (bestParent.attachNodes ??= []).push(node);
            }
            return false;
        } else if (type === 'overlapping') {
            // 绝对定位元素
            (parent.attachNodes ??= []).push(node);
            return false;
        } else if (maybeBorder(node, parent)) {
            // 过小的元素有可能是边框
            node.role = 'border';
            (parent.attachNodes ??= []).push(node);
            return false;
        } else {
            return true;
        }
    });
}

/** 两个盒子是否相似 */
function isSimilarBox(a: VNode, b: VNode) {
    if (
        a.textContent && b.textContent &&
        numSame(a.bounds.top, b.bounds.top) &&
        numSame(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !a.textContent && !b.textContent &&
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
        a.textContent && b.textContent &&
        numSame(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !a.textContent && !b.textContent &&
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
    while (isSimilarBoxY(nodes[cursor], nodes[baseRepeatStart + repeatCount % repeatGroupCount])) {
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

/** 寻找重复节点，将其重新归组 */
function groupRepeatNodes(nodes: VNode[]): VNode[] {
    // 1. 处理横向重复 ✅
    // 2. 处理竖向列表
    // 3. 处理flex-wrap多行 ✅
    // 4. 处理多行横向重复(需重新归组)


    if (!nodes.length) return [];

    function removeRepeatNodes(children: VNode[]) {
        _.each(children, child => {
            _.remove(nodes, node => node === child);
        });
    }

    let compareIndex = 0;
    let prev = 0;
    for (let i = 1; i < nodes.length; prev = i, i++) {
        // 换行了重新查
        if (!numSame(nodes[i].bounds.top, nodes[prev].bounds.top)) {
            compareIndex = i;
            continue;
        }
        if (!isSimilarBox(nodes[compareIndex], nodes[i])) {
            continue;
        }

        // 获取重复的节点
        const baseRepeatStart = compareIndex;
        const repeatGroupCount = i - compareIndex;
        let repeatCount = repeatGroupCount + 1;
        while (++i < nodes.length && isSimilarBox(nodes[++compareIndex], nodes[i])) {
            repeatCount++;
        }

        const mod = repeatCount % repeatGroupCount;
        if (mod !== 0) {
            console.warn('重复分组不完整!');
            repeatCount -= mod;
        }

        // 重复节点之间断开了
        if (!repeatCount) {
            console.warn('重复节点断开了!');
            // 从这开始查
            compareIndex = i - mod;
            continue;
        }

        // 文本节点大概率重复
        if (repeatGroupCount === 1 && nodes[baseRepeatStart].textContent) {
            continue;
        }

        // 这些是确认重复可以归组的节点
        let children = nodes.slice(baseRepeatStart, baseRepeatStart + repeatCount);

        // 继续获取flex-wrap节点
        findFlexWrap(nodes, i, baseRepeatStart, repeatGroupCount, children);

        // 将children进行分组
        if (repeatGroupCount > 1) {
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
            removeRepeatNodes(children);
            children = repeatGroups;
        } else {
            _.each(children, child => {
                child.role = 'list-item';
            });
            removeRepeatNodes(children);
        }

        const vnode: VNode = {
            classList: [],
            bounds: getBounds(children),
            children,
            role: 'list-x',
            direction: Direction.Row,
            index: context.index++
        };
        if (children.length > repeatCount) {
            // 是flex-wrap
            vnode.role = 'list-wrap';
            vnode.heightSpec = SizeSpec.Auto;
            _.each(children, child => {
                child.heightSpec = SizeSpec.Fixed;
            });
        } else {
            vnode.role = 'list-x';
            vnode.widthSpec = SizeSpec.Auto;
        }

        return [...nodes.slice(0, baseRepeatStart), vnode, ...groupRepeatNodes(nodes.slice(baseRepeatStart))];
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
        mergeUnnessaryNodes(parent, true);
        // 到这里确保了所有children都比parent小
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
        parent.children = groupRepeatNodes(parent.children);
        parent.children = groupNodes(parent.children);
        mergeUnnessaryNodes(parent);
        // 到这里确保父盒子一定比子盒子大
    }
}

/** 两个盒子是否一样 */
function isEqualBox(a: VNode, b: VNode) {
    return numSame(a.bounds.width, b.bounds.width) && numSame(a.bounds.height, b.bounds.height);
}

/** 移除不必要的中间节点，比如宽高位置与父节点一样的，再合并样式 */
function mergeUnnessaryNodes(parent: VNode, isPre?: boolean) {
    const { children } = parent;
    if (children && children.length === 1) {
        const child = children[0];
        // 子盒子可以扩大
        if (child.heightSpec !== SizeSpec.Fixed && child.widthSpec !== SizeSpec.Fixed) {
            child.bounds = {
                ...parent.bounds
            };
        }
        // 两个盒子一样大
        if (isEqualBox(parent, child)) {
            // 这里要合并样式，将child合并到parent
            parent.tagName = child.tagName;
            parent.classList = _.union(parent.classList, child.classList);

            if (child.widthSpec) {
                parent.widthSpec = child.widthSpec;
            }
            if (child.heightSpec) {
                parent.heightSpec = child.heightSpec;
            }

            parent.style = _.merge(parent.style, child.style);
            parent.attributes = _.merge(parent.attributes, child.attributes);
            parent.direction = child.direction;
            parent.attachNodes = _.union(parent.attachNodes, child.attachNodes);
            children.splice(0, 1, ...(child.children || []));

            // 继续移除，这里也可以不加，防止有几个相同大小的盒子连续嵌套
            if (isPre) {
                mergeUnnessaryNodes(parent, isPre);
            }
            return;
        }
    }

    if (!isPre) {
        if (parent.children && parent.children.length === 1) {
            parent.direction = Direction.Row;
            parent.children = _.sortBy(parent.children, (child) => child.bounds.left);
        } else {
            parent.direction = Direction.Column;
            parent.children = _.sortBy(parent.children, (child) => child.bounds.top);
        }
    }
}

/** 生成align-items */
function buildFlexAlign(vnode: VNode) {
    const children = vnode.children!;

    const sf = vnode.direction === Direction.Row ? 'top' : 'left';
    const ef = vnode.direction === Direction.Row ? 'bottom' : 'right';
    const s = sf[0];
    const e = ef[0];

    // 据children在node中的位置计算flex对齐方式
    let margins = children.map(n => ({
        marginStart: n.bounds[sf] - vnode.bounds[sf],
        marginEnd: vnode.bounds[ef] - n.bounds[ef],
        marginDiff: n.bounds[sf] - vnode.bounds[sf] - (vnode.bounds[ef] - n.bounds[ef])
    }));
    function countGroupsWithMoreThanOne(keyFn: (n: { marginStart: number; marginEnd: number; marginDiff: number; }) => number) {
        // 使用groupBy对数组进行分组
        const grouped = groupByWith(margins, keyFn, numSame);

        const maxMagin = _.maxBy(Array.from(grouped.values()), g => g.length)!;
        return [maxMagin.length, keyFn(maxMagin[0])] as const;
    }
    // 归组
    let [marginStartCount, marginStart] = countGroupsWithMoreThanOne(m => m.marginStart);
    let [marginEndCount, marginEnd] = countGroupsWithMoreThanOne(m => m.marginEnd);
    let [marginDiffCount, marginDiff] = countGroupsWithMoreThanOne(m => m.marginDiff);
    const maxCount = Math.max(marginStartCount, marginEndCount, marginDiffCount);
    assert(maxCount >= 1, "At least one child must have a margin");

    function defaultAlign() {
        _.each(children, (child, i) => {
            const margin = margins[i];
            const spec = vnode.direction === Direction.Row ? 'heightSpec' : 'widthSpec';

            // child尺寸不确定，默认拉伸
            if (!child[spec]) {
                if (numSame(margin.marginStart, margin.marginEnd)) {
                    const xy = vnode.direction === Direction.Row ? 'y' : 'x';
                    child.classList.push(R`m${xy}-${margin.marginEnd}`);
                } else {
                    child.classList.push(R`m${s}-${margin.marginStart} m${e}-${margin.marginEnd}`);
                }
                child[spec] = vnode[spec];
            } else {
                child.classList.push(R`m${s}-${margin.marginStart}`);
            }
        });
    }

    if (marginDiffCount === maxCount) {
        // 优先处理居中
        vnode.classList.push('items-center');
        if (marginDiff) {
            vnode.classList.push(`p${s}-${marginDiff}`);
            margins.forEach(margin => {
                margin.marginStart -= marginDiff;
                margin.marginDiff -= marginDiff;
            });
        } else if (marginDiff < 0) {
            vnode.classList.push(`p${e}-${-marginDiff}`);
            margins.forEach(margin => {
                margin.marginEnd += marginDiff;
                margin.marginDiff -= marginDiff;
            });
        }

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (numSame(margin.marginDiff, 0)) {
                // 直接居中的
            } else if (margin.marginDiff < 0) {
                if (vnode.heightSpec === SizeSpec.Fixed || !margin.marginStart || margin.marginStart < -margin.marginDiff) {
                    child.classList.push(R`self-start m${s}-${margin.marginStart}`);
                } else {
                    child.classList.push(`m${e}-${-margin.marginDiff}`);
                }
            } else if (margin.marginDiff > 0) {
                if (vnode.heightSpec === SizeSpec.Fixed || !margin.marginEnd || margin.marginEnd < margin.marginDiff) {
                    child.classList.push(R`self-end m${e}-${margin.marginEnd}`);
                } else {
                    child.classList.push(`m${s}-${margin.marginDiff}`);
                }
            }
        });
    } else if (marginStartCount === maxCount && marginStart === _.min(margins.map(m => m.marginStart))) {
        vnode.classList.push('items-start');
        if (marginStart) {
            vnode.classList.push(`p${s}-${marginStart}`);
            margins.forEach(margin => {
                margin.marginStart -= marginStart;
                margin.marginDiff -= marginStart;
            });
        }

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (margin.marginDiff < 0) {
                child.classList.push(R`m${s}-${margin.marginStart}`);
            } else if (margin.marginDiff === 0) {
                // 直接在中间
                child.classList.push('self-center');
            } else if (margin.marginDiff > 0) {
                child.classList.push(R`self-end m${e}-${margin.marginEnd}`);
            }
        });
    } else if (marginEndCount === maxCount && marginEnd === _.min(margins.map(m => m.marginEnd))) {
        vnode.classList.push('items-end');
        if (marginEnd) {
            vnode.classList.push(`p${e}-${marginEnd}`);
            margins.forEach(margin => {
                margin.marginEnd -= marginEnd;
                margin.marginDiff += marginEnd;
            });
        }

        _.each(children, (child, i) => {
            const margin = margins[i];
            if (margin.marginDiff > 0) {
                child.classList.push(R`m${e}-${margin.marginEnd}`);
            } else if (margin.marginDiff === 0) {
                // 直接在中间
                child.classList.push('self-center');
            } else if (margin.marginDiff < 0) {
                child.classList.push(R`self-start m${s}-${margin.marginStart}`);
            }
        });
    } else {
        // 我们不希望有负的padding
        defaultAlign();
    }
}

/** 生成justify-content */
function buildFlexJustify(vnode: VNode) {
    const children = vnode.children!;

    const ssf = vnode.direction === Direction.Row ? 'left' : 'top';
    const eef = vnode.direction === Direction.Row ? 'right' : 'bottom';
    const ss = ssf[0];
    const ee = eef[0];
    const xy = vnode.direction === Direction.Row ? 'x' : 'y';

    // 根据children在node中的位置计算flex主轴布局
    // TODO: flex1怎么加
    const ranges = _.zip(
        [...children.map(n => n.bounds[ssf]), vnode.bounds[eef]],
        [vnode.bounds[ssf], ...children.map(n => n.bounds[eef])]
    ) as [number, number][];
    const gaps = ranges.map(([p, n]) => p - n);
    const startGap = gaps.shift()!;
    const endGap = gaps.pop()!;
    const equalGap = _.uniqWith(gaps, numSame).length === 1;
    const maxGap = _.max(gaps);

    function defaultJustify() {
        if (equalGap) {
            vnode.classList.push(R`space-${xy}-${gaps[0]} p-${ss}-${startGap}`);
            return;
        }

        gaps.unshift(startGap);

        // 处理flex1
        if (maxGap && gaps.filter(gap => gap === maxGap).length === 1) {
            const insertIndex = gaps.indexOf(maxGap);
            gaps[insertIndex] = 0;
            gaps.splice(insertIndex, 0, 0);

            const sf = vnode.direction === Direction.Row ? 'top' : 'left';
            const ef = vnode.direction === Direction.Row ? 'bottom' : 'right';
            const spec1 = vnode.direction === Direction.Row ? 'width' : 'height';
            const spec2 = vnode.direction === Direction.Row ? 'height' : 'width';
            const pos = Math.round(vnode.bounds[sf] + vnode.bounds[ef] / 2);
            const [eefn, ssfn] = ranges[insertIndex];

            children.splice(insertIndex, 0, {
                bounds: {
                    [sf]: pos,
                    [ef]: pos,
                    [ssf]: ssfn,
                    [eef]: eefn,
                    [spec1]: eefn - ssfn,
                    [spec2]: 0,
                } as any,
                classList: ['flex-1'],
                [`${spec1}Spec`]: SizeSpec.Constrained,
                index: context.index++
            });

            if (numSame(startGap, endGap)) {
                gaps[0] = 0;
                vnode.classList.push(R`p${xy}-${startGap}`);
            }
        }

        gaps.forEach((g, i) => {
            children[i].classList.push(R`m${ss}-${g}`);
        });
    }

    // 两边间隔相等
    if (numSame(startGap, endGap)) {
        // 有间隔
        if (startGap) {
            if (equalGap && numSame(startGap * 2, gaps[0])) {
                vnode.classList.push('justify-around');
                // TODO: 支持space-evenly?
            } else if (maxGap! > startGap * 2) {
                // 中间隔得太大，应该不是居中布局
                if (children.length === 2) {
                    // 只有两个元素，直接两边排
                    vnode.classList.push('justify-between');
                    vnode.classList.push(R`p${xy}-${startGap}`);
                } else {
                    defaultJustify();
                }
            } else {
                vnode.classList.push('justify-center');
                if (equalGap) {
                    vnode.classList.push(R`space-${xy}-${gaps[0]}`);
                } else {
                    gaps.forEach((g, i) => {
                        children[i].classList.push(R`m${ee}-${g}`);
                    });
                }
            }
        }

        // 没间隔
        else {
            if (equalGap) {
                vnode.classList.push('justify-between');
                vnode.classList.push(R`p${ss}-${startGap} p${ee}-${endGap}`);
            } else {
                // 走justify-start, 处理flex1
                defaultJustify();
            }
        }
    } else if (startGap > endGap) {
        // 走justify-start
        defaultJustify();
    } else if (startGap < endGap) {
        // 走justify-end
        vnode.classList.push('justify-end');

        if (equalGap) {
            vnode.classList.push(R`space-${xy}-${gaps[0]}`);
        } else {
            gaps.push(endGap);
            gaps.forEach((g, i) => {
                children[i].classList.push(R`m${ee}-${g}`);
            });
        }
    }
}

/** 确定flexbox子元素的尺寸类型 */
function buildSizeSpec(parent: VNode) {
    _.each(parent.children, (child) => {
        if (!child.widthSpec) {
            if (parent.direction === Direction.Row) {
                child.widthSpec = SizeSpec.Fixed;
            } else {
                child.widthSpec = parent.widthSpec;
            }
        }
        if (!child.heightSpec) {
            if (parent.direction === Direction.Column) {
                child.heightSpec = SizeSpec.Fixed;
            } else {
                child.heightSpec = parent.heightSpec;
            }
        }
    });
}

/** 生成flex-wrap布局 */
function buildFlexWrapLayout(vnode: VNode) {
    vnode.classList.push('flex-wrap');
    const firstChild = vnode.children![0];
    const secondChild = vnode.children![1];
    const xGap = secondChild.bounds.left - firstChild.bounds.right;
    const firstWrapChild = _.find(vnode.children, (child) => !numSame(child.bounds.top, firstChild.bounds.top), 1)!;
    if (!numSame(firstWrapChild.bounds.left, firstChild.bounds.left)) {
        console.warn('flex-wrap不规范，左边没对齐');
    }
    const yGap = firstWrapChild.bounds.top - firstChild.bounds.bottom;
    _.each(vnode.children, (child) => {
        child.classList.push(R`ml-${xGap} mt-${yGap}`);
    });
    // vnode.classList.push(R`ml-${-xGap} mt-${-yGap}`);
    // 合并margin
    const mlCls = _.find(vnode.classList, (c) => c.startsWith('ml-') || c.startsWith('mx-')) || 'ml-0';
    const [p, v] = mlCls.split('-');
    _.remove(vnode.classList, cls => cls === mlCls);
    if (p === 'ml') {
        vnode.classList.push(R`ml-${+v - xGap}`);
    } else if (p === 'mx') {
        vnode.classList.push(R`ml-${+v - xGap} mr-${v}`);
    }
    const mtCls = _.find(vnode.classList, (c) => c.startsWith('mt-') || c.startsWith('my-')) || 'mt-0';
    const [p2, v2] = mtCls.split('-');
    _.remove(vnode.classList, cls => cls === mtCls);
    if (p2 === 'mt') {
        vnode.classList.push(R`mt-${+v2 - yGap}`);
    } else if (p2 === 'my') {
        vnode.classList.push(R`mt-${+v2 - yGap} mb-${v2}`);
    }
}

/** 生成列表布局 */
function buildFlexListLayout(vnode: VNode) {
    const firstChild = vnode.children![0];
    const secondChild = vnode.children![1];

    if (vnode.role === 'list-x') {
        const xGap = secondChild.bounds.left - firstChild.bounds.right;
        vnode.classList.push(R`space-x-${xGap}`);
    } else if (vnode.role === 'list-y') {
        const yGap = secondChild.bounds.top - firstChild.bounds.bottom;
        vnode.classList.push(R`space-y-${yGap}`);
    }
}

/** 生成flexbox布局 */
function buildFlexLayout(vnode: VNode) {
    if (vnode.widthSpec === SizeSpec.Fixed) {
        vnode.classList.push(R`w-${vnode.bounds.width}`);
    }
    if (vnode.heightSpec === SizeSpec.Fixed) {
        vnode.classList.push(R`h-${vnode.bounds.height}`);
    }

    if (vnode.direction && vnode.children && vnode.children.length) {
        vnode.classList.push('flex');
        if (vnode.direction === Direction.Column) {
            vnode.classList.push('flex-col');
        }
        if (vnode.role === 'list-wrap') {
            buildFlexWrapLayout(vnode);
        } else if (vnode.role === 'list-x' || vnode.role === 'list-y') {
            buildFlexListLayout(vnode);
        } else {
            buildFlexAlign(vnode);
            buildFlexJustify(vnode);
        }

        buildSizeSpec(vnode);
    }
}

/** 生成绝对定位 */
function buildAttachPosition(vnode: VNode) {
    const attachNodes = vnode.attachNodes;
    if (!attachNodes) {
        return;
    }
    _.each(attachNodes, (attachNode) => {
        const [left, right, top, bottom] = [
            attachNode.bounds.left - vnode.bounds.left,
            vnode.bounds.right - attachNode.bounds.right,
            attachNode.bounds.top - vnode.bounds.top,
            vnode.bounds.bottom - attachNode.bounds.bottom,
        ];
        if (_.some(vnode.classList, className => _.includes(['relative', 'absolute', 'fixed'], className))) {
            // 已经脱离文档流
        } else {
            vnode.classList.push('relative');
        }
        attachNode.classList.push('absolute');

        const hasNoChildren = !attachNode.children || attachNode.children.length === 0;

        if (attachNode.widthSpec === SizeSpec.Fixed) {
            if (Math.abs(left) < Math.abs(right)) {
                attachNode.classList.push(R`left-${left}`);
            } else {
                attachNode.classList.push(R`right-${right}`);
            }
        } else if (attachNode.bounds.width * 2 > vnode.bounds.width) {
            attachNode.classList.push(R`left-${left} right-${right}`);
            attachNode.widthSpec = SizeSpec.Constrained;
        } else {
            if (hasNoChildren) {
                attachNode.widthSpec = SizeSpec.Fixed;
            }
            if (Math.abs(left) < Math.abs(right)) {
                attachNode.classList.push(R`left-${left}`);
            } else {
                attachNode.classList.push(R`right-${right}`);
            }
        }
        if (attachNode.heightSpec === SizeSpec.Fixed) {
            if (Math.abs(top) < Math.abs(bottom)) {
                attachNode.classList.push(R`top-${top}`);
            } else {
                attachNode.classList.push(R`bottom-${bottom}`);
            }
        } else if (attachNode.bounds.height * 2 > vnode.bounds.height) {
            attachNode.classList.push(R`top-${top} bottom-${bottom}`);
            attachNode.heightSpec = SizeSpec.Constrained;
        } else {
            if (hasNoChildren) {
                attachNode.heightSpec = SizeSpec.Fixed;
            }
            if (Math.abs(top) < Math.abs(bottom)) {
                attachNode.classList.push(R`top-${top}`);
            } else {
                attachNode.classList.push(R`bottom-${bottom}`);
            }
        }
    });
}

/** 对节点树进行重建/重组/布局 */
export function postprocess(node: VNode) {
    if (!node.direction) {
        buildMissingTree(node);
        buildFlexBox(node);
    }
    buildFlexLayout(node);
    buildAttachPosition(node);

    _.each(node.children, postprocess);
    _.each(node.attachNodes, postprocess);
}