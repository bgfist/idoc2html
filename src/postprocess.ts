import { R, assert, numSame } from "./utils";
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

/** 寻找横向重复元素，重复的元素应该单独生成一个父盒子作为列表容器，重复的元素应该往纵向寻找关联元素，它们有可能也是重复的 */
function findRepeatsX(nodes: VNode[]) {
    function findStartRepeat(nodes: VNode[]) {
        const compared = [nodes[0]];
        let alreadyRepeat = 0;
        for (let j = 1; j < nodes.length; j++) {
            const next = nodes.slice(j, j + compared.length);
            const isRepeat = _.zip(compared, next).every(([prev, next]) => {
                if (
                    prev!.textContent && next!.textContent &&
                    _.isEqual(prev!.classList, next!.classList) &&
                    numSame(prev!.bounds.top, next!.bounds.top)
                ) {
                    return true;
                }
                if (
                    !prev!.textContent && !next!.textContent &&
                    numSame(prev!.bounds.top, next!.bounds.top) &&
                    numSame(prev!.bounds.width, next!.bounds.width) &&
                    numSame(prev!.bounds.height, next!.bounds.height)
                ) {
                    return true;
                }
            });
            if (isRepeat) {
                alreadyRepeat++;
            } else if (alreadyRepeat) {
                break;
            } else {
                compared.push(nodes[j]);
            }
        }
        return {
            alreadyRepeat,
            repeatLength: compared.length,
        }
    }

    for (let i = 0; i < nodes.length; i++) {
        const { alreadyRepeat, repeatLength } = findStartRepeat(nodes.slice(i));
        if (alreadyRepeat) {
            let containerNode: VNode;
            if (repeatLength > 1) {
                const newNodes: VNode[] = [];
                for (let j = i, c = 0; c < alreadyRepeat; c++, j += repeatLength) {
                    const children = nodes.slice(j, j + repeatLength);
                    const newNode: VNode = {
                        classList: [],
                        children,
                        bounds: getBounds(children),
                        index: context.index++
                    };
                    newNodes.push(newNode);
                }
                containerNode = {
                    classList: ['list'],
                    children: newNodes,
                    bounds: getBounds(newNodes),
                    index: context.index++
                };
            } else {
                const children = nodes.slice(i, i + alreadyRepeat);
                containerNode = {
                    classList: ['list'],
                    children,
                    bounds: getBounds(children),
                    index: context.index++
                };
            }

            return {
                containerNode,
                replaceNow() {
                    nodes.splice(i, repeatLength * alreadyRepeat, containerNode);
                }
            };
        }
    }
}

function tryRegroupRepeats(nodes: VNode[]) {
    const regionGroup = _.groupBy(nodes, node => `${node.bounds.top}-${node.bounds.height}`);
    const repeats = _.reduce(regionGroup, (arr, group, key) => {
        if (group.length > 1) {
            const r = findRepeatsX(group);
            if (r) arr.push(r);
        }
        return arr;
    }, [] as Array<Exclude<ReturnType<typeof findRepeatsX>, void>>);
    if (repeats.length > 1) {
        // 有多组重复的元素，尝试合并它们
        const repeatChildren = _.map(repeats, r => r.containerNode.children!);
        const repeatCountSame = _.uniqBy(repeatChildren, n => n.length).length === 1;
        if (repeatCountSame) {
            const repeatCount = repeatChildren[0].length;
            function calRelativePos([base, ...others]: VNode[]) {
                return others.map(n => [n.bounds.left - base.bounds.left, n.bounds.top - base.bounds.top].join(',')).join(';');
            }
            // 每组元素之间的相对位置都一样
            const relativePoses: string[] = [];
            for (let i = 0; i < repeatCount; i++) {
                const repeatNode = _.map(repeatChildren, n => n[i]);
                const relativePos = calRelativePos(repeatNode);
                relativePoses.push(relativePos);
            }
            if (_.uniq(relativePoses).length === 1) {
                // 每组元素之间的相对位置都一样，可以合并

            }
        }
    } else if (repeats.length) {
        // 只有一组重复的元素
        repeats[0].replaceNow();
    }
}

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

function groupNodesByOverlap(nodes: VNode[]) {
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

function groupNodes(nodes: VNode[]): VNode[] {
    if (!nodes.length) return [];

    // tryRegroupRepeats(nodes);


    // 先考虑横着排，找高度最高的节点，往后面找底线不超过它的节点
    // 这些元素中，再划分竖着的盒子，只要横坐标重叠的元素，全部用一个竖盒子包裹
    const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
    const [intersectingNodes, leftoverNodes] = _.partition(nodes, node => node.bounds.top >= highestNode.bounds.top && node.bounds.bottom <= highestNode.bounds.bottom);

    if (intersectingNodes.length > 1) {
        const groups = groupNodesByOverlap(intersectingNodes);
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

function buildFlexBox(parent: VNode) {
    if (parent.children) {
        assert(!parent.direction, "这里应该还没生成flex盒子");
        mergeUnnessaryNodes(parent, true);
        parent.children = groupNodes(parent.children);
        mergeUnnessaryNodes(parent);
    }
}

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
            parent.classList = _.uniq(_.union(parent.classList, child.classList));
            parent.widthSpec = child.widthSpec;
            parent.heightSpec = child.heightSpec;
            parent.style = _.merge(parent.style, child.style);
            parent.attributes = _.merge(parent.attributes, child.attributes);
            parent.direction = child.direction;
            parent.attachNodes = _.union(parent.attachNodes, child.attachNodes);
            children.splice(0, 1, ...(child.children || []));
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

/** 生成flexbox布局 */
function virtualNode2Dom(vnode: VNode) {
    if (vnode.widthSpec === SizeSpec.Fixed) {
        vnode.classList.push(`w-${vnode.bounds.width}`);
    }
    if (vnode.heightSpec === SizeSpec.Fixed) {
        vnode.classList.push(`h-${vnode.bounds.height}`);
    }

    if (vnode.direction && vnode.children && vnode.children.length) {
        vnode.classList.push('flex');
        if (vnode.direction === Direction.Column) {
            vnode.classList.push('flex-col');
        }
        const children = vnode.children;

        const sf = vnode.direction === Direction.Row ? 'top' : 'left';
        const ef = vnode.direction === Direction.Row ? 'bottom' : 'right';
        const s = sf[0];
        const e = ef[0];
        const ssf = vnode.direction === Direction.Row ? 'left' : 'top';
        const eef = vnode.direction === Direction.Row ? 'right' : 'bottom';
        const ss = ssf[0];
        const ee = eef[0];
        const ff = vnode.direction === Direction.Row ? 'x' : 'y';
        const spec = vnode.direction === Direction.Row ? 'heightSpec' : 'widthSpec';

        // 据children在node中的位置计算flex对齐方式
        let margins = children.map(n => ({
            marginStart: n.bounds[sf] - vnode.bounds[sf],
            marginEnd: vnode.bounds[ef] - n.bounds[ef],
            marginDiff: n.bounds[sf] - vnode.bounds[sf] - (vnode.bounds[ef] - n.bounds[ef])
        }));
        function countGroupsWithMoreThanOne(keyFn: (n: any) => number) {
            // 分组函数，将数字分到与其相差2以内的组
            function groupKey(num: number) {
                return Math.floor(num / 2) * 2;
            }
            // 使用groupBy对数组进行分组
            const grouped = _.groupBy(margins, n => groupKey(keyFn(n)));

            const maxMagin = _.maxBy(_.values(grouped), g => g.length)!;
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
                child.classList.push(R`m${s}-${margin.marginStart}`);
                if (!child[spec]) {
                    child.classList.push(R`m${e}-${margin.marginEnd}`)
                    child[spec] = vnode[spec];
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

        // 根据children在node中的位置计算flex主轴布局
        // TODO: flex1怎么加
        const ranges = _.zip(
            [...children.map(n => n.bounds[ssf]), vnode.bounds[eef]],
            [vnode.bounds[ssf], ...children.map(n => n.bounds[eef])]
        ) as [number, number][];
        const gaps = ranges.map(([p, n]) => p - n);
        const startGap = gaps.shift()!;
        const endGap = gaps.pop()!;
        const equalGap = _.uniq(gaps).length === 1;
        const maxGap = _.max(gaps);

        function defaultJustify() {
            if (equalGap) {
                vnode.classList.push(R`space-${ff}-${gaps[0]} p-${ss}-${startGap}`);
            } else {
                gaps.unshift(startGap);
                if (maxGap) {
                    const maxCount = gaps.filter(gap => gap === maxGap).length;
                    if (maxCount === 1) {
                        const insertIndex = gaps.indexOf(maxGap);
                        gaps[insertIndex] = 0;
                        gaps.splice(insertIndex, 0, 0);

                        const pos = Math.round(vnode.bounds[sf] + vnode.bounds[ef] / 2);
                        const [eefn, ssfn] = ranges[insertIndex];
                        const spec1 = vnode.direction === Direction.Row ? 'width' : 'height';
                        const spec2 = vnode.direction === Direction.Row ? 'height' : 'width';
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
                            index: context.index++
                        });

                        if (numSame(startGap, endGap)) {
                            gaps[0] = 0;
                            vnode.classList.push(R`p${ff}-${startGap}`);
                        }
                    }
                }

                gaps.forEach((g, i) => {
                    children[i].classList.push(R`m${ss}-${g}`);
                });
            }
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
                    if (vnode.children.length === 2) {
                        // 只有两个元素，直接两边排
                        vnode.classList.push('justify-between');
                        vnode.classList.push(R`p${ff}-${startGap}`);
                    } else {
                        defaultJustify();
                    }
                } else {
                    vnode.classList.push('justify-center');
                    if (equalGap) {
                        vnode.classList.push(R`space-${ff}-${gaps[0]}`)
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
                vnode.classList.push(R`space-${ff}-${gaps[0]}`)
            } else {
                gaps.push(endGap);
                gaps.forEach((g, i) => {
                    children[i].classList.push(R`m${ee}-${g}`);
                });
            }
        }
    }
}

// 再考虑竖坐标互相包含的元素，这些元素可以用一个横向的盒子包起来
// 再考虑剩下的孤儿元素，这些元素如果和其他兄弟节点相交，可以考虑将其设置为绝对定位
// 要考虑有文案的元素，高度会自动撑开，所以高度不能写死，绝对定位也得重新考虑
export function postprocess(node: VNode) {
    if (!node.direction) {
        buildMissingTree(node);
        buildFlexBox(node);
    }
    virtualNode2Dom(node);

    _.each(node.children, postprocess);
}