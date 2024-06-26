import * as _ from 'lodash';
import {
    Dimension,
    DimensionSpec,
    Direction,
    R,
    R2,
    SizeSpec,
    VNode,
    getBorderWidth,
    getClassList,
    isImageOrSliceNode,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    isMultiLineText,
    isMultiLineTextBr,
    isRootNode,
    isSingleLineText,
    isTextNode,
    makeMultiLineTextClamp,
    makeSingleLineTextEllipsis,
    makeSingleLineTextNoWrap,
    maybeIsCenter,
    normalizeClassName
} from '../vnode';
import { anyElesIn, numEq } from '../utils';
import { measureFlexAlign } from './measureFlexAlign';
import { measureFlexJustify } from './measureFlexJustify';
import { defaultConfig } from '../main/config';

/** 计算flexbox布局 */
export function measureTree(vnode: VNode) {
    // TODO: 前面会创建一些幽灵盒子，都是flex容器，需尝试扩大容器
    // expandGhostNodes(vnode);

    // 从根节点开始，根节点宽高都是弹性尺寸
    measureFlexLayout(vnode);
    // 计算好自身的尺寸，才能计算绝对定位元素的尺寸
    measureAttachPosition(vnode);

    _.each(vnode.children, measureTree);

    // 让文本节点层级高一些
    const [textNodes, otherNodes] = _.partition(vnode.attachNodes, isTextNode);
    vnode.attachNodes = [...otherNodes, ...textNodes];
    _.each(vnode.attachNodes, measureTree);
}

/** 生成flexbox布局 */
function measureFlexLayout(parent: VNode) {
    if (parent.children?.length) {
        parent.classList.push('flex');
        if (parent.direction === Direction.Column) {
            parent.classList.push('flex-col');
        }

        // TODO: 列表元素应保持高度一致，包括其flex对齐方式
        if (isListWrapContainer(parent)) {
            measureFlexWrapLayout(parent);
        } else if (isListXContainer(parent) || isListYContainer(parent)) {
            measureFlexListLayout(parent);
        } else {
            measureFlexAlign(parent);
            measureFlexJustify(parent);
        }
    }

    // TODO: 判断一下真正需要加固定宽高的元素

    if (parent.widthSpec === SizeSpec.Fixed && needSetFixSize(parent, 'widthSpec', 'width')) {
        parent.classList.push(R`w-${parent.bounds.width}`);
    }
    if (parent.heightSpec === SizeSpec.Fixed && needSetFixSize(parent, 'heightSpec', 'height')) {
        parent.classList.push(R`h-${parent.bounds.height}`);
    }

    setFixSizeTextClampIfConfigured(parent);
    makeSingleLineTextNoWrapIfNeed(parent);
}

/** 父节点的固定尺寸很可能完全由子节点撑开，则没必要设置父节点的固定尺寸 */
function needSetFixSize(parent: VNode, spec: DimensionSpec, dimension: Dimension) {
    if (isSingleLineText(parent) && spec === 'heightSpec') {
        // if (numEq(getTextFZLH(parent).lineHeight, parent.bounds.height)) {
        return false;
        // }
    }

    if (isMultiLineText(parent) && spec === 'heightSpec') {
        // 已经设置过最多显示几行，则无需设置高度
        if (parent.style['-webkit-box-orient']) {
            return false;
        }
    }

    if (!parent.children.length) {
        return true;
    }

    // 图片节点即便多余，也要显式设置一下尺寸
    if (isImageOrSliceNode(parent)) {
        if (isRootNode(parent)) {
            // TODO: 页面背景是一整张图怎么办？
        }

        return true;
    }

    // justify方向固定，还是要设置的
    if (
        (parent.direction === Direction.Row && spec === 'widthSpec') ||
        (parent.direction === Direction.Column && spec === 'heightSpec')
    ) {
        return true;
    }

    // 所有子节点都是固定尺寸，且至少有一个跟父亲尺寸一样
    if (
        _.every(parent.children, child => child[spec] === SizeSpec.Fixed) &&
        _.some(parent.children, child => numEq(child.bounds[dimension], parent.bounds[dimension]))
    ) {
        return false;
    } else {
        return true;
    }
}

/** 设置尺寸固定的文本的超出省略 */
function setFixSizeTextClampIfConfigured(textNode: VNode) {
    if (!defaultConfig.codeGenOptions.textClamp) {
        return;
    }

    if (isSingleLineText(textNode) && textNode.widthSpec === SizeSpec.Fixed) {
        makeSingleLineTextEllipsis(textNode);
    } else if (isMultiLineText(textNode) && textNode.heightSpec === SizeSpec.Fixed) {
        makeMultiLineTextClamp(textNode);
    }
}

/** 特殊情况需要让单行文本不换行 */
function makeSingleLineTextNoWrapIfNeed(parent: VNode) {
    if (parent.widthSpec === SizeSpec.Fixed) {
        if (isSingleLineText(parent)) {
            makeSingleLineTextNoWrap(parent);
        }
        // 固定宽度的按钮
        else if (
            parent.direction === Direction.Row &&
            parent.children.length === 1 &&
            isSingleLineText(parent.children[0])
        ) {
            makeSingleLineTextNoWrap(parent.children[0]);
        }
        // 固定宽度的纵向容器
        else if (parent.direction === Direction.Column) {
            _.each(parent.children, child => {
                if (isSingleLineText(child)) {
                    makeSingleLineTextNoWrap(child);
                }
            });
        }
    }
}

/** 生成绝对定位 */
function measureAttachPosition(parent: VNode) {
    const attachNodes = parent.attachNodes;
    if (!attachNodes || !attachNodes.length) {
        return;
    }
    _.each(attachNodes, attachNode => {
        const borderWidth = getBorderWidth(attachNode);

        const [left, right, top, bottom] = [
            attachNode.bounds.left - parent.bounds.left - borderWidth,
            parent.bounds.right - attachNode.bounds.right - borderWidth,
            attachNode.bounds.top - parent.bounds.top - borderWidth,
            parent.bounds.bottom - attachNode.bounds.bottom - borderWidth
        ];
        if (anyElesIn(getClassList(parent), ['relative', 'absolute', 'fixed'])) {
            // 已经脱离文档流
        } else {
            parent.classList.push('relative');
        }
        attachNode.classList.push('absolute');

        function decideAutoExpandSide(horizontal: boolean) {
            if (horizontal) {
                let leftSpace = left,
                    rightSpace = right;
                if (left < 0 && right > 0) {
                    rightSpace = parent.bounds.width - rightSpace;
                } else if (right < 0 && left > 0) {
                    leftSpace = parent.bounds.width - leftSpace;
                }
                return Math.abs(leftSpace) < Math.abs(rightSpace) ? `left-${left}` : `right-${right}`;
            } else {
                let topSpace = top,
                    bottomSpace = bottom;
                if (top < 0 && bottom > 0) {
                    bottomSpace = parent.bounds.height - bottomSpace;
                } else if (bottom < 0 && top > 0) {
                    topSpace = parent.bounds.height - topSpace;
                }
                return Math.abs(topSpace) < Math.abs(bottomSpace) ? `top-${top}` : `bottom-${bottom}`;
            }
        }

        if (attachNode.widthSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`left-${left} right-${right}`);
        } else {
            if (maybeIsCenter(left, right)) {
                // 绝对定位居中
                attachNode.classList.push('left-1/2 -translate-x-1/2');
            } else {
                attachNode.classList.push(normalizeClassName(decideAutoExpandSide(true), false));
            }
        }

        if (attachNode.heightSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`top-${top} bottom-${bottom}`);
        } else {
            if (maybeIsCenter(top, bottom)) {
                // 绝对定位居中
                attachNode.classList.push('top-1/2 -translate-y-1/2');
            } else {
                attachNode.classList.push(normalizeClassName(decideAutoExpandSide(false), false));
            }
        }
    });
}

/** 生成flex-wrap布局 */
function measureFlexWrapLayout(parent: VNode) {
    parent.classList.push('flex-wrap');
    const firstChild = parent.children[0];
    const secondChild = parent.children[1];
    const firstWrapChild = _.find(
        parent.children,
        child => !numEq(child.bounds.top, firstChild.bounds.top),
        1
    )!;

    const xGap = secondChild.bounds.left - firstChild.bounds.right;
    const yGap = firstWrapChild.bounds.top - firstChild.bounds.bottom;
    parent.classList.push(R`gap-x-${xGap} gap-y-${yGap}`);

    _.each(parent.children, child => {
        if (isMultiLineText(child) && !isMultiLineTextBr(child)) {
            child.widthSpec = SizeSpec.Fixed;
        }
    });
}

function measureFlexListLayout(parent: VNode) {
    if (isListXContainer(parent)) {
        const childHeightSpec = parent.heightSpec === SizeSpec.Fixed ? SizeSpec.Fixed : SizeSpec.Constrained;
        const highestNode = _.maxBy(parent.children, child => child.bounds.bottom)!;
        _.each(parent.children, child => {
            if (!isImageOrSliceNode(child)) {
                child.heightSpec = childHeightSpec;
                child.bounds.top = highestNode.bounds.top;
                child.bounds.bottom = highestNode.bounds.bottom;
                child.bounds.height = highestNode.bounds.height;
            }

            if (isMultiLineText(child) && !isMultiLineTextBr(child)) {
                child.widthSpec = SizeSpec.Fixed;
            } else if (!child.widthSpec) {
                child.widthSpec = SizeSpec.Fixed;
            }
        });
        const xGap = parent.children[1].bounds.left - parent.children[0].bounds.right;
        parent.classList.push(R`space-x-${xGap}`);
        if (parent.heightSpec === SizeSpec.Auto) {
            parent.classList.push(R`min-h-${parent.bounds.height}`);
        }
    } else if (isListYContainer(parent)) {
        const childWidthSpec = parent.widthSpec === SizeSpec.Fixed ? SizeSpec.Fixed : SizeSpec.Constrained;
        const widestChild = _.maxBy(parent.children, child => child.bounds.width)!;
        _.each(parent.children, child => {
            if (!isImageOrSliceNode(child)) {
                child.widthSpec = childWidthSpec;
                child.bounds.left = widestChild.bounds.left;
                child.bounds.right = widestChild.bounds.right;
                child.bounds.width = widestChild.bounds.width;
            }

            if (!child.heightSpec) {
                child.heightSpec = SizeSpec.Fixed;
            }
        });
        const yGap = parent.children[1].bounds.top - parent.children[0].bounds.bottom;
        parent.classList.push(R`space-y-${yGap}`);
        if (parent.widthSpec === SizeSpec.Auto) {
            parent.classList.push(R`min-w-${parent.bounds.width}`);
        }
    }
}

/** 给列表元素的文本节点扩充宽度 */
// function expandItemRoomForListX(vnode: VNode, isItemGroup: boolean, leftAvailableRoom: number, rightAvailableRoom: number) {
//     // 中线均匀，需要把每个item的宽度设置成一样的
//     const middleLineGap = getListXItemMiddleLineGap(vnode);
//     const itemNode = vnode.children[0];

//     if (isItemGroup) {
//         // 只考虑文本节点在右边的扩充
//         const lastChild = _.last(itemNode.children)!;

//         if (
//             isTextNode(lastChild) &&
//             _.every(vnode.children.slice(0, -1), vnode => vnode.widthSpec === SizeSpec.Fixed)
//         ) {
//             // 往右边扩充
//             const rightWidth = rightAvailableRoom + lastChild.bounds.width;
//             const newWidth = Math.min(middleLineGap * 0.8, rightWidth);
//             _.each(vnode.children, child => {
//                 const textNode = _.last(child.children)!;
//                 textNode.widthSpec = SizeSpec.Fixed;
//                 const widthDiff = newWidth - child.bounds.width;
//                 child.bounds.width = newWidth;
//                 child.bounds.right += widthDiff;
//             });
//         } else if (!_.every(vnode.children, vnode => vnode.widthSpec === SizeSpec.Fixed)) {
//             console.warn('横向列表元素无法自动扩充空间');
//         }
//     } else if (isTextNode(itemNode)) {
//         // 往两边扩充
//         const leftWidth = leftAvailableRoom + _.first(vnode.children)!.bounds.width / 2;
//         const rightWidth = rightAvailableRoom + _.last(vnode.children)!.bounds.width / 2;
//         // TODO: 文本靠太近，甚至已经小于20%的间距？
//         const halfWidth = Math.min(middleLineGap * 0.4, leftWidth, rightWidth);
//         const newWidth = halfWidth * 2;
//         _.each(vnode.children, child => {
//             child.widthSpec = SizeSpec.Fixed;
//             child.classList.push('text-center');
//             const widthDiff = newWidth - child.bounds.width;
//             child.bounds.width = newWidth;
//             child.bounds.left -= widthDiff / 2;
//             child.bounds.right += widthDiff / 2;
//         });
//     }
// }
