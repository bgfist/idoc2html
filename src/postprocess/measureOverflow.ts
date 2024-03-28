import _ from 'lodash';
import { assert, numEq, removeEle, replaceWith } from '../utils';
import {
    VNode,
    getClassName,
    SizeSpec,
    isListXContainer,
    isListYContainer,
    isGeneratedNode,
    isMultiLineText,
    DimensionSpec,
    newVNode,
    Direction,
    Dimension,
    isSingleLineText,
    R,
    makeSingleLineTextEllipsis,
    getMultiLineTextLineHeight,
    makeMultiLineTextClamp,
    isListWrapContainer,
    isFlexWrapLike,
    Side,
    context,
    isOverflowWrapped
} from '../vnode';
import { defaultConfig } from '../config';

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

/** 检查是否需要包一层超出容器 */
function checkNeedOverflowWrapper(
    child: VNode,
    margin: Margin,
    expandAuto2SizeSpec: SizeSpec.Fixed | SizeSpec.Constrained,
    isJustify?: boolean
) {
    // 固定宽度不需要包一层
    if (expandAuto2SizeSpec === SizeSpec.Fixed) {
        return false;
    }
    // 无背景的列表直接扩充就行
    if ((isListXContainer(child) || isListYContainer(child)) && isGeneratedNode(child)) {
        return false;
    }
    // 多行文本包了也没用
    if (isMultiLineText(child)) {
        return false;
    }
    // justify单行文本必须包
    if (isJustify && isSingleLineText(child)) {
        return true;
    }
    // 无边距不需要包一层
    if (numEq(margin.marginStart, 0) && numEq(margin.marginEnd, 0)) {
        return false;
    }
    return true;
}

/** 扩充auto尺寸 */
function expandAutoForOverflow(params: {
    child: VNode;
    expandAuto2SizeSpec: SizeSpec.Fixed | SizeSpec.Constrained;
    spec: DimensionSpec;
    margin: Margin;
    marginPreserve: number;
    expandEndOnly?: boolean;
    keepOriginalStyle?: boolean;
    isJustify?: boolean;
}) {
    const {
        child,
        expandAuto2SizeSpec,
        spec,
        margin,
        marginPreserve,
        expandEndOnly,
        keepOriginalStyle,
        isJustify
    } = params;

    // 开始扩充容器
    child[spec] = expandAuto2SizeSpec;
    const originalBounds = _.clone(child.bounds);

    const marginSide = getMarginSide(margin);
    const startMargin =
        marginSide === 'center' ? Math.min(marginPreserve, margin.marginStart)
        : marginSide === 'start' || expandEndOnly ? margin.marginStart
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

    // 设置最大溢出尺寸
    const maxSize =
        expandAuto2SizeSpec === SizeSpec.Constrained ? 'full'
        : spec === 'widthSpec' ? child.bounds.width
        : child.bounds.height;

    let wrapperNode: VNode | null = null;
    // 检查是否需要包一层
    if (checkNeedOverflowWrapper(child, margin, expandAuto2SizeSpec, isJustify)) {
        // 文本居中会由wrapperNode以justify-center的方式实现
        wrapperNode = newVNode({
            bounds: _.clone(child.bounds),
            widthSpec: child.widthSpec,
            heightSpec: child.heightSpec,
            direction: spec === 'widthSpec' ? Direction.Row : Direction.Column
        });
        // 保留容器的背景样式
        if (keepOriginalStyle) {
            wrapperNode.classList = _.union(wrapperNode.classList, child.classList);
            child.classList = [];
            wrapperNode.style = _.merge(wrapperNode.style, child.style);
            child.style = {};
        }
        child.bounds = originalBounds;
        child[spec] = SizeSpec.Auto;
        child.classList.push(context.overflowWrapedMarker);
        wrapperNode.children = [_.clone(child)];
    }

    return { wrapperNode, maxSize };
}

/** 设置文本超出省略 */
function setTextClamp(params: {
    child: VNode;
    spec: DimensionSpec;
    dimension: Dimension;
    margin: Margin;
    expandAuto2SizeSpec: SizeSpec.Fixed | SizeSpec.Constrained;
    isJustify?: boolean;
}) {
    const { spec, dimension, margin, expandAuto2SizeSpec, isJustify } = params;
    let { child } = params;

    if (isSingleLineText(child)) {
        assert(dimension === 'width', '单行文本超出省略只能是横向');

        const marginPreserve = getSingleLinePreserveMargin(child);
        const res = expandAutoForOverflow({
            child,
            expandAuto2SizeSpec,
            spec: spec,
            margin,
            marginPreserve,
            isJustify
        });
        const maxWidth = res.maxSize;
        // 这里原本的居中属性会由flex管理
        if (res.wrapperNode) {
            replaceWith(child, res.wrapperNode);
            child = res.wrapperNode.children[0];
        }
        // 这里原本的居中属性得由text-align管理
        else {
            const marginSide = getMarginSide(margin);
            if (marginSide === 'center') {
                child.classList.push('text-center');
            } else if (marginSide === 'end') {
                child.classList.push('text-right');
            }
        }

        // 固定宽度会统一设置
        if (expandAuto2SizeSpec === SizeSpec.Fixed) {
            return;
        }

        child.classList.push(R`max-w-${maxWidth}`);
        makeSingleLineTextEllipsis(child);
    } else if (isMultiLineText(child)) {
        // 多行文本没法扩充，因为是按行数截断的

        assert(dimension === 'height', '多行文本超出省略只能是纵向');

        const lineHeight = getMultiLineTextLineHeight(child);
        // 多行文本超出，下面最少预留多宽，默认一个字宽
        const marginPreserve = lineHeight;
        expandAutoForOverflow({
            child,
            expandAuto2SizeSpec,
            spec: spec,
            margin,
            marginPreserve
        });

        // 固定宽度会统一设置
        if (expandAuto2SizeSpec === SizeSpec.Fixed) {
            return;
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
    expandAuto2SizeSpec: SizeSpec.Fixed | SizeSpec.Constrained;
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

        const res = expandAutoForOverflow({
            child,
            expandAuto2SizeSpec,
            spec: spec,
            margin,
            marginPreserve,
            keepOriginalStyle: true
        });
        if (res.wrapperNode) {
            replaceWith(child, res.wrapperNode);
            child = res.wrapperNode.children[0];
            child.classList.push(`max-${dimension === 'width' ? 'w' : 'h'}-full`);
            return;
        }

        child.classList.push(R`overflow-${dimension === 'width' ? 'x' : 'y'}-auto`);
        // TODO: 是否可以给一个utility-class，child:shrink-0
        _.each(child.children, son => {
            son.classList.push('shrink-0');
        });
    } else {
        assert(isListWrapContainer(child) && dimension === 'height', 'flexWrap只有纵向才能超出滚动');

        const res = expandAutoForOverflow({
            child,
            expandAuto2SizeSpec,
            spec: spec,
            margin,
            marginPreserve,
            keepOriginalStyle: true,
            expandEndOnly: true
        });
        if (res.wrapperNode) {
            replaceWith(child, res.wrapperNode);
            child = res.wrapperNode.children[0];
            child.classList.push('max-h-full');
            return;
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
    expandAuto2SizeSpec: SizeSpec.Fixed | SizeSpec.Constrained;
    isJustify?: boolean;
}) {
    const { child, spec, dimension, margin, expandAuto2SizeSpec, isJustify } = params;

    // 已经包装过一层了
    if (isOverflowWrapped(child)) {
        removeEle(child.classList, context.overflowWrapedMarker);
        return;
    }

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
                expandAuto2SizeSpec,
                isJustify
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
    const fontSizeMatches = getClassName(textVNode).match(/(^|\s)text-(\d+)/)!;
    return _.round(_.toNumber(fontSizeMatches[2]) / 2);
}
