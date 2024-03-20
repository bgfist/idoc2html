import * as _ from 'lodash';
import { defaultConfig } from '../config';
import { anyElesIn, assert, groupByWith, numEq, unreachable } from '../utils';
import {
    Direction,
    R,
    SizeSpec,
    VNode,
    getClassList,
    isCrossDirection,
    isFlexWrapLike,
    isGhostNode,
    isListContainer,
    isListWrapContainer,
    isListXContainer,
    isMultiLineText,
    isSingleLineText,
    isTextNode,
    maybeInlineButton,
    newVNode
} from '../vnode';

/** 生成align-items */
export function measureFlexAlign(parent: VNode) {
    const children = parent.children;

    const sf = parent.direction === Direction.Row ? 'top' : 'left';
    const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
    const s = sf[0];
    const e = ef[0];
    const alignSpec = parent.direction === Direction.Row ? 'heightSpec' : 'widthSpec';
    const alignSpecSize = parent.direction === Direction.Row ? 'height' : 'width';

    type Margin = {
        marginStart: number;
        marginEnd: number;
        marginDiff: number;
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
        };
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
                        child.classList.push('content-center');
                    } else if (margin.marginStart < margin.marginEnd) {
                        // 往下边撑开
                        child.classList.push('content-start');
                    } else {
                        // 往上边撑开
                        child.classList.push('content-end');
                    }
                } else if (isMultiLineText(child)) {
                    // 用一个子元素包起来
                    child.textContent = [newVNode(_.cloneDeep(child))];
                    child.classList.push('flex');

                    // 保留auto元素的位置
                    if (possibleAlignCenter(margin)) {
                        // 往两边撑开
                        child.classList.push('items-center');
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
                    // 靠左边撑开
                    setAutoContentsAlign(child, 'start');
                } else {
                    // 靠右边撑开
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

    // 优先视觉上居中的元素，只要有且不是全部，就干脆子元素单独设置align
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
    const maxCommonMarginCount = Math.max(
        commonMarginStartCount,
        commonMarginEndCount,
        commonMarginDiffCount
    );

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

/** 处理auto元素内容居中，仅横向 */
function setAutoContentsAlign(vnode: VNode, side: 'center' | 'start' | 'end') {
    if (isTextNode(vnode)) {
        const sideMap = {
            center: 'center',
            start: 'left',
            end: 'right'
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
        assert(
            to === SizeSpec.Constrained || to === SizeSpec.Fixed,
            `不允许这样修改尺寸类型: ${from} -> ${to}`
        );
    }

    child[alignSpec] = to;
}
