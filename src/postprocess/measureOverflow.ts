import _ from 'lodash';
import { assert, numEq } from '../utils';
import {
    VNode,
    SizeSpec,
    isListXContainer,
    isListYContainer,
    isMultiLineText,
    DimensionSpec,
    Dimension,
    isSingleLineText,
    makeSingleLineTextEllipsis,
    makeMultiLineTextClamp,
    isListWrapContainer,
    isFlexWrapLike,
    Side,
    makeListOverflowAuto,
    getTextFZLH
} from '../vnode';
import { defaultConfig } from '../main/config';

interface Margin {
    marginStart: number;
    marginEnd: number;
}

/** 获取margin靠哪边 */
function getMarginSide(margin: Margin): Side {
    if (numEq(margin.marginStart, margin.marginEnd)) {
        return 'center';
    }
    if (margin.marginStart < margin.marginEnd) {
        return 'start';
    } else {
        return 'end';
    }
}

/** 扩充auto尺寸 */
function expandAutoForOverflow(params: {
    child: VNode;
    expandAuto2SizeSpec: SizeSpec.Fixed | SizeSpec.Constrained;
    spec: DimensionSpec;
    margin: Margin;
    marginPreserve: number;
    expandEndOnly?: boolean;
}) {
    const { child, expandAuto2SizeSpec, spec, margin, marginPreserve, expandEndOnly } = params;

    // 开始扩充容器
    child[spec] = expandAuto2SizeSpec;

    const marginSide = getMarginSide(margin);
    const startMargin =
        expandEndOnly || marginSide === 'start' ? margin.marginStart
        : marginSide === 'center' ? Math.min(marginPreserve, margin.marginStart)
        : Math.min(marginPreserve, margin.marginEnd);
    const endMargin =
        marginSide === 'center' ? Math.min(marginPreserve, margin.marginEnd)
        : marginSide === 'end' ? margin.marginEnd
        : Math.min(marginPreserve, margin.marginStart);

    if (spec === 'widthSpec') {
        child.bounds.left -= margin.marginStart - startMargin;
        child.bounds.right += margin.marginEnd - endMargin;
        child.bounds.width = child.bounds.right - child.bounds.left;
    } else {
        child.bounds.top -= margin.marginStart - startMargin;
        child.bounds.bottom += margin.marginEnd - endMargin;
        child.bounds.height = child.bounds.bottom - child.bounds.top;
    }
}

/** 设置文本超出省略 */
function setTextClamp(params: {
    child: VNode;
    spec: DimensionSpec;
    dimension: Dimension;
    margin: Margin;
    expandAuto2SizeSpec?: SizeSpec.Fixed | SizeSpec.Constrained;
}) {
    const { spec, dimension, margin, expandAuto2SizeSpec } = params;
    let { child } = params;

    if (isSingleLineText(child)) {
        assert(dimension === 'width', '单行文本超出省略只能是横向');

        const isJustify = !expandAuto2SizeSpec;

        // justify的直接auto撑开，给个overflow-hidden就行
        if (!isJustify) {
            const marginPreserve = getSingleLinePreserveMargin(child);
            expandAutoForOverflow({
                child,
                expandAuto2SizeSpec,
                spec: spec,
                margin,
                marginPreserve
            });

            const marginSide = getMarginSide(margin);
            if (marginSide === 'center') {
                child.classList.push('text-center');
            } else if (marginSide === 'end') {
                child.classList.push('text-right');
            }
        }

        makeSingleLineTextEllipsis(child);
    } else if (isMultiLineText(child)) {
        // 多行文本没法扩充，因为是按行数截断的

        assert(dimension === 'height', '多行文本超出省略只能是纵向');

        const isJustify = !expandAuto2SizeSpec;
        // justify的直接auto撑开, 相当于固定高度了
        if (!isJustify) {
            const lineHeight = getTextFZLH(child).lineHeight;
            // 多行文本超出，下面最少预留多宽，默认一个字宽
            const marginPreserve = lineHeight;
            expandAutoForOverflow({
                child,
                expandAuto2SizeSpec,
                spec: spec,
                margin,
                marginPreserve,
                expandEndOnly: true
            });
        }

        makeMultiLineTextClamp(child);
    }
}

/** 设置列表元素内容超出滚动 */
function setListOverflowAuto(params: {
    child: VNode;
    spec: DimensionSpec;
    dimension: Dimension;
    margin: Margin;
    expandAuto2SizeSpec?: SizeSpec.Fixed | SizeSpec.Constrained;
}) {
    const { spec, dimension, margin, expandAuto2SizeSpec } = params;
    let { child } = params;

    const marginPreserve = 10; // 先给10吧

    if (isListXContainer(child) || isListYContainer(child)) {
        if (isListXContainer(child)) {
            assert(dimension === 'width', '横向列表超出滚动只能是横向');
        } else {
            assert(dimension === 'height', '纵向列表超出滚动只能是纵向');
        }

        const isJustify = !expandAuto2SizeSpec;
        // justify的直接auto撑开，给个overflow-auto就行
        if (!isJustify) {
            expandAutoForOverflow({
                child,
                expandAuto2SizeSpec,
                spec: spec,
                margin,
                marginPreserve
            });
        }

        const marginSide = getMarginSide(margin);
        if (marginSide === 'center') {
            child.classList.push('justify-center');
        } else if (marginSide === 'end') {
            child.classList.push('justify-end');
        }

        makeListOverflowAuto(child, dimension);
    } else {
        assert(isListWrapContainer(child) && dimension === 'height', 'flexWrap只有纵向才能超出滚动');

        const isJustify = !expandAuto2SizeSpec;
        // justify的直接auto撑开，给个overflow-auto就行
        if (!isJustify) {
            expandAutoForOverflow({
                child,
                expandAuto2SizeSpec,
                spec: spec,
                margin,
                marginPreserve,
                expandEndOnly: true
            });
        }

        child.classList.push('overflow-y-auto');
    }
}

/** 为可能溢出的子节点限制尺寸 */
export function expandOverflowChild(params: {
    child: VNode;
    spec: DimensionSpec;
    dimension: Dimension;
    margin: Margin;
    expandAuto2SizeSpec?: SizeSpec.Fixed | SizeSpec.Constrained;
}) {
    const { child, spec, dimension, margin, expandAuto2SizeSpec } = params;

    // 处理auto元素的最大宽度
    if (
        (spec === 'widthSpec' && isSingleLineText(child)) ||
        (spec === 'heightSpec' && isMultiLineText(child))
    ) {
        defaultConfig.codeGenOptions.textClamp &&
            setTextClamp({
                child,
                spec,
                dimension,
                margin,
                expandAuto2SizeSpec
            });
    } else if (
        (spec === 'widthSpec' && isListXContainer(child)) ||
        (spec === 'heightSpec' && isListYContainer(child)) ||
        (spec === 'heightSpec' && isListWrapContainer(child))
    ) {
        defaultConfig.codeGenOptions.listOverflowAuto &&
            setListOverflowAuto({
                child,
                spec,
                dimension,
                margin,
                expandAuto2SizeSpec
            });
    }
}

/** auto元素是否能被截断 */
export function autoMaybeClamp(child: VNode, spec: DimensionSpec) {
    return (
        (spec === 'widthSpec' && isSingleLineText(child)) ||
        (spec === 'widthSpec' && isListXContainer(child)) ||
        (spec === 'heightSpec' && isListYContainer(child)) ||
        (spec === 'heightSpec' && isFlexWrapLike(child))
    );
}

/** 单行文本超出，两边最少预留多宽，默认半个字宽 */
export function getSingleLinePreserveMargin(textVNode: VNode) {
    return getTextFZLH(textVNode).fontSize / 2;
}
