import _ from 'lodash';
import { VNode } from '../../vnode';

export function generateClassDecls(vnode: VNode) {
    const decls: Decls = {};

    generateForNode(vnode, decls);

    let children = _.concat(vnode.children, vnode.attachNodes);
    if (_.isArray(vnode.textContent)) {
        children = _.concat(children, vnode.textContent);
    }
    _.each(children, child => generateForNode(child, decls));
}

type Decls = Record<string, string>;

function addDecl(decls: Decls, decl: string, rules: string) {
    if (!decls[decl]) {
        decls[decl] = rules;
    }
}

function generateForNode(vnode: VNode, decls: Decls) {
    _.each(vnode.classList, className => generateForClass(className, decls));
}

function generateForClass(className: string, decls: Decls) {
    if (className.startsWith('w-')) {
    } else if (className.startsWith('h-')) {
    } else if (className.startsWith('m')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    } else if (className.startsWith('p')) {
    }
}
