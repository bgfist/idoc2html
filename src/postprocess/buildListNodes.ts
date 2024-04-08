import * as _ from 'lodash';
import {
    assert,
    collectContinualRanges,
    groupWith,
    numEq,
    numGt,
    numGte,
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
    VNodeBounds,
    addRole,
    getBounds,
    getTextFZLH,
    getMiddleLine,
    getTextAlign,
    isContainedWithin,
    isListItemWrapped,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    isOverlapping,
    isTableBody,
    isTableRow,
    isTextNode,
    newVNode,
    refreshBoxBounds,
    maySetTextAlign
} from '../vnode';
import { defaultConfig } from '../main/config';

/** 两个盒子是否相似 */
function isSimilarBoxX(a: VNode, b: VNode) {
    if (isTextNode(a) && isTextNode(b) && numEq(a.bounds.top, b.bounds.top)) {
        a = _.isArray(a.textContent) ? a.textContent[0] : a;
        b = _.isArray(b.textContent) ? b.textContent[0] : b;
        return _.isEqual(getTextFZLH(a), getTextFZLH(b));
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
    if (isTextNode(a) && isTextNode(b) && getTextAlign(a) === getTextAlign(b)) {
        return (
            numEq(a.bounds.right, b.bounds.right) ||
            numEq(a.bounds.left, b.bounds.left) ||
            numEq(getMiddleLine(a, Direction.Row), getMiddleLine(b, Direction.Row))
        );
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

function twoListAlign(a: VNode, b: VNode) {
    const comboList = _.zip(a.children, b.children).map(([a, b]) => {
        return {
            bounds: getBounds([a!, b!])
        };
    });
    return pairPrevNext(comboList).every(([prev, next]) => !isOverlapping(prev, next));
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
function checkListInvalid(otherNodes: VNode[], list: VNode, validBounds?: VNodeBounds) {
    otherNodes = _.difference(otherNodes, getOriginalListItemNodes(list));
    const listBound = validBounds ?? list;
    return _.some(otherNodes, node => isOverlapping(listBound, node) && !isContainedWithin(listBound, node));
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

/** 给文本list-item设置同样的尺寸大小和同样的间距 */
function setListTextItemSameSizeAndGap(textNodes: VNode[], textAlign: Side) {
    assert(isTextNode(textNodes[0]), '只有文本节点需要保持一致的宽度');

    const maxWidth = _.max(textNodes.map(item => item.bounds.width))!;
    _.each(textNodes, item => {
        item.bounds.width = maxWidth;
        if (textAlign === 'center') {
            item.bounds.left -= Math.round((maxWidth - item.bounds.width) / 2);
            item.bounds.right = item.bounds.left + maxWidth;
            maySetTextAlign(item, 'center');
        } else if (textAlign === 'start') {
            item.bounds.right = item.bounds.left + maxWidth;
        } else if (textAlign === 'end') {
            item.bounds.left = item.bounds.right - maxWidth;
            maySetTextAlign(item, 'right');
        }
    });
}

/** 寻找重复节点，将其归成列表 */
function groupListNodes(parent: VNode, nodes: VNode[], direction: Direction) {
    type CompareType = 'gap' | Side;
    function getCompareNum(type: CompareType, prev: VNode, next: VNode) {
        if (type === 'gap') {
            return getItemGap(prev, next, direction);
        } else if (type === 'start') {
            return next.bounds.left - prev.bounds.left;
        } else if (type === 'end') {
            return next.bounds.right - prev.bounds.right;
        } else if (type === 'center') {
            return getMiddleLine(next, Direction.Row) - getMiddleLine(prev, Direction.Row);
        }
        unreachable();
    }
    const isTextCompare = isTextNode(nodes[0]);
    const isTextCompareColumn = isTextCompare && direction === Direction.Column;

    let compareContext: Array<{ type: CompareType; num: number }> | null = null;
    function compareNode(prev: VNode, next: VNode) {
        if (!compareContext) {
            if (isTextCompare) {
                compareContext = [
                    {
                        type: 'gap',
                        num: getCompareNum('gap', prev, next)
                    }
                ];

                if (getTextAlign(prev) === 'center') {
                    compareContext.push({
                        type: 'center',
                        num: getCompareNum('center', prev, next)
                    });
                } else if (getTextAlign(prev) === 'right') {
                    compareContext.push({
                        type: 'end',
                        num: getCompareNum('end', prev, next)
                    });
                } else {
                    compareContext.push(
                        {
                            type: 'start',
                            num: getCompareNum('start', prev, next)
                        },
                        {
                            type: 'center',
                            num: getCompareNum('center', prev, next)
                        },
                        {
                            type: 'end',
                            num: getCompareNum('end', prev, next)
                        }
                    );
                }
                // 竖向文本列表需要靠一边对齐
                if (isTextCompareColumn) {
                    compareContext = compareContext.filter(item => item.type === 'gap' || numEq(item.num, 0));
                }
            } else {
                compareContext = [
                    {
                        type: 'gap',
                        num: getCompareNum('gap', prev, next)
                    }
                ];
            }
            return compareContext;
        }

        if (!compareContext.length) {
            return false;
        }
        // 竖向文本列表需要靠一边对齐, 且上下间距相等
        if (isTextCompareColumn && (compareContext.length < 2 || compareContext[0].type !== 'gap')) {
            return false;
        }

        compareContext = compareContext.filter(item => numEq(item.num, getCompareNum(item.type, prev, next)));
        return compareContext;
    }

    const ranges = collectContinualRanges(nodes, compareNode, _.constant(true));

    return ranges.map(range => {
        const compareContext = range.ele;
        const listItems = nodes.slice(range.start, range.end);

        if (isTextCompareColumn) {
            setListTextItemSameSizeAndGap(listItems, compareContext[1].type as Side);
        } else if (compareContext[0].type !== 'gap') {
            setListTextItemSameSizeAndGap(listItems, compareContext[0].type);
        }

        return newVNode({
            bounds: getBounds(listItems),
            children: listItems
        });
    });
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
    function mergeLists(toMergeLists: VNode[]) {
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
        setListItemSizeSpec(vnode);
        return vnode;
    }

    const ranges = collectContinualRanges(toMergeLists2, _.constant(true), range => {
        const toMergeLists = toMergeLists2.slice(range.start, range.end);
        const fakeListNode = {
            bounds: getBounds(toMergeLists),
            children: _.flatMap(toMergeLists, list => list.children)
        } as VNode;
        if (checkListInvalid(parent.children, fakeListNode)) {
            return false;
        }
        return true;
    });
    return ranges.map(range => {
        const toMergeLists = toMergeLists2.slice(range.start, range.end);
        return {
            combinedListNode: mergeLists(toMergeLists),
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
        const tables = maybeTable(vnode, lines);
        tables.forEach(table => {
            removeEles(lines, table.tableRows);
            removeEles(vnode.children, _.flatten(table.tableRows));
            vnode.children.push(table.tableBody);
        });
    }

    lines = lines.map(line => groupListNodes(vnode, line, direction));
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
        const firstChild = _.first(list.children)!;
        const lastChild = _.last(list.children)!;
        const bounds = _.clone(list.bounds);
        if (direction === Direction.Row) {
            bounds.left += firstChild.bounds.width / 2;
            bounds.right -= lastChild.bounds.width / 2;
        } else {
            bounds.top += firstChild.bounds.height / 2;
            bounds.bottom -= lastChild.bounds.height / 2;
        }
        const validBounds = { bounds };

        return (
            (!isListItemWrapped(list.children[0]) && list.children.length === 2) ||
            checkListInvalid(vnode.children, list, validBounds)
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

/** 判断是否是表格布局 */
function maybeTable(parent: VNode, rows: VNode[][]) {
    const ranges = collectContinualRanges(
        rows,
        (rowA, rowB) => {
            const listA = newVNode({
                bounds: getBounds(rowA),
                children: rowA
            });
            const listB = newVNode({
                bounds: getBounds(rowB),
                children: rowB
            });
            return (
                rowA.length >= 3 &&
                rowA.length === rowB.length &&
                twoListAlign(listA, listB) &&
                numGte(listB.bounds.top - listA.bounds.bottom, 0) &&
                _.every(rowA, isTextNode)
            );
        },
        range => {
            if (range.end - range.start >= 3) {
                const fakeListItems = _.flatten(rows.slice(range.start, range.end));
                const fakeListNode = newVNode({
                    bounds: getBounds(fakeListItems),
                    children: fakeListItems
                });
                return !checkListInvalid(parent.children, fakeListNode);
            }
            return false;
        }
    );

    return ranges.map(range => {
        console.debug('找到表格');
        const tableRows = rows.slice(range.start, range.end);
        const listItems = tableRows.map(tableRow => {
            return newVNode({
                role: ['table-row'],
                children: tableRow,
                bounds: getBounds(tableRow)
            });
        });
        return {
            tableRows,
            tableBody: newVNode({
                role: ['table-body'],
                children: listItems,
                bounds: getBounds(listItems),
                direction: Direction.Column,
                heightSpec: SizeSpec.Auto
            })
        };
    });
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
