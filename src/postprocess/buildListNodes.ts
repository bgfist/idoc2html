import * as _ from 'lodash';
import {
    Range,
    allNumsEqual,
    collectContinualRanges,
    combineAndIterate,
    groupWith,
    numEq,
    removeEle,
    removeEles
} from '../utils';
import {
    Direction,
    SizeSpec,
    VNode,
    addRole,
    getBounds,
    getMiddleLine,
    isContainedWithin,
    isOverlapping,
    isTextNode,
    isTextRight,
    maybeTable,
    newVNode,
    removeRole
} from '../vnode';

/** 两个盒子是否相似 */
function isSimilarBoxX(a: VNode, b: VNode) {
    if (
        isTextNode(a) &&
        isTextNode(b) &&
        numEq(a.bounds.top, b.bounds.top) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) &&
        !isTextNode(b) &&
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
        isTextNode(a) &&
        isTextNode(b) &&
        numEq(a.bounds.height, b.bounds.height) &&
        ((isTextRight(a) && isTextRight(b) && numEq(a.bounds.right, b.bounds.right)) ||
            numEq(a.bounds.left, b.bounds.left))
    ) {
        return true;
    }
    if (
        !isTextNode(a) &&
        !isTextNode(b) &&
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
        isTextNode(a) &&
        isTextNode(b) &&
        numEq(a.bounds.left, b.bounds.left) &&
        numEq(a.bounds.height, b.bounds.height)
    ) {
        return true;
    }
    if (
        !isTextNode(a) &&
        !isTextNode(b) &&
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
    const textHeight = _.uniqWith(itemNodes.map(item => (isTextNode(item) ? item.bounds.height : 0)));

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
            [direction === Direction.Row ? 'widthSpec' : 'heightSpec']: SizeSpec.Auto
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
                (numEq(getListItemMiddleLineGap(a), getListItemMiddleLineGap(b)) ||
                    (direction === Direction.Row &&
                        numEq(getListItemStartLineGap(a), getListItemStartLineGap(b))))
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
            const children = _.map(_.zip(..._.map(toMergeLists, 'children')), vChildren => {
                const group = vChildren as VNode[];
                _.each(group, vnode => {
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
            children: _.flatMap(listItems, list => list.children)
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
export function buildListNodes(vnode: VNode) {
    {
        const otherNodes = vnode.children;
        let rows = Array.from(groupWith(vnode.children, isSimilarBoxX).values()).filter(
            nodes => nodes.length > 1
        );
        rows = _.sortBy(rows, row => row[0].bounds.top).map(nodes =>
            _.sortBy(nodes, node => node.bounds.left)
        );

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
        let cols = Array.from(groupWith(vnode.children, isSimilarBoxY).values()).filter(
            nodes => nodes.length > 1
        );
        cols = _.sortBy(cols, col => col[0].bounds.left).map(nodes =>
            _.sortBy(nodes, node => node.bounds.top)
        );
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
