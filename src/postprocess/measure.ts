import * as _ from 'lodash';
import {
    Dimension,
    DimensionSpec,
    Direction,
    R,
    R2,
    SizeSpec,
    VNode,
    getClassList,
    isFixSizeOriginalNode,
    isImageOrSliceNode,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    isMultiLineText,
    isRootNode,
    isSingleLineText,
    makeMultiLineTextClamp,
    makeSingleLineTextEllipsis,
    makeSingleLineTextNoWrap,
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
    _.each(vnode.attachNodes, measureTree);
}

/** 生成flexbox布局 */
function measureFlexLayout(parent: VNode) {
    if (parent.children?.length) {
        parent.classList.push('flex');
        if (parent.direction === Direction.Column) {
            parent.classList.push('flex-col');
        }

        if (isListWrapContainer(parent)) {
            measureFlexWrapLayout(parent);
        } else {
            measureFlexAlign(parent);
            measureFlexJustify(parent);
        }
    }

    // TODO: 判断一下真正需要加固定宽高的元素

    if (parent.widthSpec === SizeSpec.Fixed && needSetFixSize(parent, 'widthSpec', 'width')) {
        parent.classList.push(R`w-${parent.bounds.width}`);
    }
    if (
        parent.heightSpec === SizeSpec.Fixed &&
        !isSingleLineText(parent) &&
        needSetFixSize(parent, 'heightSpec', 'height')
    ) {
        parent.classList.push(R`h-${parent.bounds.height}`);
    }

    setFixSizeTextClampIfConfigured(parent);
    makeSingleLineTextNoWrapIfNeed(parent);
}

/** 父节点的固定尺寸很可能完全由子节点撑开，则没必要设置父节点的固定尺寸 */
function needSetFixSize(parent: VNode, spec: DimensionSpec, dimension: Dimension) {
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
        // 固定宽度的按钮
        if (
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
        const [left, right, top, bottom] = [
            attachNode.bounds.left - parent.bounds.left,
            parent.bounds.right - attachNode.bounds.right,
            attachNode.bounds.top - parent.bounds.top,
            parent.bounds.bottom - attachNode.bounds.bottom
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
            if (attachNode.widthSpec === SizeSpec.Fixed && numEq(left, right)) {
                // 绝对定位居中
                attachNode.classList.push('left-1/2 -translate-x-1/2');
            } else {
                attachNode.classList.push(normalizeClassName(decideAutoExpandSide(true), false));
            }
        }

        if (attachNode.heightSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`top-${top} bottom-${bottom}`);
        } else {
            if (attachNode.heightSpec === SizeSpec.Fixed && numEq(top, bottom)) {
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

    _.each(parent.children, child => {
        child.classList.push(R`mr-${xGap} mb-${yGap}`);
    });
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
