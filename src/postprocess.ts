import * as _ from 'lodash';
import { Range, allNumsEqual, anyElesIn, assert, collectContinualRanges, collectRepeatRanges, combineAndIterate, groupByWith, groupWith, numEq, numGt, numGte, numLt, numLte, removeEle, removeEles, replaceRangesWithEle, unreachable } from "./utils";
import { Direction, SizeSpec, VNode, context } from "./vnode";
import { BuildStage, debug, defaultConfig } from './config';
import { R, R2, addRole, getBounds, getClassList, getIntersectionArea, getMiddleLine, isContainedWithin, isContainedWithinX, isContainedWithinY, isCrossDirection, isEqualBox, isFlexWrapLike, isGhostNode, isListContainer, isListWrapContainer, isListXContainer, isListYContainer, isMultiLineText, isOverlapping, isOverlappingX, isRole, isSingleLineText, isTextNode, isTextRight, newVNode, normalizeClassName, removeRole } from './helpers';
import { maybeBorder, maybeInlineButton, maybeTable } from './roles';

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
    if (isListXContainer(vnode)) {
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
    const nodeArea = isTextNode(node) ? 100000000 : node.bounds.width * node.bounds.height;
    /** 面积低于此数值的直接绝对定位 */
    const attachPassArea = 5000;
    for (const potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isOverlapping(node, potentialParent)) {
            const area = potentialParent.bounds.width * potentialParent.bounds.height;

            if (nodeArea > attachPassArea) {
                const allowAttach = area > nodeArea * 2 && getIntersectionArea(node, potentialParent) > nodeArea / 2;
                if (!allowAttach) continue;
            }

            if (area > nodeArea && area < minArea) {
                minArea = area;
                bestIntersectNode = potentialParent;
            }
        }
    }
    return bestIntersectNode;
}

/** 删除幽灵节点，这些节点本身没样式 */
function removeGhostNodes(vnode: VNode) {
    if (vnode.children.length) {
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

/** 给列表元素的文本节点扩充宽度 */
// function expandItemRoomForListX(vnode: VNode, isItemGroup: boolean, leftAvailableRoom: number, rightAvailableRoom: number) {
//     // 中线均匀，需要把每个item的宽度设置成一样的
//     const middleLineGap = getListXItemMiddleLineGap(vnode);
//     const itemNode = vnode.children[0];

//     if (isItemGroup) {
//         // 只考虑文本节点在右边的扩充
//         const lastChild = _.last(itemNode.children)!;

//         if (
//             isTextNode(lastChild) &&
//             _.every(vnode.children.slice(0, -1), vnode => vnode.widthSpec === SizeSpec.Fixed)
//         ) {
//             // 往右边扩充
//             const rightWidth = rightAvailableRoom + lastChild.bounds.width;
//             const newWidth = Math.min(middleLineGap * 0.8, rightWidth);
//             _.each(vnode.children, child => {
//                 const textNode = _.last(child.children)!;
//                 textNode.widthSpec = SizeSpec.Fixed;
//                 const widthDiff = newWidth - child.bounds.width;
//                 child.bounds.width = newWidth;
//                 child.bounds.right += widthDiff;
//             });
//         } else if (!_.every(vnode.children, vnode => vnode.widthSpec === SizeSpec.Fixed)) {
//             console.warn('横向列表元素无法自动扩充空间');
//         }
//     } else if (isTextNode(itemNode)) {
//         // 往两边扩充
//         const leftWidth = leftAvailableRoom + _.first(vnode.children)!.bounds.width / 2;
//         const rightWidth = rightAvailableRoom + _.last(vnode.children)!.bounds.width / 2;
//         // TODO: 文本靠太近，甚至已经小于20%的间距？
//         const halfWidth = Math.min(middleLineGap * 0.4, leftWidth, rightWidth);
//         const newWidth = halfWidth * 2;
//         _.each(vnode.children, child => {
//             child.widthSpec = SizeSpec.Fixed;
//             child.classList.push('text-center');
//             const widthDiff = newWidth - child.bounds.width;
//             child.bounds.width = newWidth;
//             child.bounds.left -= widthDiff / 2;
//             child.bounds.right += widthDiff / 2;
//         });
//     }
// }

/** 为每个节点找到最佳父节点，保证nodes互不相交 */
function buildMissingNodes(parent: VNode) {
    let nodes = parent.children;
    if (!nodes.length) return;

    let [leafNodes, leftover] = _.partition(nodes, node => _.includes(defaultConfig.leafNodes, node.id!));

    if (leftover.length) {
        nodes = leftover;
    } else {
        leafNodes = [];
    }

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
                bestParent.attachNodes.push(node);
            } else {
                bestParent.children.push(node);
            }
            return false;
        } else {
            return true;
        }
    });

    nodes = nodes.concat(leafNodes);

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
        (
            (isTextRight(a) && isTextRight(b) && numEq(a.bounds.right, b.bounds.right)) ||
            (numEq(a.bounds.left, b.bounds.left))
        )
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
        numEq(a.bounds.left, b.bounds.left) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) && !isTextNode(b) &&
        numEq(a.bounds.left, b.bounds.left) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    return false;
}

/** 获取两个元素之间direction方向的间距 */
function getItemGap(nextItem: VNode, prevItem: VNode, direction: Direction) {
    if (direction === Direction.Row) {
        return nextItem.bounds.left - prevItem.bounds.right;
    } else {
        return nextItem.bounds.top - prevItem.bounds.bottom;
    }
}

/** 检查列表是否合法 */
function checkListInvalid(otherNodes: VNode[], list: VNode) {
    otherNodes = _.difference(otherNodes, list.children);
    return _.some(otherNodes, node => isOverlapping(list, node) && !isContainedWithin(list, node));
}

/** 文本节点大概率重复，需要排除这种过度包装成列表 */
function checkListItemUnnecessary(itemNodes: VNode[]) {
    const textHeight = _.uniqWith(itemNodes.map(item => isTextNode(item) ? item.bounds.height : 0));

    if (textHeight.length === 1 && textHeight[0] !== 0) {
        return true;
    }
}

/** 寻找重复节点，将其归成列表 */
function groupListNodes(nodes: VNode[], direction: Direction) {
    const ranges = collectContinualRanges(nodes, _.constant(true), range => {
        const listItems = nodes.slice(range.start, range.end);
        const gaps = listItems.slice(1).map((item, index) => getItemGap(item, listItems[index], direction));
        if (!allNumsEqual(gaps)) {
            return false;
        }

        return true;
    });
    const lists = ranges.map(range => {
        const listItems = nodes.slice(range.start, range.end);
        const listNode = newVNode({
            children: listItems,
            bounds: getBounds(listItems),
            role: [direction === Direction.Row ? 'list-x' : 'list-y'],
            direction,
            [direction === Direction.Row ? 'widthSpec' : 'heightSpec']: SizeSpec.Auto,
        });
        _.each(listItems, child => {
            addRole(child, 'list-item');
        });
        return listNode;
    });

    return lists;
}

/** 将多个结构一致的列表合成为一个 */
function tryMergeListNodes(otherNodes: VNode[], lists: VNode[], direction: Direction) {
    /** 获取列表item之间的间距 */
    function getListItemGap(vnode: VNode) {
        return getItemGap(vnode.children[1], vnode.children[0], direction);
    }
    /** 获取列表item中线之间的间距 */
    function getListItemMiddleLineGap(vnode: VNode) {
        return getMiddleLine(vnode.children[1], direction) - getMiddleLine(vnode.children[0], direction);
    }
    function getListItemStartLineGap(vnode: VNode) {
        if (direction === Direction.Row) {
            return vnode.children[1].bounds.left - vnode.children[0].bounds.left;
        } else {
            return vnode.children[1].bounds.top - vnode.children[0].bounds.top;
        }
    }
    function getListItemEndLineGap(vnode: VNode) {
        if (direction === Direction.Row) {
            return vnode.children[1].bounds.right - vnode.children[0].bounds.right;
        } else {
            return vnode.children[1].bounds.bottom - vnode.children[0].bounds.bottom;
        }
    }

    let mergeType: 'flexWrap' | 'normal' | false = false;
    function compareList(a: VNode, b: VNode) {
        if (direction === Direction.Row && (!mergeType || mergeType == 'flexWrap')) {
            if (
                isSimilarBoxWrap(a.children[0], b.children[0]) &&
                numEq(getListItemGap(a), getListItemGap(b)) &&
                numEq(a.children[0].bounds.left, b.children[0].bounds.left)
            ) {
                if (!mergeType && isTextNode(a.children[0]) && a.children.length === 2) {
                    mergeType = false;
                    return mergeType;
                }
                mergeType = 'flexWrap';
                return mergeType;
            }
        }
        if (!mergeType || mergeType == 'normal') {
            if (
                a.children.length === b.children.length &&
                (
                    numEq(getListItemMiddleLineGap(a), getListItemMiddleLineGap(b)) ||
                    (direction === Direction.Row && numEq(getListItemStartLineGap(a), getListItemStartLineGap(b)))
                )
            ) {
                mergeType = 'normal';
                return mergeType;
            }
        }
        mergeType = false;
        return false;
    }

    function mergeLists(range: Range<'flexWrap' | 'normal'>) {
        // 开始合并
        const mergeType = range.ele;
        const toMergeLists = lists.slice(range.start, range.end);

        if (mergeType === 'flexWrap') {
            console.debug('找到合并的横向flexWrap列表');
            const children = _.flatMap(toMergeLists, listX => listX.children);

            const vnode = newVNode({
                bounds: getBounds(children),
                children,
                role: ['list-wrap'],
                direction: Direction.Row,
                widthSpec: SizeSpec.Auto,
                heightSpec: SizeSpec.Auto
            });

            // flex-wrap应该留出左边的间距
            const xGap = toMergeLists[0].children[1].bounds.left - toMergeLists[0].children[0].bounds.right;
            vnode.bounds.left -= xGap;
            // 右边也多留两像素保持换行与设计稿一致
            vnode.bounds.right += 2;
            vnode.bounds.width = vnode.bounds.right - vnode.bounds.left;
            // 上面也要留出margin
            const yGap = toMergeLists[1].children[0].bounds.top - toMergeLists[0].children[0].bounds.bottom;
            vnode.bounds.top -= yGap;
            vnode.bounds.height = vnode.bounds.bottom - vnode.bounds.top;

            return {
                vnode,
                toMergeLists
            };
        } else {
            console.debug(`找到合并的${direction === Direction.Row ? '横向' : '纵向'}列表`);
            const children = _.map(_.zip(..._.map(toMergeLists, 'children')), (vChildren) => {
                const group = vChildren as VNode[];
                _.each(group, (vnode) => {
                    removeRole(vnode, 'list-item');
                });
                const vnode = newVNode({
                    bounds: getBounds(group),
                    children: group,
                    role: ['list-item']
                });
                return vnode;
            });
            const vnode = newVNode({
                bounds: getBounds(children),
                children,
                role: [direction === Direction.Row ? 'list-x' : 'list-y'],
                direction,
                [direction === Direction.Row ? 'widthSpec' : 'heightSpec']: SizeSpec.Auto
            });

            return {
                vnode,
                toMergeLists
            };
        }
    }

    const ranges = collectContinualRanges(lists, compareList, range => {
        const listItems = lists.slice(range.start, range.end);
        const fakeListNode = {
            bounds: getBounds(listItems),
            children: _.flatMap(listItems, list => list.children),
        } as VNode;
        if (checkListInvalid(otherNodes, fakeListNode)) {
            return false;
        }
        if (checkListItemUnnecessary(listItems.map(n => n.children[0]))) {
            return false;
        }
        return true;
    });

    return ranges.map(range => mergeLists(range));
}

/** 先寻找可能构成列表的节点，这些节点应该作为一个整体 */
function buildListNodes(vnode: VNode) {
    {
        const otherNodes = vnode.children;
        let rows = Array.from(groupWith(vnode.children, isSimilarBoxX).values()).filter(nodes => nodes.length > 1);
        rows = _.sortBy(rows, row => row[0].bounds.top).map(nodes => _.sortBy(nodes, node => node.bounds.left));

        const tables = maybeTable(rows);
        tables.forEach(table => {
            removeEles(rows, table.tableRows);
            vnode.children.push(table.tableBody);
        });

        rows = rows.map(row => groupListNodes(row, Direction.Row));
        rows = rows.filter(row => row.length);
        // 现在rows里面只有列表节点

        const removedNodes = _.flatMapDeep(rows, row => row.map(list => list.children));
        const addPlainListNodes = _.flatten(rows);
        const addCombinedListNodes: VNode[] = [];

        combineAndIterate(rows, combination => {
            const mergeInfos = tryMergeListNodes(otherNodes, combination, Direction.Row);
            _.each(mergeInfos, mergeInfo => {
                const { vnode, toMergeLists } = mergeInfo;
                removeEles(addPlainListNodes, toMergeLists);
                addCombinedListNodes.push(vnode);
            });
            return mergeInfos.length > 0;
        });

        const addListNodes = [...addPlainListNodes, ...addCombinedListNodes];
        _.each(addPlainListNodes, list => {
            // 文本节点大概率重复, 如果只有俩个则忽略
            if (
                list.children.length === 2 ||
                _.every(list.children, isTextNode) || // 单节点列表如果都是文本，则没必要
                checkListInvalid(otherNodes, list)
            ) {
                removeEle(addListNodes, list);
                _.each(list.children, child => {
                    removeRole(child, 'list-item');
                });
                removeEles(removedNodes, list.children);
            } else {
                console.debug('找到横向列表');
            }
        });
        removeEles(vnode.children, removedNodes);
        vnode.children.push(...addListNodes);
    }
    {
        const otherNodes = vnode.children;
        let cols = Array.from(groupWith(vnode.children, isSimilarBoxY).values()).filter(nodes => nodes.length > 1);
        cols = _.sortBy(cols, col => col[0].bounds.left).map(nodes => _.sortBy(nodes, node => node.bounds.top));
        cols = cols.map(col => groupListNodes(col, Direction.Column));
        cols = cols.filter(col => col.length);
        // 现在cols里面只有列表节点

        const removedNodes = _.flatMapDeep(cols, col => col.map(list => list.children));
        const addPlainListNodes = _.flatten(cols);
        const addCombinedListNodes: VNode[] = [];

        combineAndIterate(cols, combination => {
            const mergeInfos = tryMergeListNodes(otherNodes, combination, Direction.Column);
            _.each(mergeInfos, mergeInfo => {
                const { vnode, toMergeLists } = mergeInfo;
                removeEles(addPlainListNodes, toMergeLists);
                addCombinedListNodes.push(vnode);
            });
            return mergeInfos.length > 0;
        });

        const addListNodes = [...addPlainListNodes, ...addCombinedListNodes];
        _.each(addPlainListNodes, list => {
            // 文本节点大概率重复, 如果只有俩个则忽略
            if (
                list.children.length === 2 ||
                _.every(list.children, isTextNode) || // 单节点列表如果都是文本，则没必要
                checkListInvalid(otherNodes, list)
            ) {
                removeEle(addListNodes, list);
                _.each(list.children, child => {
                    removeRole(child, 'list-item');
                });
                removeEles(removedNodes, list.children);
            } else {
                console.debug('找到纵向列表');
            }
        });

        removeEles(vnode.children, removedNodes);
        vnode.children.push(...addListNodes);
    }
}

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
            const [intersectingNodes, leftoverNodes] = _.partition(nodes, node => isContainedWithinY(node, highestNode));
            if (intersectingNodes.length > 1) {
                const vnode = newVNode({
                    children: intersectingNodes,
                    bounds: getBounds(intersectingNodes),
                    direction: Direction.Row,
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
            const [intersectingNodes, leftoverNodes] = _.partition(nodes, node => isContainedWithinX(node, widestNode));
            if (intersectingNodes.length > 1) {
                const vnode = newVNode({
                    children: intersectingNodes,
                    bounds: getBounds(intersectingNodes),
                    direction: Direction.Column,
                });
                // 有可能两个盒子互相交叉，横竖都能分在一组，此时不能再往下分了
                if (intersectingNodes.length === prevCrossCount) {
                    console.warn(`${prevCrossCount}个盒子互相交叉，横竖都能分在一组`);
                } else {
                    vnode.children = groupNodes(intersectingNodes, Direction.Column, intersectingNodes.length);
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
function buildFlexBox(parent: VNode) {
    if (parent.children.length) {
        assert(!parent.direction, "这里应该还没生成flex盒子");
        parent.direction = decideFlexDirection(parent.children);
        parent.children = groupNodes(parent.children, parent.direction);
    }
}

/** 合并节点 */
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
    dest.role = _.merge(dest.role, src.role);
    dest.direction = src.direction;
    dest.attachNodes = _.union(dest.attachNodes, src.attachNodes);
}

/** 提前先把和父盒子一样大的消掉 */
function mergeUnnessaryNodes(parent: VNode) {
    const { children } = parent;

    if (!children.length) {
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

    if (children.length !== 1) {
        return;
    }

    const child = children[0];
    if (isListContainer(child)) {
        return;
    }

    // 子盒子可以扩大
    if (
        child.direction &&
        child.heightSpec !== SizeSpec.Fixed &&
        child.widthSpec !== SizeSpec.Fixed &&
        isGhostNode(child)
    ) {
        mergeNode(parent, child);
        parent.children = child.children;
        mergeUnnessaryFlexBox(parent);
    }
}

/** 生成align-items */
function measureFlexAlign(parent: VNode) {
    const children = parent.children;

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
                isFlexWrapLike(child)
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

    // 这种情况下给个最小尺寸
    if (parent[alignSpec] === SizeSpec.Auto) {
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
    const children = parent.children;

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
            // 优先让后面的撑开
            return _.lastIndexOf(gaps, maxGap);
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
                if (i < 1) {
                    return;
                }
                children[i].classList.push(R`m${ss}-${g}`);
            });
            parent.classList.push(R`p${xy}-${startGap}`);
        }
        // 自动撑开就干脆全部往下margin
        else if (parent[justifySpec] === SizeSpec.Auto || justifySide === 'start') {
            gaps.push(endGap);
            gaps.slice(1).forEach((g, i) => {
                children[i].classList.push(R`m${ee}-${g}`);
            });
            parent.classList.push(R`p${ss}-${startGap}`);
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

    if (justifySpec === 'widthSpec' && parent[justifySpec] === SizeSpec.Auto) {
        // 对多行元素需要设置固定尺寸
        _.each(children, child => {
            if (isFlexWrapLike(child) && child[justifySpec] === SizeSpec.Auto) {
                child[justifySpec] = SizeSpec.Fixed;
            }
        });
    }

    // 已经在扩充auto元素尺寸时指定过了
    parent.classList = getClassList(parent);
    const specifiedSide = parent.classList.find(className => className.startsWith('justify-'));
    if (specifiedSide) {
        // if (specifiedSide === 'justify-center' && numEq(startGap, 0)) {
        //     console.warn('父容器指定我居中显示，但实际我需要justify-between');
        //     removeEle(parent.classList, specifiedSide);
        // } else {
        removeEle(parent.classList, specifiedSide);
        justifySide = specifiedSide.split('justify-')[1];
        sideJustify();
        return;
        // }
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
    if (!children.length) {
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
    const firstChild = parent.children[0];
    const secondChild = parent.children[1];
    const firstWrapChild = _.find(parent.children, (child) => !numEq(child.bounds.top, firstChild.bounds.top), 1)!;

    const xGap = secondChild.bounds.left - firstChild.bounds.right;
    const yGap = firstWrapChild.bounds.top - firstChild.bounds.bottom;

    _.each(parent.children, (child) => {
        child.classList.push(R`ml-${xGap} mt-${yGap}`);
    });
}

/** 生成列表布局 */
function measureFlexListLayout(parent: VNode) {
    const firstChild = parent.children[0];
    const secondChild = parent.children[1];

    if (isListXContainer(parent)) {
        const xGap = secondChild.bounds.left - firstChild.bounds.right;
        parent.classList.push(R`space-x-${xGap}`);

        // 如果有一个列表元素高度固定，则所有元素高度都固定，避免不能对齐
        if (_.some(parent.children, child => child.heightSpec === SizeSpec.Fixed)) {
            _.each(parent.children, child => child.heightSpec === SizeSpec.Fixed);
        }
    } else if (isListYContainer(parent)) {
        const yGap = secondChild.bounds.top - firstChild.bounds.bottom;
        parent.classList.push(R`space-y-${yGap}`);

        // 如果有一个列表元素宽度固定，则所有元素宽度都固定，避免不能对齐
        if (_.some(parent.children, child => child.widthSpec === SizeSpec.Fixed)) {
            _.each(parent.children, child => child.widthSpec === SizeSpec.Fixed);
        }
    }
}

/** 生成flexbox布局 */
function measureFlexLayout(parent: VNode) {
    if (parent.children?.length) {
        parent.classList.push('flex');
        if (parent.direction === Direction.Column) {
            parent.classList.push('flex-col');
        }

        if (isListWrapContainer(parent)) {
            measureFlexWrapLayout(parent);
        } else if (isListXContainer(parent) || isListYContainer(parent)) {
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
        buildListNodes(vnode);
        buildMissingNodes(vnode);
        buildFlexBox(vnode);
    }
    mergeUnnessaryFlexBox(vnode);

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
        if (defaultConfig.removeGhostNodes) {
            removeGhostNodes(vnode);
        }
    }

    if (debug.buildToStage >= BuildStage.Tree) {
        buildTree(vnode);
    }

    if (debug.buildToStage >= BuildStage.Measure) {
        measureTree(vnode);
    }
}