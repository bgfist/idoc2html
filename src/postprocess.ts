import { VNode, context } from "./vnode";
import * as _ from 'lodash';

function isContainedWithinX(parent: VNode, child: VNode) {
    return (
        child.bounds.left >= parent.bounds.left &&
        child.bounds.right <= parent.bounds.right
    );
}

function isContainedWithinY(parent: VNode, child: VNode) {
    return (
        child.bounds.top >= parent.bounds.top &&
        child.bounds.bottom <= parent.bounds.bottom
    );
}

/** 处理元素之间的包含关系 */
function isContainedWithin(parent: VNode, child: VNode) {
    return isContainedWithinX(parent, child) && isContainedWithinY(parent, child);
}

function isOverlappingX(parent: VNode, child: VNode) {
    return (
        child.bounds.left <= parent.bounds.right &&
        child.bounds.right >= parent.bounds.left
    );
}

function isOverlappingY(parent: VNode, child: VNode) {
    return (
        child.bounds.top <= parent.bounds.bottom &&
        child.bounds.bottom >= parent.bounds.top
    );
}

/** 处理元素之间的重叠关系 */
function isOverlapping(parent: VNode, child: VNode) {
    return isOverlappingX(parent, child) && isOverlappingY(parent, child);
}

/** 寻找父节点，最小的包围盒子 */
function findBestParent(node: VNode, nodes: VNode[]) {
    let bestParent: VNode | null = null;
    let minArea = Infinity;
    let type: 'contained' | 'overlapping' = 'contained';
    const nodeArea = node.bounds.width * node.bounds.height;
    for (let potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isContainedWithin(potentialParent, node) && type === 'contained') {
            let area = potentialParent.bounds.width * potentialParent.bounds.height;
            if (area < minArea) {
                minArea = area;
                bestParent = potentialParent;
            }
        } else if (isOverlapping(potentialParent, node)) {
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
                    prev!.bounds.top === next!.bounds.top
                ) {
                    return true;
                }
                if (
                    !prev!.textContent && !next!.textContent &&
                    prev!.bounds.top === next!.bounds.top &&
                    prev!.bounds.width === next!.bounds.width &&
                    prev!.bounds.height === next!.bounds.height
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


    // 先考虑横着排，找高度最高的节点，往后面找底线不超过它的节点
    // 这些元素中，再划分竖着的盒子，只要横坐标重叠的元素，全部用一个竖盒子包裹
    const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
    const [intersectingNodes, leftoverNodes] = _.partition(nodes, node => node.bounds.top <= highestNode.bounds.top && node.bounds.bottom <= highestNode.bounds.bottom);

    if (intersectingNodes.length > 1) {
        const groups = groupNodesByOverlap(intersectingNodes);
        const nodesx = groups.map(group => {
            if (group.length > 1) {
                const vnode: VNode = {
                    classList: [],
                    isColumn: true,
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
            isRow: true,
            bounds: getBounds(nodesx),
            index: context.index++,
            // 从左到右
            children: nodesx,
        };
        return [vnode, ...groupNodes(leftoverNodes)];
    } else {
        return [highestNode, ...groupNodes(leftoverNodes)]
    }
}

function isEqualBox(a: VNode, b: VNode) {
    return a.bounds.width === b.bounds.width && a.bounds.height === b.bounds.height;
}

/** 移除不必要的中间节点，比如宽高位置与父节点一样的，再合并样式 */
function mergeUnnessaryNodes(parent: VNode): VNode {
    const { children = [] } = parent;
    if (children.length === 1) {
        if (isEqualBox(parent, children[0])) {
            // 这里要合并样式，将parent合并到child
            return children[0];
        }
    }
    if (children.length > 1) {
        parent.children = children.filter((child) => {
            const equal = isEqualBox(parent, child);
            if (!equal) {
                // 这里要合并样式，将child合并到parent
            }
            return !equal;
        });
    }
    return parent;
}

/** 生成flexbox布局 */
function virtualNode2Dom(node: VNode) {
    if (node.isRow) {
        const classList: string[] = ["flex"];
        const children = node.children!;

        // 只有一个子元素，只看是否居中
        if (children!.length === 1) {
            const child = children![0];
            if (child.bounds.top - node.bounds.top > 0) {

            }
        } else {

            // 根据children在node中的位置计算flex对齐方式
            const margins = children.map(n => ({
                marginTop: n.bounds.top - node.bounds.top,
                marginBottom: node.bounds.bottom - n.bounds.bottom,
                marginDiff: n.bounds.top - node.bounds.top - (node.bounds.bottom - n.bounds.bottom)
            }));
            function countGroupsWithMoreThanOne(keyFn: (n) => number) {
                // 分组函数，将数字分到与其相差2以内的组
                function groupKey(num: number) {
                    return Math.floor(num / 2) * 2;
                }
                // 使用groupBy对数组进行分组
                const grouped = _.groupBy(margins, n => groupKey(keyFn(n)));

                return _.maxBy(_.values(grouped), g => g.length)!;
            }
            // 归组
            const marginTopArr = countGroupsWithMoreThanOne(m => m.marginTop);
            const marginBottomArr = countGroupsWithMoreThanOne(m => m.marginBottom);
            const marginDiffArr = countGroupsWithMoreThanOne(m => m.marginDiff);
            const maxCount = Math.max(marginTopArr.length, marginBottomArr.length, marginDiffArr.length);

            if (maxCount > 1 && maxCount)

                if (marginTopCount === 1 && marginBottomCount === 1) {
                    classList.push('items-stretch');
                    margins[0].marginTop && classList.push(`pt - ${margins[0].marginTop} `);
                    margins[0].marginBottom && classList.push(`pb - ${margins[0].marginBottom} `);
                } else if (marginTopCount === 1) {
                    classList.push('items-start');
                    margins[0].marginTop && classList.push(`pt - ${margins[0].marginTop} `);
                } else if (marginBottomCount === 1) {
                    classList.push('items-end');
                    margins[0].marginBottom && classList.push(`pb - ${margins[0].marginBottom} `);
                } else if (marginDiffCount === 1) {
                    classList.push('items-center');
                    const marginDiff = margins[0].marginDiff;
                    if (marginDiff) {
                        if (marginDiff > 0) {
                            classList.push(`mt - ${marginDiff} `);
                        } else {
                            classList.push(`mb - ${-marginDiff} `);
                        }
                    }
                } else {


                }
        }
    } else if (node.isColumn) {

    }
}

// 再考虑竖坐标互相包含的元素，这些元素可以用一个横向的盒子包起来
// 再考虑剩下的孤儿元素，这些元素如果和其他兄弟节点相交，可以考虑将其设置为绝对定位
// 要考虑有文案的元素，高度会自动撑开，所以高度不能写死，绝对定位也得重新考虑
export function postprocess(nodes: VNode[], parent: VNode) {
    // 为每个节点找到最佳父节点，剩下的元素互不相交
    nodes = nodes.filter(node => {
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
        } else {
            return true;
        }
    });

    nodes = groupNodes(nodes);
}