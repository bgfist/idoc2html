import * as _ from 'lodash';
import { SizeSpec, VNode, isEqualBox, isGeneratedNode, isListWrapContainer, isTextNode } from '../vnode';

/** 合并节点 */
export function mergeNode(dest: VNode, src: VNode) {
    if (isTextNode(dest)) {
        console.warn('其他节点往文本节点合并，只能当作依附元素');
        (dest.attachNodes ??= []).push(src);
        return;
    }

    if (isTextNode(src)) {
        console.warn('文本节点往其他节点合并');
        dest.textContent = src.textContent;
        dest.textMultiLine = src.textMultiLine;

        if (dest.children) {
            _.remove(dest.children, src);
            if (dest.children.length) {
                console.warn('其他节点只能当作依附元素');
                (dest.attachNodes ??= []).push(...(src.attachNodes || []).slice());
                dest.children.length = 0;
            }
        }
    }

    // 这里要合并样式，将src合并到dest
    if (src.id) {
        dest.id = src.id;
    }
    dest.tagName = src.tagName;
    dest.classList = _.union(dest.classList, src.classList);

    if (src.widthSpec && dest.widthSpec !== SizeSpec.Fixed) {
        // 尺寸固定的元素不能被覆盖
        dest.widthSpec = src.widthSpec;
    }
    if (src.heightSpec && dest.heightSpec !== SizeSpec.Fixed) {
        dest.heightSpec = src.heightSpec;
    }

    dest.style = _.merge(dest.style, src.style);
    dest.attributes = _.merge(dest.attributes, src.attributes);
    dest.role = _.merge(dest.role, src.role);
    dest.direction = src.direction;
    dest.attachNodes = _.union(dest.attachNodes, src.attachNodes);
}

/** 提前先把和父盒子一样大的消掉 */
export function mergeUnnessaryNodes(parent: VNode) {
    const { children } = parent;

    if (!children.length) {
        return;
    }

    const childIdx = _.findIndex(children, child => isEqualBox(parent, child));
    if (childIdx === -1) {
        return;
    }

    const child = children[childIdx];
    console.debug('合并跟父亲一样大的盒子');
    mergeNode(parent, child);
    children.splice(childIdx, 1, ...(child.children || []));

    // 继续移除，这里也可以不加，防止有几个相同大小的盒子连续嵌套
    mergeUnnessaryNodes(parent);
}

/** 移除不必要的中间flex盒子 */
export function mergeUnnessaryFlexBox(parent: VNode) {
    const { children } = parent;

    if (children.length !== 1) {
        return;
    }

    const child = children[0];

    // 先不处理多行列表，margin有问题
    if (isListWrapContainer(child)) {
        return;
    }

    // 只需要合并一层

    // 子盒子可以扩大
    if (
        child.direction &&
        child.heightSpec !== SizeSpec.Fixed &&
        child.widthSpec !== SizeSpec.Fixed &&
        isGeneratedNode(child)
    ) {
        mergeNode(parent, child);
        parent.children = child.children;
    }
}
