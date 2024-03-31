import _ from 'lodash';
import { defaultConfig } from '../main';
import { VNode } from '../vnode';
import { isTextNode } from './helpers';
import { Node } from './page';

export function processZIndex(node: Node, vnode: VNode) {
    const [hasRight, noRight] = _.partition(node.children, n => 'right' in n.bounds);

    if (hasRight.length) {
        node.children = hasRight
            .reverse()
            .map((n, i) => {
                // @ts-ignore
                n._index = i + 1;
                return n;
            })
            .concat(
                noRight.map(n => {
                    if (isTextNode(n)) {
                        // @ts-ignore
                        n._index = 10;
                    }
                    return n;
                })
            );
    }
    // @ts-ignore
    if (node._index) {
        // @ts-ignore
        vnode.classList.push(`z-${node._index}`);
    }
}
