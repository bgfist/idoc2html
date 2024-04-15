import * as _ from 'lodash';
import { allNumsEqual, assert, float2Int, numEq, numGt, numLte } from '../utils';
import {
    Dimension,
    DimensionSpec,
    Direction,
    R,
    Side,
    SizeSpec,
    VNode,
    getBorderWidth,
    getClassList,
    getTextFZLH,
    hasClass,
    isCrossDirection,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    isMultiLineText,
    isMultiLineTextBr,
    isNodeHasShell,
    isRootNode,
    isSingleLineText,
    makeListOverflowAuto,
    makeMultiLineTextClamp,
    makeSingleLineTextEllipsis,
    mayAddClass,
    maySetTextAlign,
    maybeIsCenter,
    newVNode
} from '../vnode';
import { canChildStretchWithParent } from './measureParentSizeSpec';
import { defaultConfig } from '../main/config';

/** 生成justify-content */
export function measureFlexJustify(parent: VNode) {
    const justifySpec = parent.direction === Direction.Row ? 'widthSpec' : 'heightSpec';
    const justifyDimension = parent.direction === Direction.Row ? 'width' : 'height';

    decideChildrenJustifySpec(parent, justifySpec, justifyDimension);

    const { startGap, endGap, gaps, equalMiddleGaps, justifySide, ranges } = getGapsAndSide(parent);

    const hasConstrainedChilds = _.some(
        parent.children,
        child => child[justifySpec] === SizeSpec.Constrained
    );

    if (!hasConstrainedChilds && parent[justifySpec] !== SizeSpec.Auto && parent.children.length === 2) {
        const middleGap = gaps[0];
        if (!numEq(middleGap, 0) && numGt(middleGap, startGap) && numGt(middleGap, endGap)) {
            const ss = parent.direction === Direction.Row ? 'l' : 't';
            const ee = parent.direction === Direction.Row ? 'r' : 'b';
            const xy = parent.direction === Direction.Row ? 'x' : 'y';
            parent.classList.push('justify-between');
            if (numEq(startGap, endGap)) {
                parent.classList.push(R`p${xy}-${startGap}`);
            } else {
                parent.classList.push(R`p${ss}-${startGap} p${ee}-${endGap}`);
            }
            return true;
        }
    }

    // 由内容自动撑开，则必须具有最小尺寸，否则flex1无效
    // TODO: 这种情况下，高度可能不够，到底是撑开间隙，还是撑开某个元素
    const isParentAutoMinSize =
        parent[justifySpec] === SizeSpec.Auto &&
        getClassList(parent).some(className => className.startsWith(`min-${justifySpec.slice(0, 1)}-`));
    const needEqualGaps = equalMiddleGaps && parent.children.length > 2;
    const needFlex1 =
        (parent[justifySpec] === SizeSpec.Constrained || isParentAutoMinSize) &&
        // 2个以上元素才需要用flex1做弹性拉伸;
        // 2个元素的话，如果中间间距很大就会走justify-between；间距过小则不应被撑开
        parent.children.length > 2 &&
        !needEqualGaps &&
        // 已经有constained子元素，让它撑开即可
        !hasConstrainedChilds;

    if (needFlex1) {
        maybeInsertFlex1Node(parent, justifySide, startGap, endGap, gaps, ranges);
    }

    sideJustify(parent, isParentAutoMinSize, justifySpec, justifySide, startGap, endGap, gaps, needEqualGaps);

    const constrainedChildren = _.filter(
        parent.children,
        child => child[justifySpec] === SizeSpec.Constrained
    );
    assert(constrainedChildren.length <= 1, 'should only have one constrained child');
    const flex1Child = constrainedChildren[0];
    if (flex1Child) {
        if (flex1Child.__temp.flex1Placeholder && isParentAutoMinSize) {
            const justifyDimension = parent.direction === Direction.Row ? 'width' : 'height';
            flex1Child.classList.push(
                R`grow ${justifyDimension.slice(0, 1)}-${flex1Child.bounds[justifyDimension]}`
            );
        } else {
            flex1Child.classList.push(R`flex-1`);
        }
    }
}

/** auto元素是否能被截断 */
function autoMaybeClamp(child: VNode, spec: DimensionSpec) {
    return (
        (spec === 'widthSpec' && isSingleLineText(child)) ||
        (spec === 'widthSpec' && isListXContainer(child)) ||
        (spec === 'heightSpec' && isListYContainer(child)) ||
        (spec === 'heightSpec' && isListWrapContainer(child)) ||
        (spec === 'heightSpec' && isMultiLineText(child))
    );
}

/** 重新决定子元素的尺寸 */
function decideChildrenJustifySpec(parent: VNode, justifySpec: DimensionSpec, justifyDimension: Dimension) {
    assert(
        !_.some(parent.children, child => child[justifySpec] === SizeSpec.Constrained),
        'Constrained children should be decided after justify.'
    );

    let setTitleCenter = false;
    // 处理标题栏居中
    // TODO: 需要更严格的判断，有的表单input也被处理成居中title了
    if (
        parent[justifySpec] === SizeSpec.Constrained &&
        parent.children.length === 2 &&
        justifySpec === 'widthSpec'
    ) {
        const { gaps } = getGapsAndSide(parent);
        const centerTextNode = parent.children.find(
            child =>
                isSingleLineText(child) &&
                maybeIsCenter(
                    child.bounds.left - parent.bounds.left,
                    parent.bounds.right - child.bounds.right
                )
        );
        if (centerTextNode) {
            centerTextNode.bounds.left -= gaps[0];
            centerTextNode.bounds.right += gaps[0];
            centerTextNode.bounds.width = centerTextNode.bounds.right - centerTextNode.bounds.left;
            maySetTextAlign(centerTextNode, 'center');
            centerTextNode.widthSpec = SizeSpec.Constrained;
            setTitleCenter = true;
        }
    }

    // 扩充最有可能扩充的Auto元素为flex1
    if (parent[justifySpec] !== SizeSpec.Auto && parent.children.length > 1 && !setTitleCenter) {
        const { startGap, endGap, gaps } = getGapsAndSide(parent);

        const autoChildren = _.reduce(
            parent.children,
            (arr, child, i) => {
                if (child[justifySpec] === SizeSpec.Auto && autoMaybeClamp(child, justifySpec)) {
                    // 只处理这些情况
                } else {
                    return arr;
                }

                const beforeGap = i === 0 ? startGap : gaps[i - 1];
                const afterGap = i === parent.children.length - 1 ? endGap : gaps[i];

                if (parent.children.length === 2) {
                    if (i === 0 && beforeGap < afterGap) {
                        return arr;
                    } else if (i === 1 && afterGap < beforeGap) {
                        return arr;
                    }
                }

                arr.push({
                    dimension: beforeGap + child.bounds[justifyDimension] + afterGap,
                    beforeGap,
                    afterGap,
                    child
                });
                return arr;
            },
            [] as any[]
        );

        const autoChild = _.maxBy(autoChildren, 'dimension');
        if (autoChild && autoChild.dimension > parent.bounds[justifyDimension] / 2) {
            if (isSingleLineText(autoChild.child)) {
                autoChild.child.widthSpec = SizeSpec.Constrained;

                if (autoChild.beforeGap > autoChild.afterGap && !hasClass(autoChild.child, 'text-ellipsis')) {
                    const marginPreserve =
                        (
                            defaultConfig.codeGenOptions.textClamp ||
                            defaultConfig.codeGenOptions.overflowMargin
                        ) ?
                            Math.min(
                                autoChild.beforeGap,
                                float2Int(getTextFZLH(autoChild.child).fontSize / 2)
                            )
                        :   0;
                    autoChild.child.bounds.left -= autoChild.beforeGap - marginPreserve;
                    autoChild.child.bounds.width = autoChild.child.bounds.right - autoChild.child.bounds.left;
                    maySetTextAlign(autoChild.child, 'right');
                } else {
                    const marginPreserve =
                        (
                            defaultConfig.codeGenOptions.textClamp ||
                            defaultConfig.codeGenOptions.overflowMargin
                        ) ?
                            Math.min(autoChild.afterGap, float2Int(getTextFZLH(autoChild.child).fontSize / 2))
                        :   0;
                    autoChild.child.bounds.right += autoChild.afterGap - marginPreserve;
                    autoChild.child.bounds.width = autoChild.child.bounds.right - autoChild.child.bounds.left;
                }

                defaultConfig.codeGenOptions.textClamp && makeSingleLineTextEllipsis(autoChild.child);
            } else if (isListXContainer(autoChild.child) && autoChild.afterGap > autoChild.beforeGap) {
                autoChild.child.widthSpec = SizeSpec.Constrained;
                const marginPreserve =
                    (
                        defaultConfig.codeGenOptions.listOverflowAuto ||
                        defaultConfig.codeGenOptions.overflowMargin
                    ) ?
                        Math.min(autoChild.afterGap, 10)
                    :   0;

                autoChild.child.bounds.right += autoChild.afterGap - marginPreserve;
                autoChild.child.bounds.width = autoChild.child.bounds.right - autoChild.child.bounds.left;

                defaultConfig.codeGenOptions.listOverflowAuto && makeListOverflowAuto(autoChild.child);
            } else if (isListYContainer(autoChild.child) && autoChild.afterGap > autoChild.beforeGap) {
                autoChild.child.heightSpec = SizeSpec.Constrained;
                const marginPreserve =
                    (
                        defaultConfig.codeGenOptions.listOverflowAuto ||
                        defaultConfig.codeGenOptions.overflowMargin
                    ) ?
                        Math.min(autoChild.afterGap, 10)
                    :   0;

                autoChild.child.bounds.bottom += autoChild.afterGap - marginPreserve;
                autoChild.child.bounds.height = autoChild.child.bounds.bottom - autoChild.child.bounds.top;

                defaultConfig.codeGenOptions.listOverflowAuto && makeListOverflowAuto(autoChild.child);
            } else if (isListWrapContainer(autoChild.child) && autoChild.afterGap > autoChild.beforeGap) {
                autoChild.child.heightSpec = SizeSpec.Constrained;
                const marginPreserve =
                    (
                        defaultConfig.codeGenOptions.listOverflowAuto ||
                        defaultConfig.codeGenOptions.overflowMargin
                    ) ?
                        Math.min(autoChild.afterGap, 10)
                    :   0;

                autoChild.child.bounds.bottom += autoChild.afterGap - marginPreserve;
                autoChild.child.bounds.height = autoChild.child.bounds.bottom - autoChild.child.bounds.top;

                defaultConfig.codeGenOptions.listOverflowAuto && makeListOverflowAuto(autoChild.child);
            } else if (isMultiLineText(autoChild.child) && autoChild.afterGap > autoChild.beforeGap) {
                autoChild.child.heightSpec = SizeSpec.Constrained;
                const marginPreserve =
                    (
                        defaultConfig.codeGenOptions.listOverflowAuto ||
                        defaultConfig.codeGenOptions.overflowMargin
                    ) ?
                        Math.min(autoChild.afterGap, 10)
                    :   0;

                autoChild.child.bounds.bottom += autoChild.afterGap - marginPreserve;
                autoChild.child.bounds.height = autoChild.child.bounds.bottom - autoChild.child.bounds.top;

                defaultConfig.codeGenOptions.textClamp && makeMultiLineTextClamp(autoChild.child);
            }
        }
    }

    const hasConstrainedChilds = _.some(
        parent.children,
        child => child[justifySpec] === SizeSpec.Constrained
    );

    // TODO: 要不要处理多个flex1呢
    /** 负边距可能会导致有多个超过一半尺寸的子节点 */
    function checkIsOverHalfChild(child: VNode) {
        const overHalfChildren = parent.children.filter(child =>
            canChildStretchWithParent(child, parent, justifyDimension)
        );
        return overHalfChildren.length === 1 && overHalfChildren[0] === child;
    }

    _.each(parent.children, child => {
        if (child[justifySpec] === SizeSpec.Auto && !autoMaybeClamp(child, justifySpec)) {
            if (isListWrapContainer(child)) {
                if (parent[justifySpec] === SizeSpec.Constrained && !hasConstrainedChilds) {
                    // 允许auto元素随父节点拉伸
                    child[justifySpec] = SizeSpec.Constrained;
                } else {
                    console.debug('多行列表想撑开,父元素又是auto或fixed,还得固定多行元素的宽度,不然没法换行');
                    // 这里也可以用最小宽度，但是没用；包一层容器也没用
                    child[justifySpec] = SizeSpec.Fixed;
                }
            } else if (isMultiLineText(child) && !isMultiLineTextBr(child)) {
                if (parent[justifySpec] === SizeSpec.Constrained && !hasConstrainedChilds) {
                    // 允许auto元素随父节点拉伸
                    child[justifySpec] = SizeSpec.Constrained;
                } else {
                    console.debug('多行文本想撑开,父元素又是auto或fixed,还得固定多行元素的宽度,不然没法换行');
                    // 这里也可以用最小宽度，但是没用；包一层容器也没用
                    child[justifySpec] = SizeSpec.Fixed;
                }
            } else if (
                !hasConstrainedChilds &&
                parent[justifySpec] === SizeSpec.Constrained &&
                checkIsOverHalfChild(child)
            ) {
                // 允许auto元素随父节点拉伸
                child[justifySpec] = SizeSpec.Constrained;
            }
        } else if (!child[justifySpec]) {
            assert(!child.children.length, '只有裸盒子才没设置尺寸');
            if (
                !hasConstrainedChilds &&
                parent[justifySpec] === SizeSpec.Constrained &&
                checkIsOverHalfChild(child)
            ) {
                child[justifySpec] = SizeSpec.Constrained;
            } else {
                child[justifySpec] = SizeSpec.Fixed;
            }
        }
    });
}

/** 计算间距信息 */
function getGapsAndSide(parent: VNode) {
    const ssf = parent.direction === Direction.Row ? 'left' : 'top';
    const eef = parent.direction === Direction.Row ? 'right' : 'bottom';
    const borderWidth = getBorderWidth(parent);

    // 根据children在node中的位置计算flex主轴布局
    const ranges = _.zip(
        [...parent.children.map(n => n.bounds[ssf]), parent.bounds[eef] - borderWidth],
        [parent.bounds[ssf] + borderWidth, ...parent.children.map(n => n.bounds[eef])]
    ) as [number, number][];
    const gaps = ranges.map(([p, n]) => p - n);
    const startGap = gaps.shift()!;
    const endGap = gaps.pop()!;
    const equalMiddleGaps = allNumsEqual(gaps);
    const justifySide: Side =
        maybeIsCenter(startGap, endGap) ? 'center'
        : numLte(startGap, endGap) ? 'start'
        : ('end' as const);

    return {
        startGap,
        endGap,
        gaps,
        equalMiddleGaps,
        justifySide,
        ranges
    };
}

/** 尝试插入flex1节点 */
function maybeInsertFlex1Node(
    parent: VNode,
    justifySide: 'start' | 'end' | 'center',
    startGap: number,
    endGap: number,
    gaps: number[],
    ranges: [number, number][]
) {
    // 居中布局的话，除非中间有特别大的间距超过两侧的间距，才需要撑开
    if (justifySide === 'center' && numLte(_.max(gaps)!, startGap * 2)) {
        return;
    }

    // 可以通过flex1实现和stretch类似的效果
    let flex1GapIndex: number;
    // TODO: 生成多个flex1

    if (justifySide === 'start' || justifySide === 'center') {
        const gapsWithSide = [...gaps, endGap];
        const maxGap = _.max(gapsWithSide)!;
        // 优先让后面的撑开
        flex1GapIndex = _.lastIndexOf(gapsWithSide, maxGap);
        if (flex1GapIndex === gaps.length || numEq(maxGap, 0)) {
            // 撑开最后面的边距说明边距过大，不需要撑开
            return;
        }
    } else {
        const gapsWithSide = [startGap, ...gaps];
        const maxGap = _.max(gapsWithSide)!;
        // 优先让前面的撑开
        flex1GapIndex = _.indexOf(gapsWithSide, maxGap);
        if (flex1GapIndex === 0 || numEq(maxGap, 0)) {
            // 撑开最前面的边距说明边距过大，不需要撑开
            return;
        } else {
            flex1GapIndex--;
        }
    }

    const sf = parent.direction === Direction.Row ? 'top' : 'left';
    const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
    const ssf = parent.direction === Direction.Row ? 'left' : 'top';
    const eef = parent.direction === Direction.Row ? 'right' : 'bottom';
    const spec1 = parent.direction === Direction.Row ? 'width' : 'height';
    const spec2 = parent.direction === Direction.Row ? 'height' : 'width';
    const pos = float2Int(parent.bounds[sf] + parent.bounds[ef] / 2);
    const [eefn, ssfn] = ranges[flex1GapIndex + 1];

    const flex1Vnode = newVNode({
        bounds: {
            [sf]: pos,
            [ef]: pos,
            [ssf]: ssfn,
            [eef]: eefn,
            [spec1]: eefn - ssfn,
            [spec2]: 0
        } as any,
        classList: [],
        [`${spec1}Spec`]: SizeSpec.Constrained,
        [`${spec2}Spec`]: SizeSpec.Fixed,
        __temp: {
            flex1Placeholder: true
        }
    });

    // 将flex1元素的左右gap设为0
    gaps.splice(flex1GapIndex, 1, 0, 0);
    // 插入flex1元素
    parent.children.splice(flex1GapIndex + 1, 0, flex1Vnode);
}

/** 靠边布局 */
function sideJustify(
    parent: VNode,
    isParentAutoMinSize: boolean,
    justifySpec: DimensionSpec,
    justifySide: Side,
    startGap: number,
    endGap: number,
    gaps: number[],
    needEqualGaps: boolean
) {
    const ss = parent.direction === Direction.Row ? 'l' : 't';
    const ee = parent.direction === Direction.Row ? 'r' : 'b';
    const xy = parent.direction === Direction.Row ? 'x' : 'y';
    const hasConstrainedChilds = _.some(
        parent.children,
        child => child[justifySpec] === SizeSpec.Constrained
    );

    if (hasConstrainedChilds) {
        // 都flex1了，父节点什么都不用设置
    } else if (justifySide === 'center') {
        if (parent[justifySpec] === SizeSpec.Auto) {
            parent.classList.push(R`p${xy}-${startGap}`);
        } else {
            parent.classList.push('justify-center');
        }
    } else if (justifySide === 'start') {
        if (parent[justifySpec] === SizeSpec.Auto) {
            if (isParentAutoMinSize && isRootNode(parent)) {
                // 给页面底部预留20像素就够了
                parent.classList.push(R`p${ee}-${Math.min(endGap, 20)}`);
            } else {
                parent.classList.push(R`p${ee}-${endGap}`);
            }
        }
    } else if (justifySide === 'end') {
        parent.classList.push('justify-end');
        if (parent[justifySpec] === SizeSpec.Auto) {
            parent.classList.push(R`p${ss}-${startGap}`);
        }
    }

    if (hasConstrainedChilds) {
        // flex1全部往左margin
        gaps.unshift(startGap);
        _.each(parent.children, (child, i) => {
            child.classList.push(R`m${ss}-${gaps[i]}`);
        });
        parent.children[parent.children.length - 1].classList.push(R`m${ee}-${endGap}`);

        // 父亲有绝对定位元素，space-x有问题
    } else if (needEqualGaps && !parent.attachNodes.length) {
        parent.classList.push(R`space-${xy}-${gaps[0]}`);

        if (justifySide === 'start') {
            parent.classList.push(R`p${ss}-${startGap}`);
        } else if (justifySide === 'end') {
            parent.classList.push(R`p${ee}-${endGap}`);
        }
    } else {
        if (justifySide === 'center') {
            _.each(parent.children.slice(1), (child, i) => {
                child.classList.push(R`m${ss}-${gaps[i]}`);
            });
        } else if (justifySide === 'start') {
            gaps.unshift(startGap);
            _.each(parent.children, (child, i) => {
                child.classList.push(R`m${ss}-${gaps[i]}`);
            });
        } else if (justifySide === 'end') {
            gaps.push(endGap);
            _.each(parent.children, (child, i) => {
                child.classList.push(R`m${ee}-${gaps[i]}`);
            });
        }
    }
}
