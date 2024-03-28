import * as _ from 'lodash';
import { defaultConfig } from '../config';
import { assert, numEq, numGt, numLt, unreachable } from '../utils';
import {
    Dimension,
    DimensionSpec,
    Direction,
    R,
    Side,
    SizeSpec,
    VNode,
    context,
    getMultiLineTextLineHeight,
    isCrossDirection,
    isFlexBox,
    isFlexWrapLike,
    isGeneratedNode,
    isListContainer,
    isListWrapContainer,
    isMultiLineText,
    isSingleLineText
} from '../vnode';
import { canChildStretchWithParent } from './measureParentSizeSpec';
import { autoMaybeClamp, getSingleLinePreserveMargin, expandOverflowChild } from './measureOverflow';

interface Margin {
    marginStart: number;
    marginEnd: number;
    marginDiff: number;
}

/** 生成align-items */
export function measureFlexAlign(parent: VNode) {
    const alignSpec = parent.direction === Direction.Row ? 'heightSpec' : 'widthSpec';
    const alignDimension = parent.direction === Direction.Row ? 'height' : 'width';

    expandGhostChildrenIfPossible(parent, alignSpec);
    decideChildrenAlignSpec(parent, alignSpec, alignDimension);
    expandOverflowChildrenIfPossible(parent, alignSpec, alignDimension);
    decideParentAlignSpec(parent, alignSpec, alignDimension);

    // TODO: 如果背景不是图片的话，则单纯看视觉上元素靠哪边
    // 否则，可能还是以前的算法好. 我们这里谨慎使用padding
    const parentAlign = getParentAlign(parent, alignSpec);
    const remainMargins = setCommonPadding(parent, parentAlign, alignSpec);
    // TODO: 父元素尺寸固定且子元素尺寸也都固定且margin都为0，此时不用align
    const specialStretch =
        parent[alignSpec] === SizeSpec.Fixed &&
        _.every(parent.children, child => child[alignSpec] === SizeSpec.Fixed) &&
        _.every(remainMargins, margin => margin.marginStart === 0 && margin.marginEnd === 0);
    if (!specialStretch) {
        setFlexAlign(parentAlign, parent, alignSpec, remainMargins);
    }
    setAutoPreserveMarginIfNeeded(parent, alignSpec, alignDimension, remainMargins);
}

/** 扩大我们自己切的虚拟flex盒子 */
function expandGhostChildrenIfPossible(parent: VNode, alignSpec: DimensionSpec) {
    _.each(parent.children, (child, i) => {
        if (
            isGeneratedNode(child) &&
            // 如果同方向也撑大的话，就没有啥意义
            isCrossDirection(parent, child) &&
            // flexWrap撑大没有意义，还会有bug；列表撑开会导致全部滚到边上
            !isListContainer(child) &&
            !isListContainer(parent)
        ) {
            // TODO: 扩张到左边padding最多的那个，保持左右padding一致，维持居中性质
            // const margins = getMargins(parent);

            if (alignSpec === 'widthSpec') {
                child.bounds.left = parent.bounds.left;
                child.bounds.right = parent.bounds.right;
                child.bounds.width = parent.bounds.width;
            } else {
                child.bounds.top = parent.bounds.top;
                child.bounds.bottom = parent.bounds.bottom;
                child.bounds.height = parent.bounds.height;
            }
            child[alignSpec] = SizeSpec.Constrained;
        }
    });
}

/** 重新决定子元素的尺寸 */
function decideChildrenAlignSpec(parent: VNode, alignSpec: DimensionSpec, alignDimension: Dimension) {
    _.each(parent.children, child => {
        if (child[alignSpec] === SizeSpec.Constrained) {
            if (parent[alignSpec] === SizeSpec.Fixed) {
                child[alignSpec] = SizeSpec.Fixed;
            }
        } else if (child[alignSpec] === SizeSpec.Auto) {
            // 注意列表元素的alignSpec都是Fixed或者都是Constrained，表示他们的尺寸是一样的
            if (!autoMaybeClamp(child, alignSpec)) {
                if (isFlexWrapLike(child)) {
                    assert(alignSpec === 'widthSpec', 'flexWrap和多行文本只有横向才能不被截断');
                    if (parent[alignSpec] === SizeSpec.Constrained) {
                        // 允许auto元素随父节点拉伸
                        child[alignSpec] = SizeSpec.Constrained;
                    } else {
                        console.debug(
                            '多行元素想撑开,父元素又是auto或fixed,还得固定多行元素的宽度,不然没法换行'
                        );
                        // 这里也可以用最小宽度，但是没用；包一层容器也没用
                        child[alignSpec] = SizeSpec.Fixed;
                    }
                } else if (
                    parent[alignSpec] === SizeSpec.Constrained &&
                    canChildStretchWithParent(child, parent, alignDimension)
                ) {
                    // 允许auto元素随父节点拉伸
                    child[alignSpec] = SizeSpec.Constrained;
                }
            }
        } else if (!child[alignSpec]) {
            assert(!child.children.length, '只有裸盒子才没设置尺寸');
            if (parent[alignSpec] === SizeSpec.Fixed) {
                child[alignSpec] = SizeSpec.Fixed;
            } else if (
                parent[alignSpec] === SizeSpec.Constrained &&
                canChildStretchWithParent(child, parent, alignDimension)
            ) {
                child[alignSpec] = SizeSpec.Constrained;
            } else {
                child[alignSpec] = SizeSpec.Fixed;
            }
        }
    });

    // 只有一个auto元素，那基本就是被它撑开
    if (parent[alignSpec] === SizeSpec.Auto) {
        const autoChildren = _.filter(parent.children, child => child[alignSpec] === SizeSpec.Auto);
        if (autoChildren.length === 1) {
            autoChildren[0][alignSpec] = SizeSpec.Constrained;
        }
    }
}

/** 如果设置了超出滚动，则可能需要扩充auto元素 */
function expandOverflowChildrenIfPossible(
    parent: VNode,
    alignSpec: DimensionSpec,
    alignDimension: Dimension
) {
    const margins = getMargins(parent);

    // 父元素auto，则子元素没法设置overflow，会一直撑开
    if (parent[alignSpec] === SizeSpec.Auto) {
        return;
    }

    _.each(parent.children, (child, i) => {
        // 只扩充auto子节点
        if (child[alignSpec] !== SizeSpec.Auto) {
            return;
        }

        const margin = margins[i];
        // 父元素尺寸有限，扩充完子元素也是尺寸有限
        const expandAuto2SizeSpec = parent[alignSpec] as SizeSpec.Fixed | SizeSpec.Constrained;
        expandOverflowChild({
            child,
            spec: alignSpec,
            dimension: alignDimension,
            margin,
            expandAuto2SizeSpec
        });
    });
}

/** 设置父元素的尺寸类型及最小尺寸 */
function decideParentAlignSpec(parent: VNode, alignSpec: DimensionSpec, alignDimension: Dimension) {
    if (
        parent[alignSpec] === SizeSpec.Auto &&
        _.every(parent.children, child => child[alignSpec] === SizeSpec.Fixed)
    ) {
        parent[alignSpec] = SizeSpec.Fixed;
    }

    // 这种情况下给个最小尺寸
    if (parent[alignSpec] === SizeSpec.Auto) {
        if (parent === context.root && alignDimension === 'height') {
            // 根节点高度已经有最小尺寸了
        } else {
            parent.classList.push(R`min-${alignDimension.substring(0, 1)}-${parent.bounds[alignDimension]}`);
        }
    }
}

/** 获取共同的align作为父节点的align */
function getParentAlign(parent: VNode, alignSpec: DimensionSpec) {
    const [constrainNodes, otherNodes] = _.partition(
        parent.children,
        child => child[alignSpec] === SizeSpec.Constrained
    );
    // Constrained都是stretch撑开方式
    const commonStretchCount = constrainNodes.length;
    const margins = getMargins(parent, otherNodes);
    const commonMarginDiffCount = _.filter(margins, margin => numEq(margin.marginDiff, 0)).length;
    const commonMarginStartCount = _.filter(margins, margin => numLt(margin.marginDiff, 0)).length;
    const commonMarginEndCount = _.filter(margins, margin => numGt(margin.marginDiff, 0)).length;
    const maxCommonMarginCount = Math.max(
        commonStretchCount,
        commonMarginStartCount,
        commonMarginEndCount,
        commonMarginDiffCount
    );
    if (maxCommonMarginCount > 1 && maxCommonMarginCount === commonStretchCount) {
        return 'stretch';
    } else if (maxCommonMarginCount === commonMarginDiffCount) {
        return 'center';
    } else if (maxCommonMarginCount === commonMarginStartCount) {
        return 'start';
    } else if (maxCommonMarginCount === commonMarginEndCount) {
        return 'end';
    } else {
        return 'stretch';
    }
}

/** 设置公共padding */
function setCommonPadding(parent: VNode, parentAlign: string, alignSpec: DimensionSpec) {
    const margins = getMargins(parent);
    const padding = {
        paddingStart: 0,
        paddingEnd: 0
    };

    function setByMargin(key: 'Start' | 'End') {
        const marginKey = `margin${key}` as const;
        const minPadding = _.minBy(margins, margin => margin[marginKey])![marginKey];
        const minPaddingNodes = _.filter(margins, margin => numEq(margin[marginKey], minPadding));
        if (minPaddingNodes.length > 2) {
            padding[`padding${key}`] = minPadding;
            _.each(minPaddingNodes, margin => {
                margin[marginKey] = minPadding;
            });
        }
    }

    if (_.some(margins, margin => numEq(margin.marginDiff, 0))) {
        // 有一个居中则不能设置padding
    } else if (parentAlign === 'start') {
        setByMargin('Start');
    } else if (parentAlign === 'end') {
        setByMargin('End');
    } else if (_.every(parent.children, child => child[alignSpec] === SizeSpec.Constrained)) {
        // 全部都是stretch
        setByMargin('Start');
        setByMargin('End');
    }

    const s = parent.direction === Direction.Row ? 't' : 'l';
    const e = parent.direction === Direction.Row ? 'b' : 'r';
    parent.classList.push(R`p${s}-${padding.paddingStart} p${e}-${padding.paddingEnd}`);
    _.each(margins, margin => {
        margin.marginStart -= padding.paddingStart;
        margin.marginEnd -= padding.paddingEnd;
    });
    return margins;
}

/** 开始设置align属性 */
function setFlexAlign(parentAlign: string, parent: VNode, alignSpec: DimensionSpec, margins: Margin[]) {
    const s = parent.direction === Direction.Row ? 't' : 'l';
    const e = parent.direction === Direction.Row ? 'b' : 'r';

    function mayNeedAlign(childAlign: string) {
        return childAlign === parentAlign ? '' : `self-${childAlign}`;
    }

    function setFixOrAutoAlign(child: VNode, margin: Margin) {
        const selfAlign = getSelfSide(margin);
        if (selfAlign === 'center') {
            child.classList.push(mayNeedAlign('center'));
        } else if (selfAlign === 'start') {
            child.classList.push(mayNeedAlign('start'));
            child.classList.push(R`m${s}-${margin.marginStart}`);
        } else {
            if (isFlexWrapLike(child) && alignSpec === 'heightSpec') {
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
        } else {
            unreachable();
        }
    });
}

/** 获取自身靠哪边 */
function getSelfSide(margin: Margin): Side {
    if (numEq(margin.marginStart, margin.marginEnd)) {
        return 'center';
    }
    if (margin.marginStart < margin.marginEnd) {
        return 'start';
    } else {
        return 'end';
    }
}

/** 获取所有子节点align方向的边距 */
function getMargins(parent: VNode, forChildren?: VNode[]) {
    const sf = parent.direction === Direction.Row ? 'top' : 'left';
    const ef = parent.direction === Direction.Row ? 'bottom' : 'right';

    return (forChildren || parent.children).map(n => {
        const marginStart = n.bounds[sf] - parent.bounds[sf];
        const marginEnd = parent.bounds[ef] - n.bounds[ef];
        const marginDiff = marginStart - marginEnd;

        return {
            marginStart,
            marginEnd,
            marginDiff
        } as Margin;
    });
}

/** 为自动撑开的元素预留一点边距，但不会大于本身最小的边距 */
function setAutoPreserveMarginIfNeeded(
    parent: VNode,
    alignSpec: DimensionSpec,
    alignDimension: Dimension,
    margins: Margin[]
) {
    _.each(parent.children, (child, i) => {
        const parentCanMargin =
            // 单行文本可以换行
            isSingleLineText(child) ?
                parent[alignSpec] === SizeSpec.Auto || parent[alignSpec] === SizeSpec.Constrained
            :   parent[alignSpec] === SizeSpec.Auto;
        const needPreserveMargin =
            parentCanMargin &&
            child[alignSpec] === SizeSpec.Auto &&
            defaultConfig.codeGenOptions.overflowMargin;
        if (!needPreserveMargin) {
            return;
        }

        const margin = margins[i];

        if (isSingleLineText(child)) {
            assert(alignDimension === 'width', '单行文本预留空间只能是横向');
            const marginPreserve = getSingleLinePreserveMargin(child);
            const selfAlign = getSelfSide(margin);
            if (selfAlign === 'center') {
                const bothMargin = Math.min(marginPreserve, margin.marginStart);
                child.classList.push(R`mx-${bothMargin}`);
            } else if (selfAlign === 'start') {
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
            if (getSelfSide(margin) === 'center') {
                const topMargin = Math.min(lineHeight, margin.marginStart);
                child.classList.push(R`mt-${topMargin}`);
            }
        } else if (isListWrapContainer(child)) {
            assert(alignDimension === 'height', 'flexWrap预留空间只能是纵向');
            const marginPreserve = 10; // 先给10吧
            const bottomMargin = Math.min(marginPreserve, margin.marginEnd);
            child.classList.push(R`mb-${bottomMargin}`);
            if (getSelfSide(margin) === 'center') {
                const topMargin = Math.min(marginPreserve, margin.marginStart);
                child.classList.push(R`mt-${topMargin}`);
            }
        } else {
            assert(isFlexBox(child), '只有flex盒子才能预留空间');
            const marginPreserve = 10; // 先给10吧
            const selfAlign = getSelfSide(margin);
            if (selfAlign === 'center') {
                const bothMargin = Math.min(marginPreserve, margin.marginStart);
                child.classList.push(R`m${alignDimension === 'width' ? 'x' : 'y'}-${bothMargin}`);
            } else if (selfAlign === 'start') {
                const startMargin = margin.marginStart;
                const endMargin = Math.min(marginPreserve, startMargin);
                child.classList.push(R`m${alignDimension === 'width' ? 'r' : 'b'}-${endMargin}`);
            } else {
                const endMargin = margin.marginEnd;
                const startMargin = Math.min(marginPreserve, endMargin);
                child.classList.push(R`m${alignDimension === 'width' ? 'l' : 't'}-${startMargin}`);
            }
        }
    });
}

// 据children在node中的位置计算flex对齐方式
// 归组, 看哪种对齐方式最多
// const [commonMarginStartCount, commonMarginStart] = getCommonMarginOverHalf(margins, 'marginStart');
// const [commonMarginEndCount, commonMarginEnd] = getCommonMarginOverHalf(margins, 'marginEnd');
// const [commonMarginDiffCount, commonMarginDiff] = getCommonMarginOverHalf(margins, 'marginDiff');
// const maxCommonMarginCount = Math.max(
//     commonMarginStartCount,
//     commonMarginEndCount,
//     commonMarginDiffCount
// );

// /** 获取超过一半的元素的共同margin */
// function getCommonMarginOverHalf(margins: Margin[], key: keyof Margin) {
//     // 使用groupBy对数组进行分组
//     const grouped = groupByWith(margins, m => m[key], numEq);

//     /** 数量最多&数值最小的优先 */
//     const maxMargin = Array.from(grouped.values()).sort((a, b) => {
//         if (a.length === b.length) {
//             return Math.abs(a[0][key]) - Math.abs(b[0][key]);
//         } else {
//             return b.length - a.length;
//         }
//     })[0];
//     if (maxMargin && maxMargin.length * 2 > margins.length) {
//         return [maxMargin.length, maxMargin[0][key]] as const;
//     } else {
//         return [0, 0] as const;
//     }
// }

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
