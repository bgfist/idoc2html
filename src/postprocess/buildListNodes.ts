import * as _ from 'lodash';
import {
    assert,
    collectContinualRanges,
    collectLongestRepeatRanges,
    float2Int,
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
    maySetTextAlign,
    isSingleLineText,
    isMultiLineTextBr,
    refreshBoxBounds
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
        a = _.isArray(a.textContent) ? a.textContent[0] : a;
        b = _.isArray(b.textContent) ? b.textContent[0] : b;
        return (
            _.isEqual(getTextFZLH(a), getTextFZLH(b)) &&
            (numEq(a.bounds.right, b.bounds.right) ||
                numEq(a.bounds.left, b.bounds.left) ||
                numEq(getMiddleLine(a, Direction.Row), getMiddleLine(b, Direction.Row)))
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
    let targetSizeSpec =
        defaultConfig.codeGenOptions.listItemSizeFixed ? SizeSpec.Fixed : SizeSpec.Constrained;

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
            if (defaultConfig.codeGenOptions.listItemSizeFixed) {
                item.heightSpec = SizeSpec.Fixed;
            }
        });
    }
}

/** 给文本list-item设置同样的尺寸大小和同样的间距 */
function setListTextItemSameSizeAndGap(textNodes: VNode[], textAlign: Side, maxWidth = 0) {
    assert(isTextNode(textNodes[0]), '只有文本节点需要保持一致的宽度');

    if (!maxWidth) {
        maxWidth = _.max(textNodes.map(item => item.bounds.width))!;
    } else {
        maxWidth -= float2Int(getTextFZLH(textNodes[0]).fontSize);
    }

    _.each(textNodes, item => {
        item.bounds.width = maxWidth;
        item.widthSpec = SizeSpec.Fixed;
        if (textAlign === 'center') {
            item.bounds.left -= float2Int((maxWidth - item.bounds.width) / 2);
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
function groupListNodes(parent: VNode, nodes: VNode[], direction: Direction, longest: boolean) {
    const gaps = pairPrevNext(nodes).map(([prev, next]) => getItemGap(prev, next, direction));
    gaps.push(NaN); // 最后多一个gap作为比较
    const ranges = collectLongestRepeatRanges(gaps, numEq, longest ? Infinity : 2, true);

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

/** 寻找重复节点，将其归成列表 */
function groupTextListNodes(parent: VNode, nodes: VNode[], direction: Direction) {
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

    if (!isTextCompare) {
        return [];
    }

    const isTextCompareColumn = isTextCompare && direction === Direction.Column;

    function compareNode(
        prev: VNode,
        next: VNode,
        compareContext?: Array<{ type: CompareType; num: number }>
    ) {
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
                    compareContext = compareContext.filter(
                        item => item.type === 'gap' || Math.abs(item.num) <= 1
                    );
                    if (compareContext.length < 2) {
                        return false;
                    }
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

        const compareContext2 = compareContext.filter(item =>
            numEq(item.num, getCompareNum(item.type, prev, next))
        );

        if (!compareContext2.length) {
            return false;
        }

        // 竖向文本列表需要靠一边对齐, 且上下间距相等
        if (isTextCompareColumn && (compareContext2.length < 2 || compareContext2[0].type !== 'gap')) {
            return false;
        }

        compareContext.length = 0;
        compareContext.push(...compareContext2);
        return true;
    }

    const ranges = collectContinualRanges(nodes, compareNode, _.constant(true));

    return ranges.map(range => {
        const compareContext = range.ele;
        const listItems = nodes.slice(range.start, range.end);

        const vnode = newVNode({
            bounds: getBounds(listItems),
            children: listItems
        });

        if (isTextCompareColumn) {
            vnode.__temp.textListAlign = {
                type: compareContext[1].type as Side,
                num: compareContext[1].num
            };
        } else if (compareContext[0].type !== 'gap') {
            vnode.__temp.textListAlign = {
                type: compareContext[0].type,
                num: compareContext[0].num
            };
        }

        return vnode;
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

        // TODO: 应该往两边占满间隙
        toMergeLists.forEach(listItem => {
            if (
                listItem.__temp.textListAlign &&
                (isSingleLineText(listItem.children[0]) || isMultiLineTextBr(listItem.children[0]))
            ) {
                if (direction === Direction.Row && !checkListInvalid(parent.children, listItem)) {
                    setListTextItemSameSizeAndGap(
                        listItem.children,
                        listItem.__temp.textListAlign.type,
                        listItem.__temp.textListAlign.num
                    );
                } else if (direction === Direction.Column) {
                    setListTextItemSameSizeAndGap(listItem.children, listItem.__temp.textListAlign.type);
                }
            }
        });

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

    const ranges = collectContinualRanges(
        toMergeLists2,
        direction === Direction.Row ?
            _.constant(true)
        :   (a, b) => {
                // 纵向只能横着合并，不然会过度包装成纵向列表
                return !isOverlapping(a, b);
            },
        range => {
            const toMergeLists = toMergeLists2.slice(range.start, range.end);
            const fakeListNode = {
                bounds: getBounds(toMergeLists),
                children: _.flatMap(toMergeLists, list => list.children)
            } as VNode;
            if (checkListInvalid(parent.children, fakeListNode)) {
                return false;
            }
            // 全部都是文本
            if (direction === Direction.Row && _.every(toMergeLists, list => isTextNode(list.children[0]))) {
                return false;
            }
            return true;
        }
    );
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

    lines = lines.map(line => {
        if (isTextNode(line[0])) {
            return groupTextListNodes(vnode, line, direction);
        }
        return groupListNodes(vnode, line, direction, false);
    });
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
        if (
            list.__temp.textListAlign &&
            (isSingleLineText(list.children[0]) || isMultiLineTextBr(list.children[0]))
        ) {
            if (direction === Direction.Row) {
                setListTextItemSameSizeAndGap(
                    list.children,
                    list.__temp.textListAlign.type,
                    list.__temp.textListAlign.num
                );
            } else if (direction === Direction.Column) {
                setListTextItemSameSizeAndGap(list.children, list.__temp.textListAlign.type);
            }
        }
        refreshBoxBounds(list);
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
                _.every(rowA, isTextNode) &&
                _.every(rowB, isTextNode)
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
