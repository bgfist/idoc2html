import * as _ from 'lodash';
import { defaultConfig } from '../main/config';
import { assert, float2Int, maxWith, numEq, numGt, numLt, unreachable } from '../utils';
import {
    Dimension,
    DimensionSpec,
    Direction,
    R,
    Side,
    SizeSpec,
    VNode,
    getBorderWidth,
    getTextFZLH,
    isCrossDirection,
    isGeneratedNode,
    isImageOrSliceNode,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    isMultiLineText,
    isMultiLineTextBr,
    isNodeHasShell,
    isRootNode,
    isSingleLineText,
    isTextNode,
    makeListOverflowAuto,
    makeMultiLineTextClamp,
    makeSingleLineTextEllipsis,
    maySetTextAlign,
    maybeIsCenter
} from '../vnode';
import { canChildStretchWithParent } from './measureParentSizeSpec';

interface Margin {
    marginStart: number;
    marginEnd: number;
    marginDiff: number;
}

/** 生成align-items */
export function measureFlexAlign(parent: VNode) {
    const alignSpec = parent.direction === Direction.Row ? 'heightSpec' : 'widthSpec';
    const alignDimension = parent.direction === Direction.Row ? 'height' : 'width';

    decideChildrenAlignSpec(parent, alignSpec, alignDimension);
    decideParentAlignSpec(parent, alignSpec, alignDimension);

    // TODO: 如果背景不是图片的话，则单纯看视觉上元素靠哪边
    // 否则，可能还是以前的算法好. 我们这里谨慎使用padding
    const parentAlign = getParentAlign(parent, alignSpec, alignDimension);
    const remainMargins = setCommonPadding(parent, parentAlign, alignSpec);
    setFlexAlign(parentAlign, parent, alignSpec, remainMargins);
}

/** 扩充Auto尺寸为Constrained */
function expandAutoToConstrained(params: {
    child: VNode;
    alignSpec: DimensionSpec;
    margin: Margin;
    marginPreserve: number;
    marginSide: Side;
}) {
    const { child, alignSpec, margin, marginPreserve, marginSide } = params;

    // 开始扩充容器
    child[alignSpec] = SizeSpec.Constrained;

    const startMargin =
        marginSide === 'start' ? margin.marginStart
        : marginSide === 'center' ? Math.min(marginPreserve, margin.marginStart)
        : Math.min(marginPreserve, margin.marginEnd);
    const endMargin =
        marginSide === 'center' ? Math.min(marginPreserve, margin.marginEnd)
        : marginSide === 'end' ? margin.marginEnd
        : Math.min(marginPreserve, margin.marginStart);

    if (alignSpec === 'widthSpec') {
        child.bounds.left -= margin.marginStart - startMargin;
        child.bounds.right += margin.marginEnd - endMargin;
        child.bounds.width = child.bounds.right - child.bounds.left;
    } else {
        child.bounds.top -= margin.marginStart - startMargin;
        child.bounds.bottom += margin.marginEnd - endMargin;
        child.bounds.height = child.bounds.bottom - child.bounds.top;
    }
}

/** 重新决定子元素的尺寸 */
function decideChildrenAlignSpec(parent: VNode, alignSpec: DimensionSpec, alignDimension: Dimension) {
    const margins = getMargins(parent);

    _.each(parent.children, (child, i) => {
        if (child[alignSpec] === SizeSpec.Constrained) {
            if (parent[alignSpec] === SizeSpec.Fixed) {
                child[alignSpec] = SizeSpec.Fixed;
            }
        } else if (child[alignSpec] === SizeSpec.Auto) {
            const margin = margins[i];
            const marginSide = getSelfSide(margin, parent, alignSpec);

            if (alignSpec === 'widthSpec' && isSingleLineText(child)) {
                const marginPreserve =
                    defaultConfig.codeGenOptions.textClamp || defaultConfig.codeGenOptions.overflowMargin ?
                        float2Int(getTextFZLH(child).fontSize / 2)
                    :   0;
                expandAutoToConstrained({
                    child,
                    alignSpec,
                    margin,
                    marginSide,
                    marginPreserve
                });
                if (marginSide === 'end') {
                    maySetTextAlign(child, 'right');
                } else if (marginSide === 'center') {
                    maySetTextAlign(child, 'center');
                }
                defaultConfig.codeGenOptions.textClamp && makeSingleLineTextEllipsis(child);
            } else if (
                alignSpec === 'widthSpec' &&
                isMultiLineText(child) &&
                isMultiLineTextBr(child) &&
                marginSide === 'center'
            ) {
                expandAutoToConstrained({
                    child,
                    alignSpec,
                    margin,
                    marginPreserve: 0,
                    marginSide: 'center'
                });
            } else if (alignSpec === 'widthSpec' && isMultiLineText(child)) {
                if (
                    parent[alignSpec] === SizeSpec.Constrained &&
                    canChildStretchWithParent(child, parent, alignDimension)
                ) {
                    // 允许auto元素随父节点拉伸
                    child[alignSpec] = SizeSpec.Constrained;
                } else {
                    console.debug('多行文本想撑开,父元素又是auto或fixed,还得固定多行元素的宽度,不然没法换行');
                    // 这里也可以用最小宽度，但是没用；包一层容器也没用
                    child[alignSpec] = SizeSpec.Fixed;
                }
            } else if (alignSpec === 'widthSpec' && isListWrapContainer(child)) {
                if (parent[alignSpec] === SizeSpec.Constrained) {
                    // 允许auto元素随父节点拉伸
                    child[alignSpec] = SizeSpec.Constrained;
                } else {
                    console.debug('多行列表想撑开,父元素又是auto或fixed,还得固定多行元素的宽度,不然没法换行');
                    // 这里也可以用最小宽度，但是没用；包一层容器也没用
                    child[alignSpec] = SizeSpec.Fixed;
                }
            } else if (alignSpec === 'widthSpec' && isListXContainer(child)) {
                const marginPreserve =
                    (
                        defaultConfig.codeGenOptions.listOverflowAuto ||
                        defaultConfig.codeGenOptions.overflowMargin
                    ) ?
                        10
                    :   0;
                expandAutoToConstrained({
                    child,
                    alignSpec,
                    margin,
                    marginSide,
                    marginPreserve
                });
                if (marginSide === 'center') {
                    child.classList.push('justify-center');
                } else {
                    child.classList.push(R`pl-${child.children[0].bounds.left - child.bounds.left}`);
                }
                defaultConfig.codeGenOptions.listOverflowAuto && makeListOverflowAuto(child);
            } else if (alignSpec === 'heightSpec' && isListYContainer(child)) {
                if (parent[alignSpec] !== SizeSpec.Auto) {
                    const marginPreserve =
                        (
                            defaultConfig.codeGenOptions.listOverflowAuto ||
                            defaultConfig.codeGenOptions.overflowMargin
                        ) ?
                            10
                        :   0;
                    expandAutoToConstrained({
                        child,
                        alignSpec,
                        margin,
                        marginSide,
                        marginPreserve
                    });
                    if (marginSide === 'center') {
                        child.classList.push('justify-center');
                    } else {
                        child.classList.push(R`pt-${child.children[0].bounds.top - child.bounds.top}`);
                    }
                    defaultConfig.codeGenOptions.listOverflowAuto && makeListOverflowAuto(child);
                }
            } else if (alignSpec === 'heightSpec' && isListWrapContainer(child)) {
                if (parent[alignSpec] !== SizeSpec.Auto) {
                    const marginPreserve =
                        (
                            defaultConfig.codeGenOptions.listOverflowAuto ||
                            defaultConfig.codeGenOptions.overflowMargin
                        ) ?
                            10
                        :   0;
                    expandAutoToConstrained({
                        child,
                        alignSpec,
                        margin,
                        marginSide,
                        marginPreserve
                    });
                    if (marginSide === 'center') {
                        child.classList.push('content-center');
                    } else {
                        child.classList.push(R`pt-${child.children[0].bounds.top - child.bounds.top}`);
                    }
                    defaultConfig.codeGenOptions.listOverflowAuto && makeListOverflowAuto(child);
                }
            } else if (alignSpec === 'heightSpec' && isMultiLineText(child)) {
                if (parent[alignSpec] !== SizeSpec.Auto && marginSide !== 'center') {
                    const marginPreserve =
                        (
                            defaultConfig.codeGenOptions.textClamp ||
                            defaultConfig.codeGenOptions.overflowMargin
                        ) ?
                            getTextFZLH(child).lineHeight
                        :   0;
                    expandAutoToConstrained({
                        child,
                        alignSpec,
                        margin,
                        marginSide: 'start',
                        marginPreserve
                    });
                    child.classList.push(R`pt-${margin.marginStart}`);
                    defaultConfig.codeGenOptions.textClamp && makeMultiLineTextClamp(child);
                }
            } else if (parent[alignSpec] === SizeSpec.Constrained && isGeneratedNode(child)) {
                expandAutoToConstrained({
                    child,
                    alignSpec,
                    margin,
                    marginPreserve: 0,
                    marginSide: 'center'
                });

                if (isListXContainer(child) || isListWrapContainer(child)) {
                    const pt = child.children[0].bounds.top - child.bounds.top;
                    const pb = child.bounds.bottom - child.children[0].bounds.bottom;
                    if (numEq(pt, pb)) {
                        child.classList.push(R`py-${pt}`);
                    } else {
                        child.classList.push(R`pt-${pt} pb-${pb}`);
                    }
                } else if (isListYContainer(child)) {
                    const pl = child.children[0].bounds.left - child.bounds.left;
                    const pr = child.bounds.right - child.children[0].bounds.right;
                    if (numEq(pl, pr)) {
                        child.classList.push(R`px-${pl}`);
                    } else {
                        child.classList.push(R`pl-${pl} pr-${pr}`);
                    }
                }
            } else if (
                alignSpec === 'widthSpec' &&
                canChildStretchWithParent(child, parent, alignDimension)
            ) {
                if (
                    parent[alignSpec] === SizeSpec.Auto &&
                    numEq(margin.marginStart, 0) &&
                    numEq(margin.marginEnd, 0)
                ) {
                    // 这种情况此元素是撑开auto的骨架，应该保持Auto
                } else {
                    // 允许auto元素随父节点拉伸
                    child[alignSpec] = SizeSpec.Constrained;
                }
            } else if (
                alignSpec === 'heightSpec' &&
                isNodeHasShell(child) &&
                canChildStretchWithParent(child, parent, alignDimension)
            ) {
                const bottomContentNode = _.maxBy(
                    parent.children.filter(node => node[alignSpec] === SizeSpec.Auto),
                    child => {
                        if (isTextNode(child) || isImageOrSliceNode(child) || !child.children.length) {
                            return child.bounds.bottom;
                        }
                        return maxWith(child.children, son => son.bounds.bottom);
                    }
                )!;
                if (child !== bottomContentNode) {
                    child[alignSpec] = SizeSpec.Constrained;
                }
            }
        } else if (!child[alignSpec]) {
            assert(!child.children.length, '只有裸盒子才没设置尺寸');
            if (parent[alignSpec] === SizeSpec.Fixed) {
                child[alignSpec] = SizeSpec.Fixed;
            } else if (canChildStretchWithParent(child, parent, alignDimension)) {
                child[alignSpec] = SizeSpec.Constrained;
            } else {
                child[alignSpec] = SizeSpec.Fixed;
            }
        }
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

    // 这种情况下给个最小尺寸,高度一定可以撑开，不需要设置
    if (parent[alignSpec] === SizeSpec.Auto && alignSpec === 'widthSpec') {
        parent.classList.push(R`min-${alignDimension.substring(0, 1)}-${parent.bounds[alignDimension]}`);
    }
}

/** 获取共同的align作为父节点的align */
function getParentAlign(parent: VNode, alignSpec: DimensionSpec, alignDimension: Dimension) {
    const [constrainNodes, otherNodes] = _.partition(
        parent.children,
        child =>
            child[alignSpec] === SizeSpec.Constrained ||
            (parent[alignSpec] === SizeSpec.Fixed &&
                child.bounds[alignDimension] === parent.bounds[alignDimension])
    );
    // Constrained都是stretch撑开方式
    const commonStretchCount = constrainNodes.length;
    let margins = getMargins(parent, otherNodes);

    const commonMarginDiffCount = _.filter(
        margins,
        margin => getSelfSide(margin, parent, alignSpec) === 'center'
    ).length;
    const commonMarginStartCount = _.filter(
        margins,
        margin => getSelfSide(margin, parent, alignSpec) === 'start'
    ).length;
    const commonMarginEndCount = _.filter(
        margins,
        margin => getSelfSide(margin, parent, alignSpec) === 'end'
    ).length;
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
    if (numEq(padding.paddingStart, padding.paddingEnd)) {
        const xy = parent.direction === Direction.Row ? 'y' : 'x';
        parent.classList.push(R`p${xy}-${padding.paddingStart}`);
    } else {
        parent.classList.push(R`p${s}-${padding.paddingStart} p${e}-${padding.paddingEnd}`);
    }
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
        let selfAlign = getSelfSide(margin, parent, alignSpec);

        if (selfAlign === 'center') {
            child.classList.push(mayNeedAlign('center'));

            if (parent[alignSpec] === SizeSpec.Auto && alignSpec === 'heightSpec') {
                if (
                    margin ===
                    _.minBy(
                        _.filter(margins, (_, i) => parent.children[i][alignSpec] === SizeSpec.Auto),
                        m => m.marginEnd
                    )
                ) {
                    // 此元素为理论上撑开父元素的最底元素
                    child.classList.push(R`my-${margin.marginStart}`);
                }
            }
        } else if (selfAlign === 'start') {
            child.classList.push(mayNeedAlign('start'));

            if (parent[alignSpec] === SizeSpec.Auto && alignSpec === 'heightSpec') {
                if (
                    margin ===
                    _.minBy(
                        _.filter(margins, (_, i) => parent.children[i][alignSpec] === SizeSpec.Auto),
                        m => m.marginEnd
                    )
                ) {
                    // 此元素为理论上撑开父元素的最底元素
                    if (numEq(margin.marginStart, margin.marginEnd)) {
                        child.classList.push(R`my-${margin.marginEnd}`);
                    } else {
                        child.classList.push(R`m${s}-${margin.marginStart}`);
                        child.classList.push(R`m${e}-${margin.marginEnd}`);
                    }
                } else {
                    const marginEnd = Math.min(margin.marginEnd, margin.marginStart);
                    if (numEq(margin.marginStart, marginEnd)) {
                        child.classList.push(R`my-${marginEnd}`);
                    } else {
                        child.classList.push(R`m${s}-${margin.marginStart}`);
                        child.classList.push(R`m${e}-${marginEnd}`);
                    }
                }
            } else {
                child.classList.push(R`m${s}-${margin.marginStart}`);
            }
        } else {
            child.classList.push(mayNeedAlign('end'));
            child.classList.push(R`m${e}-${margin.marginEnd}`);
        }
    }

    function setConstrainedAlign(child: VNode, margin: Margin) {
        child.classList.push(mayNeedAlign('stretch'));
        if (numEq(margin.marginStart, margin.marginEnd)) {
            const xy = parent.direction === Direction.Row ? 'y' : 'x';
            child.classList.push(R`m${xy}-${margin.marginStart}`);
        } else {
            child.classList.push(R`m${s}-${margin.marginStart} m${e}-${margin.marginEnd}`);
        }
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
function getSelfSide(margin: Margin, parent: VNode, alignSpec: DimensionSpec): Side {
    let selfAlign: Side;

    if (maybeIsCenter(margin.marginStart, margin.marginEnd)) {
        selfAlign = 'center';
    } else if (margin.marginStart < margin.marginEnd) {
        selfAlign = 'start';
    } else {
        selfAlign = 'end';
    }

    // 对于auto需要特殊处理，如果起始边贴合边界，则靠起始边即可，纵向的话也只能靠上边
    if (parent[alignSpec] === SizeSpec.Auto) {
        if (selfAlign === 'center' && numEq(margin.marginStart, 0)) {
            selfAlign = 'start';
        } else if (alignSpec === 'heightSpec' && selfAlign === 'end') {
            selfAlign = 'start';
        }
    }

    return selfAlign;
}

/** 获取所有子节点align方向的边距 */
function getMargins(parent: VNode, forChildren?: VNode[]) {
    const sf = parent.direction === Direction.Row ? 'top' : 'left';
    const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
    const borderWidth = getBorderWidth(parent);

    return (forChildren || parent.children).map(n => {
        const marginStart = n.bounds[sf] - parent.bounds[sf] - borderWidth;
        const marginEnd = parent.bounds[ef] - n.bounds[ef] - borderWidth;
        const marginDiff = marginStart - marginEnd;

        return {
            marginStart,
            marginEnd,
            marginDiff
        } as Margin;
    });
}
