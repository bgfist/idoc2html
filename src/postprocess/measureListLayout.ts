import * as _ from 'lodash';
import { numEq } from '../utils';
import { R, SizeSpec, VNode, isListXContainer, isListYContainer } from '../vnode';

/** 生成flex-wrap布局 */
export function measureFlexWrapLayout(parent: VNode) {
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
        child.classList.push(R`ml-${xGap} mt-${yGap}`);
    });
}

/**
 * 生成列表布局
 * @deprecated 直接用flex量
 */
export function measureFlexListLayout(parent: VNode) {
    const firstChild = parent.children[0];
    const secondChild = parent.children[1];

    if (isListXContainer(parent)) {
        const xGap = secondChild.bounds.left - firstChild.bounds.right;
        parent.classList.push(R`space-x-${xGap}`);

        if (parent.heightSpec === SizeSpec.Constrained) {
            _.each(parent.children, child => {
                if (child.heightSpec !== SizeSpec.Fixed) {
                    child.heightSpec = SizeSpec.Constrained;
                }
            });
        }
    } else if (isListYContainer(parent)) {
        const yGap = secondChild.bounds.top - firstChild.bounds.bottom;
        parent.classList.push(R`space-y-${yGap}`);

        if (parent.widthSpec === SizeSpec.Constrained) {
            _.each(parent.children, child => {
                if (child.widthSpec !== SizeSpec.Fixed) {
                    child.widthSpec = SizeSpec.Constrained;
                }
            });
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
