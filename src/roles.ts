import { addRole, getClassName, isEqualBox, isTextNode } from "./helpers";
import { numEq } from "./utils";
import { SizeSpec, VNode, context } from "./vnode";

/** 判断节点是不是分隔线 */
export function maybeDivider(vnode: VNode) {
    if (numEq(vnode.bounds.width, 1) && vnode.bounds.height >= 20) {
        addRole(vnode, 'divider');
        vnode.widthSpec = SizeSpec.Fixed;
        vnode.heightSpec = SizeSpec.Constrained;
        return true;
    } else if (numEq(vnode.bounds.height, 1) && vnode.bounds.width >= 20) {
        addRole(vnode, 'divider');
        vnode.widthSpec = SizeSpec.Constrained;
        vnode.heightSpec = SizeSpec.Fixed;
        return true;
    }
    return false;
}

/** 判断节点是不是边框 */
export function maybeBorder(child: VNode, parent: VNode) {
    if (numEq(child.bounds.width, 1)) {
        const attachLeftOrRight = numEq(child.bounds.left, parent.bounds.left) || numEq(child.bounds.right, parent.bounds.right);

        if (attachLeftOrRight) {
            addRole(child, 'border');
            child.widthSpec = SizeSpec.Fixed;
            child.heightSpec = SizeSpec.Constrained;
            return true;
        }
    } else if (numEq(child.bounds.height, 1)) {
        const attachTopOrBottom = numEq(child.bounds.top, parent.bounds.top) || numEq(child.bounds.bottom, parent.bounds.bottom);

        if (attachTopOrBottom) {
            addRole(child, 'border');
            child.widthSpec = SizeSpec.Constrained;
            child.heightSpec = SizeSpec.Fixed;
            return true;
        }
    }
}

/** 判断节点是不是内联按钮，这种有交互的节点不一定能自动扩充 */
export function maybeInlineButton(vnode: VNode) {
    // 按钮要么宽度固定，要么内容撑开，宽度不能用Constrained
    if (vnode.children.length !== 1) {
        return false;
    }
    const onlyChild = vnode.children[0];

    if (
        isTextNode(onlyChild) &&
        vnode.bounds.width < Math.min(context.root.bounds.width, context.root.bounds.height) / 2 &&
        vnode.bounds.height <= onlyChild.bounds.height * 3
    ) {
        addRole(vnode, 'btn');
        return true;
    }
}

/** 文字下面有下划线，可能是tab下的选中状态 */
export function maybeTabLine(vnode: VNode) {

}

/** 弹窗不透明蒙层 */
export function maybeDialogMask(vnode: VNode) {
    return (
        isEqualBox(vnode, context.root) &&
        getClassName(vnode).indexOf('bg-[hsla(0,0%,0%,0.)') !== -1
    );
}