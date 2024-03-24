import * as _ from 'lodash';
import { collectLongestRepeatRanges, groupWith, numEq, pickCombination, removeEles } from '../utils';
import {
    Direction,
    Side,
    SizeSpec,
    VNode,
    addRole,
    getBounds,
    getMiddleLine,
    isContainedWithin,
    isListItemWrapped,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    isMultiLineText,
    isOverlapping,
    isSingleLineText,
    isTableBody,
    isTableRow,
    isTextNode,
    isTextRight,
    maybeTable,
    newVNode,
    refreshBoxBounds
} from '../vnode';
import { defaultConfig } from '../config';

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

function getOriginalListItemNodes(list: VNode) {
    return _.flatMap(list.children, listItem => (isListItemWrapped(listItem) ? listItem.children : listItem));
}

/** 检查列表是否合法 */
function checkListInvalid(otherNodes: VNode[], list: VNode) {
    otherNodes = _.difference(otherNodes, getOriginalListItemNodes(list));
    return _.some(otherNodes, node => isOverlapping(list, node) && !isContainedWithin(list, node));
}

/** 文本节点大概率重复，需要排除这种过度包装成列表 */
function checkListItemUnnecessary(itemNodes: VNode[]) {
    const textHeight = _.uniqWith(itemNodes.map(item => (isTextNode(item) ? item.bounds.height : 0)));

    if (textHeight.length === 1 && textHeight[0] !== 0) {
        return true;
    }
}

/** 给列表元素设置固定的宽度/高度，可以优化布局方式 */
function setFixedSizeIfConfigured(vnode: VNode) {
    if (defaultConfig.listItemSizeFixed) {
        if (isListXContainer(vnode) || isListWrapContainer(vnode)) {
            _.each(vnode.children, item => {
                item.heightSpec = SizeSpec.Fixed;
            });
        } else if (isListYContainer(vnode)) {
            _.each(vnode.children, item => {
                item.widthSpec = SizeSpec.Fixed;
            });
        }
    }
}

/** 给合成的list-item设置同样的尺寸大小和同样的间距 */
function setListItemSameSizeAndGap(
    toMergeLists: VNode[],
    vnode: VNode,
    direction: Direction,
    mergeAlign: Side
) {
    if (direction === Direction.Row) {
        // 高度固定
        const multiTextLists = _.filter(toMergeLists, item => isMultiLineText(item.children[0]));
        _.each(multiTextLists, multiTextList => {
            const maxHeight = _.max(multiTextList.children.map(item => item.bounds.height))!;
            _.each(multiTextList.children, item => {
                item.bounds.height = maxHeight;
                item.bounds.bottom = item.bounds.top + maxHeight;
                item.heightSpec = SizeSpec.Fixed;
            });
        });
        const maxWidth = _.max(vnode.children.map(item => item.bounds.width))!;
        _.each(vnode.children, item => {
            item.bounds.width = maxWidth;
            if (mergeAlign === 'center') {
                item.bounds.left -= Math.round((maxWidth - item.bounds.width) / 2);
                item.bounds.right = item.bounds.left + maxWidth;
            } else if (mergeAlign === 'start') {
                item.bounds.right = item.bounds.left + maxWidth;
            } else if (mergeAlign === 'end') {
                item.bounds.left -= item.bounds.right - maxWidth;
            }
            refreshBoxBounds(item);
        });
        refreshBoxBounds(vnode);
    } else if (direction === Direction.Column) {
        const singleTextLists = _.filter(toMergeLists, item => isSingleLineText(item.children[0]));

        _.each(singleTextLists, singleTextList => {
            const maxWidth = _.max(singleTextList.children.map(item => item.bounds.width))!;
            _.each(singleTextList.children, item => {
                item.bounds.width = maxWidth;
                item.bounds.right = item.bounds.left + maxWidth;
                item.widthSpec = SizeSpec.Fixed;
                // makeSingleLineTextNoWrap(item);
            });
        });
        _.each(vnode.children, item => {
            refreshBoxBounds(item);
        });
        refreshBoxBounds(vnode);
    }
}

/** 寻找重复节点，将其归成列表 */
function groupListNodes(nodes: VNode[], direction: Direction) {
    const gaps = nodes.slice(1).map((item, index) => getItemGap(item, nodes[index], direction));
    gaps.push(NaN); // 最后多一个gap作为比较
    const ranges = collectLongestRepeatRanges(gaps, numEq, true);

    const lists = ranges.map(range => {
        let listItems = nodes.slice(range.start, range.end);
        if (range.ele > 1) {
            const chunks = _.chunk(listItems, range.ele);
            listItems = chunks.map(chunk => {
                return newVNode({
                    children: chunk,
                    bounds: getBounds(chunk)
                });
            });
        }

        const listNode = newVNode({
            children: listItems,
            bounds: getBounds(listItems)
        });
        return listNode;
    });

    return lists;
}

/** 将多个结构一致的列表合成为一个 */
function tryMergeListNodes(otherNodes: VNode[], toMergeLists: VNode[], direction: Direction) {
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

    let mergeType: 'flexWrap' | 'normal' | 'skip' | false = false;
    let mergeAlign: Side = 'center';
    function compareList(a: VNode, b: VNode) {
        if (direction === Direction.Row && (!mergeType || mergeType == 'flexWrap')) {
            if (
                isSimilarBoxWrap(a.children[0], b.children[0]) &&
                numEq(getListItemGap(a), getListItemGap(b)) &&
                numEq(a.children[0].bounds.left, b.children[0].bounds.left)
            ) {
                if (!mergeType && isTextNode(a.children[0]) && a.children.length === 2) {
                    mergeType = false;
                    return false;
                }
                mergeType = 'flexWrap';
                return true;
            }
        }
        if (!mergeType || mergeType == 'normal') {
            if (a.children.length === b.children.length) {
                if (numEq(getListItemMiddleLineGap(a), getListItemMiddleLineGap(b))) {
                    mergeAlign = 'center';
                } else if (
                    direction === Direction.Row &&
                    numEq(getListItemStartLineGap(a), getListItemStartLineGap(b))
                ) {
                    mergeAlign = 'start';
                } else if (
                    direction === Direction.Row &&
                    numEq(getListItemEndLineGap(a), getListItemEndLineGap(b))
                ) {
                    mergeAlign = 'end';
                } else {
                    mergeType = false;
                    return false;
                }
                mergeType = 'normal';
                return true;
            }
        }
        mergeType = false;
        return false;
    }

    function mergeLists() {
        const fakeListNode = {
            bounds: getBounds(toMergeLists),
            children: _.flatMap(toMergeLists, list => list.children)
        } as VNode;
        if (checkListInvalid(otherNodes, fakeListNode)) {
            return false;
        }
        if (checkListItemUnnecessary(toMergeLists.map(n => n.children[0]))) {
            return false;
        }

        // 开始合并
        if (mergeType === 'flexWrap') {
            console.debug('找到合并的横向flexWrap列表');
            const children = _.flatMap(toMergeLists, listX => listX.children);

            const vnode = newVNode({
                bounds: getBounds(children),
                children,
                role: ['list-wrap'],
                direction: Direction.Row
            });
            setFixedSizeIfConfigured(vnode);

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

            return vnode;
        } else {
            console.debug(`找到合并的${direction === Direction.Row ? '横向' : '纵向'}列表`);
            const children = _.map(_.zip(..._.map(toMergeLists, 'children')), vChildren => {
                const group = vChildren as VNode[];
                const vnode = newVNode({
                    bounds: getBounds(group),
                    children: _.flatMap(group, listItem =>
                        isListItemWrapped(listItem) ? listItem.children : listItem
                    ),
                    role: ['list-item']
                });
                return vnode;
            });
            const vnode = newVNode({
                bounds: getBounds(children),
                children,
                role: [direction === Direction.Row ? 'list-x' : 'list-y'],
                direction
            });
            setListItemSameSizeAndGap(toMergeLists, vnode, direction, mergeAlign);
            setFixedSizeIfConfigured(vnode);

            return vnode;
        }
    }

    for (let i = 1; i < toMergeLists.length; i++) {
        if (!compareList(toMergeLists[i], toMergeLists[i - 1])) {
            return false;
        }
    }
    return mergeLists();
}

function buildListDirection(vnode: VNode, direction: Direction) {
    const isSimilarFn = direction === Direction.Row ? isSimilarBoxX : isSimilarBoxY;
    const lineAlign = direction === Direction.Row ? 'top' : 'left';
    const lineOrder = direction === Direction.Row ? 'left' : 'top';

    let lines = Array.from(groupWith(vnode.children, isSimilarFn).values()).filter(nodes => nodes.length > 1);
    lines = _.sortBy(lines, line => line[0].bounds[lineAlign]).map(nodes =>
        _.sortBy(nodes, node => node.bounds[lineOrder])
    );

    if (direction === Direction.Row) {
        const tables = maybeTable(lines);
        tables.forEach(table => {
            removeEles(lines, table.tableRows);
            removeEles(vnode.children, _.flatten(table.tableRows));
            vnode.children.push(table.tableBody);
        });
    }

    lines = lines.map(line => groupListNodes(line, direction));

    // 现在lists里面都是列表容器
    const addPlainListNodes = _.flatten(lines);
    const addCombinedListNodes: VNode[] = [];

    let continueMerge = false;
    do {
        continueMerge = false;
        pickCombination(addPlainListNodes, toMergeLists => {
            const combinedListNode = tryMergeListNodes(vnode.children, toMergeLists, direction);
            if (combinedListNode) {
                removeEles(addPlainListNodes, toMergeLists);
                addCombinedListNodes.push(combinedListNode);
                continueMerge = true;
            }
            return !!combinedListNode;
        });
    } while (continueMerge);

    _.remove(addPlainListNodes, list => {
        return (
            (!isListItemWrapped(list.children[0]) && list.children.length === 2) ||
            _.every(list.children, isTextNode) || // 单节点列表如果都是文本，则没必要
            checkListInvalid(vnode.children, list)
        );
    });

    _.each(addPlainListNodes, list => {
        console.debug(`找到${direction === Direction.Row ? '横向列表' : '纵向列表'}`);
        _.assign(list, {
            role: [direction === Direction.Row ? 'list-x' : 'list-y'],
            direction
        });
        setFixedSizeIfConfigured(vnode);
        _.each(list.children, child => {
            addRole(child, 'list-item');
        });
    });

    const addListNodes = _.concat(addPlainListNodes, addCombinedListNodes);
    removeEles(vnode.children, _.flatMap(addListNodes, getOriginalListItemNodes));
    vnode.children.push(...addListNodes);
}

/** 先寻找可能构成列表的节点，这些节点应该作为一个整体 */
export function buildListNodes(vnode: VNode) {
    if (isTableBody(vnode) || isTableRow(vnode)) {
        return;
    }

    // 先找横向列表，横向的可能有flexWrap
    buildListDirection(vnode, Direction.Row);

    buildListDirection(vnode, Direction.Column);
}
