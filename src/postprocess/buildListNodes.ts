import * as _ from 'lodash';
import {
    collectContinualRanges,
    collectLongestRepeatRanges,
    groupWith,
    numEq,
    numGt,
    pairPrevNext,
    removeEle,
    removeEles,
    unreachable
} from '../utils';
import {
    Direction,
    Side,
    SizeSpec,
    VNode,
    addRole,
    getBounds,
    getMiddleLine,
    getSingleLineTextFZLH,
    getTextAlign,
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
    maybeTable,
    newVNode,
    refreshBoxBounds
} from '../vnode';
import { defaultConfig } from '../main/config';

/** 两个盒子是否相似 */
function isSimilarBoxX(a: VNode, b: VNode) {
    if (
        isTextNode(a) &&
        isTextNode(b) &&
        numEq(a.bounds.top, b.bounds.top) &&
        getTextAlign(a) === getTextAlign(b)
    ) {
        a = _.isArray(a.textContent) ? a.textContent[0] : a;
        b = _.isArray(b.textContent) ? b.textContent[0] : b;
        return _.isEqual(getSingleLineTextFZLH(a), getSingleLineTextFZLH(b));
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
        getTextAlign(a) === getTextAlign(b)
    ) {
        const isTextRight = getTextAlign(a) === 'right';
        return (isTextRight && numEq(a.bounds.right, b.bounds.right)) || numEq(a.bounds.left, b.bounds.left);
    }
    if (
        !isTextNode(a) &&
        !isTextNode(b) &&
        numEq(a.bounds.left, b.bounds.left) &&
        numEq(a.bounds.width, b.bounds.width)
    ) {
        return true;
    }
    return false;
}

/** 两个盒子是否相似 */
function isSimilarBoxWrap(prev: VNode, next: VNode, yGap?: number) {
    if (
        isTextNode(prev) &&
        isTextNode(next) &&
        numEq(prev.bounds.left, next.bounds.left) &&
        numEq(prev.bounds.height, next.bounds.height)
    ) {
        return _.isNil(yGap) ? true : numEq(yGap, next.bounds.top - prev.bounds.bottom);
    }
    if (
        !isTextNode(prev) &&
        !isTextNode(next) &&
        numEq(prev.bounds.left, next.bounds.left) &&
        numEq(prev.bounds.height, next.bounds.height)
    ) {
        return _.isNil(yGap) ? true : numEq(yGap, next.bounds.top - prev.bounds.bottom);
    }
    return false;
}

/** 获取两个元素之间direction方向的间距 */
function getItemGap(prevItem: VNode, nextItem: VNode, direction: Direction) {
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
function setListItemSizeSpec(vnode: VNode) {
    let targetSizeSpec = defaultConfig.listItemSizeFixed ? SizeSpec.Fixed : SizeSpec.Constrained;

    if (isListXContainer(vnode)) {
        // 有些列表元素已经固定尺寸了，比如图片
        if (_.some(vnode.children, child => child.heightSpec === SizeSpec.Fixed)) {
            targetSizeSpec = SizeSpec.Fixed;
        }

        if (targetSizeSpec === SizeSpec.Fixed) {
            _.each(vnode.children, item => {
                item.heightSpec = targetSizeSpec;
            });
            vnode.heightSpec = targetSizeSpec;
        }
    } else if (isListYContainer(vnode)) {
        // 有些列表元素已经固定尺寸了，比如图片
        if (_.some(vnode.children, child => child.widthSpec === SizeSpec.Fixed)) {
            targetSizeSpec = SizeSpec.Fixed;
        }

        if (targetSizeSpec === SizeSpec.Fixed) {
            _.each(vnode.children, item => {
                item.widthSpec = targetSizeSpec;
            });
            vnode.widthSpec = targetSizeSpec;
        }
    } else if (isListWrapContainer(vnode)) {
        _.each(vnode.children, item => {
            if (defaultConfig.listItemSizeFixed) {
                item.heightSpec = SizeSpec.Fixed;
            }
        });
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
    const gaps = pairPrevNext(nodes).map(([prev, next]) => getItemGap(prev, next, direction));
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

/** 将多个结构一致的横向列表合成为flexWrap */
function tryMergeFlexWrapNodes(parent: VNode, toMergeLists2: VNode[]) {
    let yGap: number;
    function compareList(prev: VNode, next: VNode) {
        if (isSimilarBoxWrap(prev.children[0], next.children[0], yGap)) {
            if (_.isNil(yGap)) {
                yGap = next.children[0].bounds.top - prev.children[0].bounds.bottom;
            }
            // 两列文本不考虑做成flexWrap
            if (isTextNode(prev.children[0]) && prev.children.length === 2) {
                return false;
            }
            return {
                yGap
            };
        }
        return false;
    }
    function mergeLists(toMergeLists: VNode[], yGap: number) {
        if (_.isNil(yGap)) {
            unreachable();
        }

        console.debug('找到合并的横向flexWrap列表');
        const children = _.flatMap(toMergeLists, listX => listX.children);

        let vnode = newVNode({
            bounds: getBounds(children),
            children,
            role: ['list-wrap'],
            direction: Direction.Row
        });

        const topNode = _.first(_.last(toMergeLists)!.children)!;
        // 尝试多加一个元素，有的掉车尾的单个元素在最下面
        const lonelyChild = _.find(_.difference(parent.children, children), child =>
            isSimilarBoxWrap(topNode, child, yGap)
        );
        if (lonelyChild) {
            const children2 = [...children, lonelyChild];
            const vnode2 = newVNode({
                bounds: getBounds(children2),
                children: children2,
                role: ['list-wrap'],
                direction: Direction.Row
            });

            if (!checkListInvalid(parent.children, vnode2)) {
                console.debug('找到掉车尾的flexWrap子节点');
                vnode = vnode2;
                removeEle(parent.children, lonelyChild);
            }
        }

        _.each(vnode.children, child => {
            addRole(child, 'list-item');
        });

        setListItemSizeSpec(vnode);

        const xGap = toMergeLists[0].children[1].bounds.left - toMergeLists[0].children[0].bounds.right;
        // flex-wrap应该留出右边的间距，多留两像素保持换行与设计稿一致
        vnode.bounds.right += xGap + 2;
        vnode.bounds.width = vnode.bounds.right - vnode.bounds.left;
        // 下面也要留出margin
        vnode.bounds.bottom += yGap;
        vnode.bounds.height = vnode.bounds.bottom - vnode.bounds.top;

        return vnode;
    }
    const ranges = collectContinualRanges(toMergeLists2, compareList, range => {
        const toMergeLists = toMergeLists2.slice(range.start, range.end);
        const fakeListNode = {
            bounds: getBounds(toMergeLists),
            children: _.flatMap(toMergeLists, list => list.children)
        } as VNode;
        if (checkListInvalid(parent.children, fakeListNode)) {
            return false;
        }
        if (checkListItemUnnecessary(toMergeLists.map(n => n.children[0]))) {
            return false;
        }
        return true;
    });
    return ranges.map(range => {
        const toMergeLists = toMergeLists2.slice(range.start, range.end);
        return {
            combinedListNode: mergeLists(toMergeLists, range.ele.yGap),
            toMergeLists
        };
    });
}

/** 将多个结构一致的列表合成为一个 */
function tryMergeListNodes(parent: VNode, toMergeLists2: VNode[], direction: Direction) {
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

    let mergeAlign: Side;
    function compareList(prev: VNode, next: VNode) {
        if (numEq(getListItemMiddleLineGap(prev), getListItemMiddleLineGap(next))) {
            mergeAlign = 'center';
        } else if (
            direction === Direction.Row &&
            numEq(getListItemStartLineGap(prev), getListItemStartLineGap(next))
        ) {
            mergeAlign = 'start';
        } else if (
            direction === Direction.Row &&
            numEq(getListItemEndLineGap(prev), getListItemEndLineGap(next))
        ) {
            mergeAlign = 'end';
        } else {
            return false;
        }
        return { mergeAlign };
    }

    function mergeLists(toMergeLists: VNode[], mergeAlign: Side) {
        if (_.isNil(mergeAlign)) {
            unreachable();
        }

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
        setListItemSizeSpec(vnode);
        return vnode;
    }

    const ranges = collectContinualRanges(toMergeLists2, compareList, range => {
        const toMergeLists = toMergeLists2.slice(range.start, range.end);
        const fakeListNode = {
            bounds: getBounds(toMergeLists),
            children: _.flatMap(toMergeLists, list => list.children)
        } as VNode;
        if (checkListInvalid(parent.children, fakeListNode)) {
            return false;
        }
        if (checkListItemUnnecessary(toMergeLists.map(n => n.children[0]))) {
            return false;
        }
        return true;
    });
    return ranges.map(range => {
        const toMergeLists = toMergeLists2.slice(range.start, range.end);
        return {
            combinedListNode: mergeLists(toMergeLists, range.ele.mergeAlign),
            toMergeLists
        };
    });
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

    if (direction === Direction.Row) {
        function getListItemGap(vnode: VNode) {
            return getItemGap(vnode.children[0], vnode.children[1], direction);
        }
        // gap为0的不太可能是flexWrap，反而可能是表格
        const validFlexWrapLists = addPlainListNodes.filter(list => numGt(getListItemGap(list), 0));
        const flexWrapGroups = Array.from(
            groupWith(validFlexWrapLists, (a, b) => {
                return numEq(a.bounds.left, b.bounds.left) && numEq(getListItemGap(a), getListItemGap(b));
            }).values()
        ).filter(nodes => nodes.length > 1);

        for (const flexWrapGroup of flexWrapGroups) {
            const mergedInfos = tryMergeFlexWrapNodes(vnode, flexWrapGroup);
            mergedInfos.forEach(info => {
                removeEles(addPlainListNodes, info.toMergeLists);
                addCombinedListNodes.push(info.combinedListNode);
            });
        }
    }

    function twoListAlign(a: VNode, b: VNode) {
        const comboList = _.zip(a.children, b.children).map(([a, b]) => {
            return {
                bounds: getBounds([a!, b!])
            };
        });
        return pairPrevNext(comboList).every(([prev, next]) => !isOverlapping(prev, next));
    }
    const listGroups = Array.from(
        groupWith(addPlainListNodes, (a, b) => {
            return a.children.length === b.children.length && twoListAlign(a, b);
        }).values()
    ).filter(nodes => nodes.length > 1);

    for (const listGroup of listGroups) {
        const mergedInfos = tryMergeListNodes(vnode, listGroup, direction);
        mergedInfos.forEach(info => {
            removeEles(addPlainListNodes, info.toMergeLists);
            addCombinedListNodes.push(info.combinedListNode);
        });
    }

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
        setListItemSizeSpec(list);
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
    if (!vnode.children.length) return;

    if (isTableBody(vnode) || isTableRow(vnode)) {
        return;
    }

    // 先找横向列表，横向的可能有flexWrap
    buildListDirection(vnode, Direction.Row);

    buildListDirection(vnode, Direction.Column);
}
