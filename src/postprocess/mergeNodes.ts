import * as _ from 'lodash';
import {
    SizeSpec,
    VNode,
    getClassList,
    isEqualBox,
    isGeneratedNode,
    isListContainer,
    isListWrapContainer,
    isTextNode
} from '../vnode';
import { removeEle } from '../utils';

function mergeClassList(dest: VNode, src: VNode) {
    let destClassList = getClassList(dest);
    let srcClassList = getClassList(src);

    const destZIndexClass = destClassList.find(c => c.startsWith('z-'));
    const srcZIndexClass = srcClassList.find(c => c.startsWith('z-'));
    const destZIndex = destZIndexClass ? parseInt(destZIndexClass.slice(2)) : 0;
    const srcZIndex = srcZIndexClass ? parseInt(srcZIndexClass.slice(2)) : 0;

    if (destZIndex > srcZIndex) {
        // dest的层级更高，换过来
        const tmp = destClassList;
        destClassList = srcClassList;
        srcClassList = tmp;
    }

    // 移除冲突的zIndex
    if (destZIndex && srcZIndex) {
        _.remove(destClassList, c => c.startsWith('z-'));
    }

    // 移除冲突的bg
    if (_.some(destClassList, c => c.startsWith('bg-')) && _.some(srcClassList, c => c.startsWith('bg-'))) {
        _.remove(
            destClassList,
            c => c.startsWith('bg-') || c.startsWith('from-') || c.startsWith('to-') || c.startsWith('via-')
        );
    }

    // 移除冲突的border
    if (
        _.some(destClassList, c => c.startsWith('border-')) &&
        _.some(srcClassList, c => c.startsWith('border-'))
    ) {
        _.remove(destClassList, c => c.startsWith('border-'));
    }

    // 移除冲突的round
    if (
        _.some(destClassList, c => c.startsWith('rounded-')) &&
        _.some(srcClassList, c => c.startsWith('rounded-'))
    ) {
        _.remove(destClassList, c => c.startsWith('rounded-'));
    }

    dest.classList = _.union(destClassList, srcClassList);
}

/** 合并节点 */
export function mergeNode(dest: VNode, src: VNode) {
    if (isTextNode(dest)) {
        console.warn('其他节点往文本节点合并，只能当作依附元素');
        dest.attachNodes.push(src);
        return;
    }

    if (isTextNode(src)) {
        console.warn('文本节点往其他节点合并');
        dest.textContent = src.textContent;
        dest.textMultiLine = src.textMultiLine;

        if (dest.children) {
            removeEle(dest.children, src);
            if (dest.children.length) {
                console.warn('其他节点只能当作依附元素');
                dest.attachNodes.push(...src.attachNodes.slice());
                dest.children.length = 0;
            }
        }
    }

    // 这里要合并样式，将src合并到dest
    if (src.id) {
        dest.id = src.id;
    }
    dest.tagName = src.tagName;

    mergeClassList(dest, src);

    if (src.widthSpec && dest.widthSpec !== SizeSpec.Fixed) {
        // 尺寸固定的元素不能被覆盖
        dest.widthSpec = src.widthSpec;
    }
    if (src.heightSpec && dest.heightSpec !== SizeSpec.Fixed) {
        dest.heightSpec = src.heightSpec;
    }

    dest.style = _.merge(dest.style, src.style);
    dest.attributes = _.merge(dest.attributes, src.attributes);
    dest.role = _.union(dest.role, src.role);
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

    // 只需要合并一层
    // 子盒子可以扩大
    if (
        child.direction &&
        child.heightSpec !== SizeSpec.Fixed &&
        child.widthSpec !== SizeSpec.Fixed &&
        isGeneratedNode(child) &&
        !isListContainer(child)
    ) {
        mergeNode(parent, child);
        parent.children = child.children;
    }
}
