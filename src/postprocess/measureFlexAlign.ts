import * as _ from 'lodash';
import { defaultConfig } from '../config';
import { assert, groupByWith, numEq, unreachable } from '../utils';
import {
    Dimension,
    DimensionSpec,
    Direction,
    R,
    SizeSpec,
    VNode,
    context,
    getClassName,
    isFlexBox,
    isFlexWrapLike,
    isListContainer,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    isMultiLineText,
    isSingleLineText,
    isTextNode
} from '../vnode';
import { checkChildSizeOverHalf } from './measureParentSizeSpec';

interface Margin {
    marginStart: number;
    marginEnd: number;
    marginDiff: number;
}

/** 重新决定子元素的尺寸 */
function decideChildrenAlignSpec(parent: VNode, alignSpec: DimensionSpec, alignDimension: Dimension) {
    // auto元素是否能被截断
    function autoMaybeClamp(child: VNode) {
        return (
            isSingleLineText(child) ||
            (alignSpec === 'widthSpec' && isListXContainer(child)) ||
            (alignSpec === 'heightSpec' && isListYContainer(child)) ||
            (alignSpec === 'heightSpec' && isFlexWrapLike(child))
        );
    }

    _.each(parent.children, child => {
        if (child[alignSpec] === SizeSpec.Auto) {
            if (!autoMaybeClamp(child)) {
                if (isFlexWrapLike(child)) {
                    assert(alignSpec === 'widthSpec', 'flexWrap和多行文本只有横向才能不被截断');
                    if (parent[alignSpec] === SizeSpec.Auto) {
                        console.debug(
                            '多行元素想撑开,父元素又是auto,光设置父亲最小宽度没用,还得设置多行元素的宽度,不然没法换行'
                        );
                        // 这里也可以用最大宽度，但是没什么用
                        child[alignSpec] = SizeSpec.Fixed;
                    } else {
                        child[alignSpec] = SizeSpec.Constrained;
                    }
                } else if (checkChildSizeOverHalf(child, parent, alignDimension)) {
                    child[alignSpec] = SizeSpec.Constrained;
                }
            }
        } else if (!child[alignSpec]) {
            assert(!child.children.length, '只有裸盒子才没设置尺寸');
            if (checkChildSizeOverHalf(child, parent, alignDimension)) {
                child[alignSpec] = SizeSpec.Constrained;
            } else {
                child[alignSpec] = SizeSpec.Fixed;
            }
        }
    });
}

/** 设置父元素的最小尺寸 */
function decideParentMinSize(parent: VNode, alignSpec: DimensionSpec, alignDimension: Dimension) {
    // 这种情况下给个最小尺寸, 根节点高度已经有最小尺寸了
    if (parent[alignSpec] === SizeSpec.Auto && parent !== context.root) {
        parent.classList.push(R`min-${alignDimension.substring(0, 1)}-${parent.bounds[alignDimension]}`);
    }
}

/** 开始设置align属性 */
function setFlexAlign(
    parentAlign: string,
    {
        parent,
        alignSpec,
        alignDimension,
        margins,
        s,
        e
    }: {
        parent: VNode;
        alignSpec: DimensionSpec;
        alignDimension: Dimension;
        margins: Margin[];
        s: string;
        e: string;
    }
) {
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
            if (isFlexWrapLike(child)) {
                assert(alignSpec === 'heightSpec', '多行元素只有纵向需自动撑开');
                console.debug('多行元素只能靠上');
                child.classList.push(mayNeedAlign('start'));
                child.classList.push(R`m${s}-${margin.marginStart}`);
                return;
            }
            child.classList.push(mayNeedAlign('end'));
            child.classList.push(R`m${e}-${margin.marginEnd}`);
        }
    }

    function setConstrainedAlign(child: VNode, margin: Margin) {
        child.classList.push(mayNeedAlign('stretch'));
        child.classList.push(R`m${s}-${margin.marginStart} m${e}-${margin.marginEnd}`);
    }

    if (parentAlign !== 'stretch') {
        parent.classList.push(`items-${parentAlign}`);
    }

    _.each(parent.children, (child, i) => {
        const margin = margins[i];
        if (child[alignSpec] === SizeSpec.Fixed) {
            setFixOrAutoAlign(child, margin);
        } else if (child[alignSpec] === SizeSpec.Constrained) {
            setConstrainedAlign(child, margin);
        } else if (child[alignSpec] === SizeSpec.Auto) {
            setFixOrAutoAlign(child, margin);
            // TODO: 处理auto元素的最大宽度
            if (defaultConfig.codeGenOptions.textClamp && isTextNode(child)) {
                setTextClamp(child, parent, alignDimension, margin);
            }
            if (defaultConfig.codeGenOptions.listOverflowAuto && isListContainer(child)) {
                setListOverflowAuto(child, parent, alignDimension, margin);
            }
            if (parent[alignSpec] === SizeSpec.Auto && defaultConfig.codeGenOptions.overflowMargin) {
                if (defaultConfig.codeGenOptions.textClamp && isTextNode(child)) {
                    // 已经预留过了
                    return;
                }
                if (defaultConfig.codeGenOptions.listOverflowAuto && isListContainer(child)) {
                    // 已经预留过了
                    return;
                }
                setAutoPreserveMargin(child, alignDimension, margin);
            }
        } else {
            unreachable();
        }
    });
}

/** 可能居中 */
function possibleAlignCenter(margin: Margin) {
    return numEq(margin.marginStart, margin.marginEnd);
}

/** 获取超过一半的元素的共同margin */
function getCommonMarginOverHalf(margins: Margin[], key: keyof Margin) {
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

/** 生成align-items */
export function measureFlexAlign(parent: VNode) {
    const sf = parent.direction === Direction.Row ? 'top' : 'left';
    const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
    const s = sf[0];
    const e = ef[0];
    const alignSpec = parent.direction === Direction.Row ? 'heightSpec' : 'widthSpec';
    const alignDimension = parent.direction === Direction.Row ? 'height' : 'width';

    decideChildrenAlignSpec(parent, alignSpec, alignDimension);
    decideParentMinSize(parent, alignSpec, alignDimension);

    // 据children在node中的位置计算flex对齐方式
    const margins: Margin[] = parent.children.map(n => {
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
        };
    });

    const extra = {
        parent,
        alignSpec,
        alignDimension,
        margins,
        s,
        e
    } as const;

    // 优先视觉上居中的元素，只要有且不是全部，就干脆子元素单独设置align
    if (_.filter(margins, possibleAlignCenter).length !== margins.length) {
        setFlexAlign('stretch', extra);
        return;
    }

    // 归组, 看哪种对齐方式最多
    const [commonMarginStartCount, commonMarginStart] = getCommonMarginOverHalf(margins, 'marginStart');
    const [commonMarginEndCount, commonMarginEnd] = getCommonMarginOverHalf(margins, 'marginEnd');
    const [commonMarginDiffCount, commonMarginDiff] = getCommonMarginOverHalf(margins, 'marginDiff');
    const maxCommonMarginCount = Math.max(
        commonMarginStartCount,
        commonMarginEndCount,
        commonMarginDiffCount
    );

    if (maxCommonMarginCount <= 1) {
        setFlexAlign('stretch', extra);
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

        setFlexAlign('center', extra);
    } else if (maxCommonMarginCount === commonMarginStartCount) {
        // 只有在共同左边距是最小左边距时，我们才加padding，因为我们不想有负的margin
        if (!numEq(commonMarginStart, 0) && _.min(margins.map(m => m.marginStart)) === commonMarginStart) {
            parent.classList.push(`p${s}-${commonMarginStart}`);
            margins.forEach(margin => {
                margin.marginStart -= commonMarginStart;
                margin.marginDiff -= commonMarginStart;
            });
        }

        setFlexAlign('start', extra);
    } else if (maxCommonMarginCount === commonMarginEndCount) {
        // 只有在共同右边距是最小右边距时，我们才加padding，因为我们不想有负的margin
        if (!numEq(commonMarginEnd, 0) && _.min(margins.map(m => m.marginEnd)) === commonMarginEnd) {
            parent.classList.push(`p${s}-${commonMarginEnd}`);
            margins.forEach(margin => {
                margin.marginStart -= commonMarginEnd;
                margin.marginDiff += commonMarginEnd;
            });
        }

        setFlexAlign('end', extra);
    } else {
        setFlexAlign('stretch', extra);
    }
}

/** 单行文本超出，两边最少预留多宽，默认一个字宽 */
function getSingleLinePreserveMargin(textVNode: VNode) {
    return textVNode.bounds.height;
}

/** 多行文本超出，下面最少预留多宽，默认一个字宽 */
function getMultiLineTextLineHeight(textVNode: VNode) {
    const firstSpan = (textVNode.textContent as VNode[])[0];
    const match = getClassName(firstSpan).match(/text-\d+\/(\d+)/);
    assert(!_.isNull(match), '多行元素找不到行高');
    const lineHeight = _.toNumber(match![1]);
    return lineHeight;
}

function setTextClamp(child: VNode, parent: VNode, alignDimension: Dimension, margin: Margin) {
    if (isSingleLineText(child)) {
        assert(alignDimension === 'width', '单行文本超出省略只能是横向');
        const parentWidth = parent.bounds.width;
        let maxWidth: number;
        const marginPreserve = getSingleLinePreserveMargin(child);
        if (possibleAlignCenter(margin)) {
            const bothMargin = Math.min(marginPreserve, margin.marginStart);
            child.classList.push(R`mx-${bothMargin}`);
            maxWidth = parentWidth - 2 * bothMargin;
        } else if (margin.marginStart < margin.marginEnd) {
            const leftMargin = margin.marginStart;
            const rightMargin = Math.min(marginPreserve, leftMargin);
            child.classList.push(R`mr-${rightMargin}`);
            maxWidth = parentWidth - leftMargin - rightMargin;
        } else {
            const rightMargin = margin.marginEnd;
            const leftMargin = Math.min(marginPreserve, rightMargin);
            child.classList.push(R`ml-${leftMargin}`);
            maxWidth = parentWidth - leftMargin - rightMargin;
        }
        // whitespace-nowrap已经全局设置
        child.classList.push(R`max-w-${maxWidth} text-ellipsis overflow-hidden`);
    } else if (isMultiLineText(child)) {
        assert(alignDimension === 'height', '多行文本超出省略只能是纵向');
        const parentHeight = parent.bounds.height;
        const lineHeight = getMultiLineTextLineHeight(child);
        let topMargin = margin.marginStart;
        if (possibleAlignCenter(margin)) {
            topMargin = Math.min(lineHeight, topMargin);
        }
        const bottomMargin = Math.min(lineHeight, margin.marginEnd);
        const maxHeight = parentHeight - topMargin - bottomMargin;
        const maxLineCount = Math.floor(maxHeight / lineHeight);
        _.assign(child.style, {
            display: '-webkit-box',
            '-webkit-box-orient': 'vertical',
            overflow: 'hidden',
            '-webkit-line-clamp': maxLineCount
        });
    }
}

/** 为自动撑开的元素预留一点边距 */
function setAutoPreserveMargin(child: VNode, alignDimension: Dimension, margin: Margin) {
    if (isSingleLineText(child)) {
        assert(alignDimension === 'width', '单行文本预留空间只能是横向');
        const marginPreserve = getSingleLinePreserveMargin(child);
        if (possibleAlignCenter(margin)) {
            const bothMargin = Math.min(marginPreserve, margin.marginStart);
            child.classList.push(R`mx-${bothMargin}`);
        } else if (margin.marginStart < margin.marginEnd) {
            const leftMargin = margin.marginStart;
            const rightMargin = Math.min(marginPreserve, leftMargin);
            child.classList.push(R`mr-${rightMargin}`);
        } else {
            const rightMargin = margin.marginEnd;
            const leftMargin = Math.min(marginPreserve, rightMargin);
            child.classList.push(R`ml-${leftMargin}`);
        }
    } else if (isMultiLineText(child)) {
        assert(alignDimension === 'height', '多行文本预留空间只能是纵向');
        const lineHeight = getMultiLineTextLineHeight(child);
        const bottomMargin = Math.min(lineHeight, margin.marginEnd);
        child.classList.push(R`mb-${bottomMargin}`);
        if (possibleAlignCenter(margin)) {
            const topMargin = Math.min(lineHeight, margin.marginStart);
            child.classList.push(R`mt-${topMargin}`);
        }
    } else if (isListWrapContainer(child)) {
        assert(alignDimension === 'height', 'flexWrap预留空间只能是纵向');
        const marginPreserve = 10; // 先给10吧
        const bottomMargin = Math.min(marginPreserve, margin.marginEnd);
        child.classList.push(R`mb-${bottomMargin}`);
        if (possibleAlignCenter(margin)) {
            const topMargin = Math.min(marginPreserve, margin.marginStart);
            child.classList.push(R`mt-${topMargin}`);
        }
    } else {
        assert(isFlexBox(child), '只有flex盒子才能预留空间');
        const marginPreserve = 10; // 先给10吧
        if (possibleAlignCenter(margin)) {
            const bothMargin = Math.min(marginPreserve, margin.marginStart);
            child.classList.push(R`m${alignDimension === 'width' ? 'x' : 'y'}-${bothMargin}`);
        } else if (margin.marginStart < margin.marginEnd) {
            const startMargin = margin.marginStart;
            const endMargin = Math.min(marginPreserve, startMargin);
            child.classList.push(R`m${alignDimension === 'width' ? 'r' : 'b'}-${endMargin}`);
        } else {
            const endMargin = margin.marginEnd;
            const startMargin = Math.min(marginPreserve, endMargin);
            child.classList.push(R`m${alignDimension === 'width' ? 'l' : 't'}-${startMargin}`);
        }
    }
}

/** 处理auto元素内容超出，这里不能过度设置，免得生成很多class，应该检测一下 */
function setListOverflowAuto(child: VNode, parent: VNode, alignDimension: Dimension, margin: Margin) {
    // 文本节点
    if (isListXContainer(child) || isListYContainer(child)) {
        let maxSize: number;
        const parentSize = parent.bounds[alignDimension];
        const marginPreserve = 10;
        if (isListXContainer(child)) {
            assert(alignDimension === 'width', '横向列表超出滚动只能是横向');
        } else {
            assert(alignDimension === 'height', '纵向列表超出滚动只能是纵向');
        }
        if (possibleAlignCenter(margin)) {
            const bothMargin = Math.min(marginPreserve, margin.marginStart);
            child.classList.push(R`m${alignDimension === 'width' ? 'x' : 'y'}-${bothMargin}`);
            maxSize = parentSize - 2 * bothMargin;
        } else if (margin.marginStart < margin.marginEnd) {
            const startMargin = margin.marginStart;
            const endMargin = Math.min(marginPreserve, startMargin);
            child.classList.push(R`m${alignDimension === 'width' ? 'r' : 'b'}-${endMargin}`);
            maxSize = parentSize - startMargin - endMargin;
        } else {
            const endMargin = margin.marginEnd;
            const startMargin = Math.min(marginPreserve, endMargin);
            child.classList.push(R`m${alignDimension === 'width' ? 'l' : 't'}-${startMargin}`);
            maxSize = parentSize - startMargin - endMargin;
        }
        // whitespace-nowrap已经全局设置
        child.classList.push(
            R`max-${alignDimension.slice(0, 1)}-${maxSize} overflow-${alignDimension === 'width' ? 'x' : 'y'}-auto`
        );
        // TODO: 是否可以给一个utility-class，child:shrink-0
        _.each(child.children, son => {
            son.classList.push('shrink-0');
        });
    } else {
        assert(isListWrapContainer(child) && alignDimension === 'height', 'flexWrap只有纵向才能超出滚动');
        const marginPreserve = 10; // 先给10吧
        const parentHeight = child.bounds.height;
        const bottomMargin = Math.min(marginPreserve, margin.marginEnd);
        child.classList.push(R`mb-${bottomMargin}`);
        let topMargin = margin.marginStart;
        if (possibleAlignCenter(margin)) {
            topMargin = Math.min(marginPreserve, topMargin);
            child.classList.push(R`mt-${topMargin}`);
        }
        const maxHeight = parentHeight - topMargin - bottomMargin;
        child.classList.push(R`max-h-${maxHeight} overflow-y-auto`);
    }
}

// /** 处理auto元素内容居中，仅横向 */
// function setAutoContentsAlign(vnode: VNode, side: 'center' | 'start' | 'end') {
//     if (isTextNode(vnode)) {
//         const sideMap = {
//             center: 'center',
//             start: 'left',
//             end: 'right'
//         };
//         if (!anyElesIn(getClassList(vnode), ['text-left', 'text-center', 'text-right'])) {
//             vnode.classList.push(`text-${sideMap[side]}`);
//         }
//     } else {
//         vnode.classList.push(`justify-${side}`);
//     }
// }

// /** 扩充auto元素的尺寸，并保持内部元素撑开方向 */
// function expandAutoContents(child: VNode, margin: Margin) {
//     // TODO: 这里只是粗暴的计算撑开方向，
//     // 实际情况可能不是哪边预留空间多就往哪边撑，比如背景是个图
//     // 根据策略来扩充
//     const allocSpaceForAuto = defaultConfig.allocSpaceForAuto;

//     if (
//         // 这两种容器横向没法自由撑开, 可以优化判断下，横向只能可以往右撑开
//         // 竖向撑开的做法也不一样 align-content/多行文本包一个div然后用flex居中等
//         isFlexWrapLike(child)
//     ) {
//         if (alignSpec === 'widthSpec') {
//             // 只能处理往右撑开的
//             if (parent[alignSpec] === SizeSpec.Auto) {
//                 changeChildSizeSpec(child, alignSpec, SizeSpec.Auto, SizeSpec.Fixed);
//                 setFixOrAutoAlign(child, margin);
//                 return true;
//             }
//             return;
//         }

//         if (isListWrapContainer(child)) {
//             // 保留auto元素的位置
//             if (possibleAlignCenter(margin)) {
//                 // 往两边撑开
//                 child.classList.push('content-center');
//             } else if (margin.marginStart < margin.marginEnd) {
//                 // 往下边撑开
//                 child.classList.push('content-start');
//             } else {
//                 // 往上边撑开
//                 child.classList.push('content-end');
//             }
//         } else if (isMultiLineText(child)) {
//             // 用一个子元素包起来
//             child.textContent = [newVNode(_.cloneDeep(child))];
//             child.classList.push('flex');

//             // 保留auto元素的位置
//             if (possibleAlignCenter(margin)) {
//                 // 往两边撑开
//                 child.classList.push('items-center');
//             } else if (margin.marginStart < margin.marginEnd) {
//                 // 往下边撑开
//                 child.classList.push('items-start');
//             } else {
//                 // 往上边撑开
//                 child.classList.push('items-end');
//             }
//         }
//     } else {
//         // 保留auto元素的位置
//         if (possibleAlignCenter(margin)) {
//             // 往两边撑开
//             setAutoContentsAlign(child, 'center');
//         } else if (margin.marginStart < margin.marginEnd) {
//             // 靠左边撑开
//             setAutoContentsAlign(child, 'start');
//         } else {
//             // 靠右边撑开
//             setAutoContentsAlign(child, 'end');
//         }
//     }

//     // Auto元素需要自动撑开
//     const realMargin = Math.min(margin.marginEnd, margin.marginStart);
//     margin.marginStart = margin.marginEnd = realMargin;

//     child.bounds[sf] = parent.bounds[sf] + realMargin;
//     child.bounds[ef] = parent.bounds[ef] - realMargin;
//     child.bounds[alignDimension] = child.bounds[ef] - child.bounds[sf];
// }
